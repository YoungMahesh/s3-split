import crypto from "node:crypto";
import { db } from "@/db";
import { managedBucket, managedObjects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveClientKey, touchClientKeyLastUsed } from "@/lib/client-key";
import {
  parseSigV4AuthHeader,
  verifySigV4Signature,
  signS3Request,
  buildS3XmlError,
} from "./sigv4";
import {
  createMultipartUploadRecord,
  getMultipartUpload,
  getPendingReservations,
  savePartReservation,
  completeMultipartUploadRecord,
  abortMultipartUploadRecord,
  cleanupExpiredMultipartUploads,
  transformInitiateMultipartUploadXml,
  transformCompleteMultipartUploadXml,
  extractUploadIdFromXml,
  extractEtagFromXml,
} from "./multipart";

export interface GatewayContext {
  bucketName: string;
  objectKey: string;
}

function md5Hex(data: Buffer | string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

function xmlResponse(errorResult: {
  body: string;
  status: number;
  headers: Record<string, string>;
}): Response {
  return new Response(errorResult.body, {
    status: errorResult.status,
    headers: errorResult.headers,
  });
}

/**
 * Strips virtual prefix from ListObjectsV2 XML response and rewrites the bucket name.
 */
export function transformListObjectsV2Xml(
  rawXml: string,
  bucketName: string,
  virtualPrefix?: string | null,
): string {
  // Replace bucket name
  let xml = rawXml.replace(
    /<Name>([\s\S]*?)<\/Name>/i,
    `<Name>${bucketName}</Name>`,
  );

  if (!virtualPrefix) {
    return xml;
  }

  const vp = virtualPrefix.endsWith("/") ? virtualPrefix : `${virtualPrefix}/`;

  // Strip prefix from <Prefix>
  xml = xml.replace(
    /<Prefix>([\s\S]*?)<\/Prefix>/gi,
    (_match, p1) => {
      const trimmed = p1.trim();
      if (trimmed.startsWith(vp)) {
        return `<Prefix>${trimmed.slice(vp.length)}</Prefix>`;
      }
      if (trimmed === vp) {
        return `<Prefix></Prefix>`;
      }
      return `<Prefix>${trimmed}</Prefix>`;
    },
  );

  // Strip prefix from <StartAfter>
  xml = xml.replace(
    /<StartAfter>([\s\S]*?)<\/StartAfter>/gi,
    (_match, p1) => {
      const trimmed = p1.trim();
      if (trimmed.startsWith(vp)) {
        return `<StartAfter>${trimmed.slice(vp.length)}</StartAfter>`;
      }
      return `<StartAfter>${trimmed}</StartAfter>`;
    },
  );

  // Strip prefix from <CommonPrefixes><Prefix>
  xml = xml.replace(
    /<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>\s*<\/CommonPrefixes>/gi,
    (_match, p1) => {
      const trimmed = p1.trim();
      if (trimmed.startsWith(vp)) {
        const stripped = trimmed.slice(vp.length);
        return stripped ? `<CommonPrefixes><Prefix>${stripped}</Prefix></CommonPrefixes>` : "";
      }
      return _match;
    },
  );

  // Process <Contents> items: strip prefix or omit empty folder markers
  xml = xml.replace(/<Contents>([\s\S]*?)<\/Contents>/gi, (match, contentXml) => {
    const keyMatch = contentXml.match(/<Key>([\s\S]*?)<\/Key>/i);
    if (!keyMatch) {
      return match;
    }
    const rawKey = keyMatch[1].trim();

    if (rawKey.startsWith(vp)) {
      const relativeKey = rawKey.slice(vp.length);
      // Omit directory root marker
      if (!relativeKey) {
        return "";
      }
      return `<Contents>${contentXml.replace(
        /<Key>[\s\S]*?<\/Key>/i,
        `<Key>${relativeKey}</Key>`,
      )}</Contents>`;
    }

    return "";
  });

  return xml;
}

/**
 * Dispatches an incoming HTTP request through the S3 Gateway Proxy.
 */
export async function handleS3GatewayRequest(
  request: Request,
  context: GatewayContext,
): Promise<Response> {
  const { bucketName, objectKey } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  // 1. Parse SigV4 Authorization Header
  const authHeader = request.headers.get("authorization");
  const auth = parseSigV4AuthHeader(authHeader);

  if (!auth) {
    return xmlResponse(
      buildS3XmlError(
        "AccessDenied",
        "Missing or invalid AWS Signature Version 4 Authorization header.",
        url.pathname,
      ),
    );
  }

  // 2. Resolve Client Key
  const clientKeyRecord = await resolveClientKey(auth.accessKeyId);
  if (!clientKeyRecord) {
    return xmlResponse(
      buildS3XmlError(
        "InvalidAccessKeyId",
        "The AWS Access Key Id you provided does not exist in our records.",
        url.pathname,
        { AWSAccessKeyId: auth.accessKeyId },
      ),
    );
  }

  // 3. Verify Bucket Binding
  if (clientKeyRecord.managedBucket.name !== bucketName) {
    return xmlResponse(
      buildS3XmlError(
        "AccessDenied",
        `Access Denied: Client key is not authorized to access bucket '${bucketName}'.`,
        url.pathname,
      ),
    );
  }

  // Read body buffer for verification & streaming
  const bodyBuffer = Buffer.from(await request.arrayBuffer());

  // 4. Verify SigV4 Signature
  const sigResult = verifySigV4Signature({
    method,
    url,
    headers: request.headers,
    body: bodyBuffer,
    secretAccessKey: clientKeyRecord.secretAccessKey,
    auth,
  });

  if (!sigResult.ok) {
    return xmlResponse(
      buildS3XmlError(
        sigResult.code || "SignatureDoesNotMatch",
        sigResult.message || "The request signature we calculated does not match.",
        url.pathname,
      ),
    );
  }

  // Update last used timestamp asynchronously
  touchClientKeyLastUsed(clientKeyRecord.keyId).catch(() => {});

  // 5. Permission Scope Check (read_only vs read_write)
  if (clientKeyRecord.permission === "read_only") {
    if (method === "PUT" || method === "DELETE" || method === "POST") {
      return xmlResponse(
        buildS3XmlError(
          "AccessDenied",
          "Access Denied: Read-only client credentials cannot perform mutating operations.",
          url.pathname,
        ),
      );
    }
  }

  const { managedBucket: bucket, upstreamAccount } = clientKeyRecord;

  // Determine upstream target key and prefix
  let upstreamKey = objectKey;
  let virtualPrefix: string | null = null;

  if (bucket.bucketType === "virtual_prefix" && bucket.virtualPrefix) {
    virtualPrefix = bucket.virtualPrefix.endsWith("/")
      ? bucket.virtualPrefix
      : `${bucket.virtualPrefix}/`;
    if (objectKey) {
      upstreamKey = `${virtualPrefix}${objectKey}`;
    }
  }

  // Helper to build upstream URL
  const buildUpstreamUrl = (key?: string): URL => {
    const upstreamUrl = new URL(upstreamAccount.endpointUrl);
    const parts = [encodeURIComponent(bucket.upstreamBucket)];
    if (key) {
      parts.push(...key.split("/").map(encodeURIComponent));
    }
    upstreamUrl.pathname = `/${parts.join("/")}`;
    return upstreamUrl;
  };

  // -------------------------------------------------------------
  // Handle PUT (PutObject)
  // -------------------------------------------------------------
  if (method === "PUT") {
    if (!objectKey) {
      return xmlResponse(
        buildS3XmlError(
          "MethodNotAllowed",
          "A key name must be specified to put an object.",
          url.pathname,
        ),
      );
    }

    const uploadId = url.searchParams.get("uploadId");
    const partNumberStr = url.searchParams.get("partNumber");

    // -----------------------------------------------------------
    // Handle UploadPart (PUT with uploadId and partNumber)
    // -----------------------------------------------------------
    if (uploadId && partNumberStr) {
      const partNumber = parseInt(partNumberStr, 10);
      if (isNaN(partNumber) || partNumber < 1 || partNumber > 10000) {
        return xmlResponse(
          buildS3XmlError(
            "InvalidArgument",
            "Part number must be an integer between 1 and 10000.",
            url.pathname,
          ),
        );
      }

      // Verify multipart upload exists
      const uploadRecord = await getMultipartUpload({
        managedBucketId: bucket.id,
        uploadId,
      });

      if (!uploadRecord) {
        return xmlResponse(
          buildS3XmlError(
            "NoSuchUpload",
            "The specified multipart upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed.",
            uploadId,
          ),
        );
      }

      const incomingSize = bodyBuffer.byteLength;

      // Quota reservation check:
      // used_bytes + pending_reservations + part_size <= storage_quota_bytes
      const pendingReservations = await getPendingReservations(
        bucket.id,
        uploadId,
        partNumber,
      );
      const projectedTotal =
        bucket.usedBytes + pendingReservations + incomingSize;

      if (projectedTotal > bucket.storageQuotaBytes) {
        return xmlResponse(
          buildS3XmlError(
            "QuotaExceeded",
            `Storage quota exceeded for bucket '${bucket.name}'. Current used: ${bucket.usedBytes} bytes, Pending reservations: ${pendingReservations} bytes, Incoming part: ${incomingSize} bytes, Storage Quota: ${bucket.storageQuotaBytes} bytes.`,
            url.pathname,
          ),
        );
      }

      // Proxy part write upstream
      const upstreamUrl = buildUpstreamUrl(upstreamKey);
      upstreamUrl.searchParams.set("uploadId", uploadId);
      upstreamUrl.searchParams.set("partNumber", String(partNumber));

      const signedHeaders = signS3Request({
        method: "PUT",
        url: upstreamUrl,
        region: upstreamAccount.region,
        accessKeyId: upstreamAccount.accessKeyId,
        secretAccessKey: upstreamAccount.secretAccessKey,
        body: bodyBuffer,
        headers: {
          "content-length": String(incomingSize),
        },
      });

      let upstreamRes: Response;
      try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
          method: "PUT",
          headers: signedHeaders,
          body: bodyBuffer,
        });
      } catch {
        return xmlResponse(
          buildS3XmlError(
            "BadGateway",
            "Failed to stream multipart upload part payload to upstream S3 provider.",
            url.pathname,
          ),
        );
      }

      if (!upstreamRes.ok) {
        const errorBody = await upstreamRes.text();
        return new Response(errorBody, {
          status: upstreamRes.status,
          headers: {
            "Content-Type":
              upstreamRes.headers.get("content-type") ||
              "application/xml; charset=utf-8",
          },
        });
      }

      // Extract ETag
      const rawEtag = upstreamRes.headers.get("etag");
      const etag = rawEtag
        ? rawEtag.replace(/^"|"$/g, "")
        : md5Hex(bodyBuffer);

      // Record byte reservation
      await savePartReservation({
        managedBucketId: bucket.id,
        uploadId,
        partNumber,
        sizeBytes: incomingSize,
        etag,
      });

      return new Response(null, {
        status: 200,
        headers: {
          ETag: `"${etag}"`,
          "Content-Length": "0",
        },
      });
    }

    const incomingSize = bodyBuffer.byteLength;

    // Check existing object in local registry for net delta calculation
    const [existingObj] = await db
      .select()
      .from(managedObjects)
      .where(
        and(
          eq(managedObjects.managedBucketId, bucket.id),
          eq(managedObjects.key, objectKey),
        ),
      )
      .limit(1);

    const oldSize = existingObj ? existingObj.sizeBytes : 0;
    const netDelta = incomingSize - oldSize;
    const projectedUsedBytes = bucket.usedBytes + netDelta;

    // Quota Enforcement: strictly reject write if quota is exceeded
    if (projectedUsedBytes > bucket.storageQuotaBytes) {
      return xmlResponse(
        buildS3XmlError(
          "QuotaExceeded",
          `Storage quota exceeded for bucket '${bucket.name}'. Current: ${bucket.usedBytes} bytes, Incoming: ${incomingSize} bytes, Old: ${oldSize} bytes, Quota: ${bucket.storageQuotaBytes} bytes.`,
          url.pathname,
        ),
      );
    }

    // Proxy write upstream
    const upstreamUrl = buildUpstreamUrl(upstreamKey);
    const contentType =
      request.headers.get("content-type") || "application/octet-stream";

    const signedHeaders = signS3Request({
      method: "PUT",
      url: upstreamUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      secretAccessKey: upstreamAccount.secretAccessKey,
      body: bodyBuffer,
      headers: {
        "content-type": contentType,
        "content-length": String(incomingSize),
      },
    });

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl.toString(), {
        method: "PUT",
        headers: signedHeaders,
        body: bodyBuffer,
      });
    } catch {
      return xmlResponse(
        buildS3XmlError(
          "BadGateway",
          "Failed to stream object payload to upstream S3 provider.",
          url.pathname,
        ),
      );
    }

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.text();
      return new Response(errorBody, {
        status: upstreamRes.status,
        headers: {
          "Content-Type":
            upstreamRes.headers.get("content-type") ||
            "application/xml; charset=utf-8",
        },
      });
    }

    // Extract or compute ETag
    const rawEtag = upstreamRes.headers.get("etag");
    const etag = rawEtag ? rawEtag.replace(/^"|"$/g, "") : md5Hex(bodyBuffer);
    const newStatus =
      projectedUsedBytes >= bucket.storageQuotaBytes
        ? "quota_exceeded"
        : "active";

    // Atomically update object registry and storage quota ledger
    await db.transaction(async (tx) => {
      if (existingObj) {
        await tx
          .update(managedObjects)
          .set({
            sizeBytes: incomingSize,
            etag,
            lastModified: new Date(),
          })
          .where(eq(managedObjects.id, existingObj.id));
      } else {
        await tx.insert(managedObjects).values({
          id: crypto.randomUUID(),
          managedBucketId: bucket.id,
          key: objectKey,
          sizeBytes: incomingSize,
          etag,
          lastModified: new Date(),
        });
      }

      await tx
        .update(managedBucket)
        .set({
          usedBytes: projectedUsedBytes,
          status: newStatus,
        })
        .where(eq(managedBucket.id, bucket.id));
    });

    return new Response(null, {
      status: 200,
      headers: {
        ETag: `"${etag}"`,
        "Content-Length": "0",
      },
    });
  }

  // -------------------------------------------------------------
  // Handle DELETE (DeleteObject)
  // -------------------------------------------------------------
  if (method === "DELETE") {
    if (!objectKey) {
      return xmlResponse(
        buildS3XmlError(
          "MethodNotAllowed",
          "A key name must be specified to delete an object or abort an upload.",
          url.pathname,
        ),
      );
    }

    const uploadId = url.searchParams.get("uploadId");

    // -----------------------------------------------------------
    // Handle AbortMultipartUpload (DELETE with uploadId)
    // -----------------------------------------------------------
    if (uploadId) {
      const upstreamUrl = buildUpstreamUrl(upstreamKey);
      upstreamUrl.searchParams.set("uploadId", uploadId);

      const signedHeaders = signS3Request({
        method: "DELETE",
        url: upstreamUrl,
        region: upstreamAccount.region,
        accessKeyId: upstreamAccount.accessKeyId,
        secretAccessKey: upstreamAccount.secretAccessKey,
      });

      try {
        await fetch(upstreamUrl.toString(), {
          method: "DELETE",
          headers: signedHeaders,
        });
      } catch {
        // Upstream errors should not prevent local reservation release
      }

      await abortMultipartUploadRecord({
        managedBucketId: bucket.id,
        uploadId,
      });

      return new Response(null, {
        status: 204,
      });
    }

    // DeleteObject succeeds even when the bucket's Storage Quota is exceeded
    const upstreamUrl = buildUpstreamUrl(upstreamKey);
    const signedHeaders = signS3Request({
      method: "DELETE",
      url: upstreamUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      secretAccessKey: upstreamAccount.secretAccessKey,
    });

    try {
      await fetch(upstreamUrl.toString(), {
        method: "DELETE",
        headers: signedHeaders,
      });
    } catch {
      // Continue to clean up database even if upstream network fails or is idempotent
    }

    // Atomically decrement ledger and remove object from registry
    const [existingObj] = await db
      .select()
      .from(managedObjects)
      .where(
        and(
          eq(managedObjects.managedBucketId, bucket.id),
          eq(managedObjects.key, objectKey),
        ),
      )
      .limit(1);

    if (existingObj) {
      const freedBytes = existingObj.sizeBytes;
      const newUsed = Math.max(0, bucket.usedBytes - freedBytes);
      const newStatus =
        newUsed >= bucket.storageQuotaBytes ? "quota_exceeded" : "active";

      await db.transaction(async (tx) => {
        await tx
          .delete(managedObjects)
          .where(eq(managedObjects.id, existingObj.id));

        await tx
          .update(managedBucket)
          .set({
            usedBytes: newUsed,
            status: newStatus,
          })
          .where(eq(managedBucket.id, bucket.id));
      });
    }

    return new Response(null, {
      status: 204,
    });
  }

  // -------------------------------------------------------------
  // Handle GET (GetObject or ListObjectsV2)
  // -------------------------------------------------------------
  if (method === "GET") {
    // ListObjectsV2 (Bucket-level GET)
    if (!objectKey) {
      const upstreamUrl = buildUpstreamUrl();
      // Forward all search query parameters
      url.searchParams.forEach((val, key) => {
        upstreamUrl.searchParams.set(key, val);
      });

      // Ensure list-type is set
      if (!upstreamUrl.searchParams.has("list-type")) {
        upstreamUrl.searchParams.set("list-type", "2");
      }

      if (virtualPrefix) {
        const incomingPrefix = url.searchParams.get("prefix") || "";
        upstreamUrl.searchParams.set("prefix", `${virtualPrefix}${incomingPrefix}`);
      }

      const signedHeaders = signS3Request({
        method: "GET",
        url: upstreamUrl,
        region: upstreamAccount.region,
        accessKeyId: upstreamAccount.accessKeyId,
        secretAccessKey: upstreamAccount.secretAccessKey,
      });

      let upstreamRes: Response;
      try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
          method: "GET",
          headers: signedHeaders,
        });
      } catch {
        return xmlResponse(
          buildS3XmlError(
            "BadGateway",
            "Failed to reach upstream S3 provider for bucket listing.",
            url.pathname,
          ),
        );
      }

      if (!upstreamRes.ok) {
        const errorBody = await upstreamRes.text();
        return new Response(errorBody, {
          status: upstreamRes.status,
          headers: {
            "Content-Type":
              upstreamRes.headers.get("content-type") ||
              "application/xml; charset=utf-8",
          },
        });
      }

      const rawXml = await upstreamRes.text();
      const transformedXml = transformListObjectsV2Xml(
        rawXml,
        bucket.name,
        virtualPrefix,
      );

      return new Response(transformedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
      });
    }

    // GetObject (Object-level GET)
    // Allowed even when quota is exceeded
    const upstreamUrl = buildUpstreamUrl(upstreamKey);
    const signedHeaders = signS3Request({
      method: "GET",
      url: upstreamUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      secretAccessKey: upstreamAccount.secretAccessKey,
    });

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl.toString(), {
        method: "GET",
        headers: signedHeaders,
      });
    } catch {
      return xmlResponse(
        buildS3XmlError(
          "BadGateway",
          "Failed to fetch object payload from upstream S3 provider.",
          url.pathname,
        ),
      );
    }

    if (upstreamRes.status === 404) {
      return xmlResponse(
        buildS3XmlError(
          "NoSuchKey",
          "The specified key does not exist.",
          objectKey,
        ),
      );
    }

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.text();
      return new Response(errorBody, {
        status: upstreamRes.status,
        headers: {
          "Content-Type":
            upstreamRes.headers.get("content-type") ||
            "application/xml; charset=utf-8",
        },
      });
    }

    const forwardHeaders: Record<string, string> = {};
    for (const h of [
      "content-type",
      "content-length",
      "etag",
      "last-modified",
      "cache-control",
      "content-disposition",
    ]) {
      const val = upstreamRes.headers.get(h);
      if (val) forwardHeaders[h] = val;
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers: forwardHeaders,
    });
  }

  // -------------------------------------------------------------
  // Handle HEAD (HeadObject or HeadBucket)
  // -------------------------------------------------------------
  if (method === "HEAD") {
    const upstreamUrl = buildUpstreamUrl(objectKey ? upstreamKey : undefined);
    const signedHeaders = signS3Request({
      method: "HEAD",
      url: upstreamUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      secretAccessKey: upstreamAccount.secretAccessKey,
    });

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl.toString(), {
        method: "HEAD",
        headers: signedHeaders,
      });
    } catch {
      return new Response(null, { status: 502 });
    }

    const forwardHeaders: Record<string, string> = {};
    for (const h of [
      "content-type",
      "content-length",
      "etag",
      "last-modified",
      "cache-control",
      "content-disposition",
    ]) {
      const val = upstreamRes.headers.get(h);
      if (val) forwardHeaders[h] = val;
    }

    return new Response(null, {
      status: upstreamRes.status,
      headers: forwardHeaders,
    });
  }

  // -------------------------------------------------------------
  // Handle POST (CreateMultipartUpload or CompleteMultipartUpload)
  // -------------------------------------------------------------
  if (method === "POST") {
    if (!objectKey) {
      return xmlResponse(
        buildS3XmlError(
          "MethodNotAllowed",
          "A key name must be specified for multipart upload operations.",
          url.pathname,
        ),
      );
    }

    // 1. CreateMultipartUpload (POST /:bucket/:key?uploads)
    if (url.searchParams.has("uploads")) {
      // Lazy cleanup of expired multipart uploads
      cleanupExpiredMultipartUploads(bucket.id).catch(() => {});

      const upstreamUrl = buildUpstreamUrl(upstreamKey);
      upstreamUrl.searchParams.set("uploads", "");

      const signedHeaders = signS3Request({
        method: "POST",
        url: upstreamUrl,
        region: upstreamAccount.region,
        accessKeyId: upstreamAccount.accessKeyId,
        secretAccessKey: upstreamAccount.secretAccessKey,
        headers: {
          "content-length": "0",
        },
      });

      let upstreamRes: Response;
      try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
          method: "POST",
          headers: signedHeaders,
        });
      } catch {
        return xmlResponse(
          buildS3XmlError(
            "BadGateway",
            "Failed to initiate multipart upload with upstream S3 provider.",
            url.pathname,
          ),
        );
      }

      if (!upstreamRes.ok) {
        const errorBody = await upstreamRes.text();
        return new Response(errorBody, {
          status: upstreamRes.status,
          headers: {
            "Content-Type":
              upstreamRes.headers.get("content-type") ||
              "application/xml; charset=utf-8",
          },
        });
      }

      const rawXml = await upstreamRes.text();
      const uploadId = extractUploadIdFromXml(rawXml);

      if (!uploadId) {
        return xmlResponse(
          buildS3XmlError(
            "BadGateway",
            "Invalid response from upstream S3 provider: missing UploadId.",
            url.pathname,
          ),
        );
      }

      // Record multipart upload session
      await createMultipartUploadRecord({
        managedBucketId: bucket.id,
        key: objectKey,
        uploadId,
        upstreamKey,
      });

      const transformedXml = transformInitiateMultipartUploadXml(
        rawXml,
        bucket.name,
        objectKey,
      );

      return new Response(transformedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
      });
    }

    // 2. CompleteMultipartUpload (POST /:bucket/:key?uploadId=...)
    if (url.searchParams.has("uploadId")) {
      const uploadId = url.searchParams.get("uploadId")!;

      const uploadRecord = await getMultipartUpload({
        managedBucketId: bucket.id,
        uploadId,
      });

      if (!uploadRecord) {
        return xmlResponse(
          buildS3XmlError(
            "NoSuchUpload",
            "The specified multipart upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed.",
            uploadId,
          ),
        );
      }

      const upstreamUrl = buildUpstreamUrl(upstreamKey);
      upstreamUrl.searchParams.set("uploadId", uploadId);

      const contentType =
        request.headers.get("content-type") || "application/xml";

      const signedHeaders = signS3Request({
        method: "POST",
        url: upstreamUrl,
        region: upstreamAccount.region,
        accessKeyId: upstreamAccount.accessKeyId,
        secretAccessKey: upstreamAccount.secretAccessKey,
        body: bodyBuffer,
        headers: {
          "content-type": contentType,
          "content-length": String(bodyBuffer.byteLength),
        },
      });

      let upstreamRes: Response;
      try {
        upstreamRes = await fetch(upstreamUrl.toString(), {
          method: "POST",
          headers: signedHeaders,
          body: bodyBuffer,
        });
      } catch {
        return xmlResponse(
          buildS3XmlError(
            "BadGateway",
            "Failed to complete multipart upload with upstream S3 provider.",
            url.pathname,
          ),
        );
      }

      if (!upstreamRes.ok) {
        const errorBody = await upstreamRes.text();
        return new Response(errorBody, {
          status: upstreamRes.status,
          headers: {
            "Content-Type":
              upstreamRes.headers.get("content-type") ||
              "application/xml; charset=utf-8",
          },
        });
      }

      const rawXml = await upstreamRes.text();
      const etag = extractEtagFromXml(rawXml) || md5Hex(bodyBuffer);

      // Convert part reservations into permanent object & update quota ledger
      await completeMultipartUploadRecord({
        managedBucketId: bucket.id,
        uploadId,
        key: objectKey,
        etag,
        storageQuotaBytes: bucket.storageQuotaBytes,
        currentUsedBytes: bucket.usedBytes,
      });

      const transformedXml = transformCompleteMultipartUploadXml(
        rawXml,
        bucket.name,
        objectKey,
      );

      return new Response(transformedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
      });
    }

    return xmlResponse(
      buildS3XmlError(
        "MethodNotAllowed",
        "POST request is missing 'uploads' or 'uploadId' parameter.",
        url.pathname,
      ),
    );
  }

  return xmlResponse(
    buildS3XmlError("MethodNotAllowed", `Method ${method} is not supported.`, url.pathname),
  );
}
