import crypto from "node:crypto";
import { db } from "@/db";
import {
  multipartUploads,
  partReservations,
  managedObjects,
  managedBucket,
  upstreamAccount,
} from "@/db/schema";
import { eq, and, lt, gte } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { signS3Request } from "./sigv4";

/**
 * Strips virtual prefixes and rewrites bucket name in InitiateMultipartUploadResult XML.
 */
export function transformInitiateMultipartUploadXml(
  rawXml: string,
  bucketName: string,
  objectKey: string,
): string {
  return rawXml
    .replace(/<Bucket>[\s\S]*?<\/Bucket>/i, `<Bucket>${bucketName}</Bucket>`)
    .replace(/<Key>[\s\S]*?<\/Key>/i, `<Key>${objectKey}</Key>`);
}

/**
 * Strips virtual prefixes and rewrites bucket name in CompleteMultipartUploadResult XML.
 */
export function transformCompleteMultipartUploadXml(
  rawXml: string,
  bucketName: string,
  objectKey: string,
): string {
  return rawXml
    .replace(/<Bucket>[\s\S]*?<\/Bucket>/i, `<Bucket>${bucketName}</Bucket>`)
    .replace(/<Key>[\s\S]*?<\/Key>/i, `<Key>${objectKey}</Key>`);
}

/**
 * Extracts UploadId from InitiateMultipartUploadResult XML.
 */
export function extractUploadIdFromXml(xml: string): string | null {
  const match = xml.match(/<UploadId>([\s\S]*?)<\/UploadId>/i);
  return match ? match[1].trim() : null;
}

/**
 * Extracts ETag from CompleteMultipartUploadResult XML.
 */
export function extractEtagFromXml(xml: string): string | null {
  const match = xml.match(/<ETag>([\s\S]*?)<\/ETag>/i);
  return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}

/**
 * Inserts a new multipart upload session.
 */
export async function createMultipartUploadRecord(options: {
  managedBucketId: string;
  key: string;
  uploadId: string;
  upstreamKey: string;
}) {
  const { managedBucketId, key, uploadId, upstreamKey } = options;
  await db.insert(multipartUploads).values({
    id: crypto.randomUUID(),
    managedBucketId,
    key,
    uploadId,
    upstreamKey,
  });
}

/**
 * Retrieves a multipart upload session by uploadId and managedBucketId.
 */
export async function getMultipartUpload(options: {
  managedBucketId: string;
  uploadId: string;
}) {
  const { managedBucketId, uploadId } = options;
  const [record] = await db
    .select()
    .from(multipartUploads)
    .where(
      and(
        eq(multipartUploads.managedBucketId, managedBucketId),
        eq(multipartUploads.uploadId, uploadId),
      ),
    )
    .limit(1);

  return record || null;
}

/**
 * Calculates the total byte reservations for active multipart uploads on a bucket.
 * Automatically ignores stale reservations older than 24 hours.
 * Optionally excludes a specific (uploadId, partNumber) if overwriting a part.
 */
export async function getPendingReservations(
  managedBucketId: string,
  excludeUploadId?: string,
  excludePartNumber?: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const conditions = [
    eq(partReservations.managedBucketId, managedBucketId),
    gte(partReservations.createdAt, cutoff),
  ];

  const results = await db
    .select({
      uploadId: partReservations.uploadId,
      partNumber: partReservations.partNumber,
      sizeBytes: partReservations.sizeBytes,
    })
    .from(partReservations)
    .where(and(...conditions));

  let total = 0;
  for (const r of results) {
    if (
      excludeUploadId &&
      excludePartNumber !== undefined &&
      r.uploadId === excludeUploadId &&
      r.partNumber === excludePartNumber
    ) {
      continue;
    }
    total += r.sizeBytes;
  }

  return total;
}

/**
 * Stores or updates a part reservation for an active multipart upload.
 */
export async function savePartReservation(options: {
  managedBucketId: string;
  uploadId: string;
  partNumber: number;
  sizeBytes: number;
  etag?: string | null;
}) {
  const { managedBucketId, uploadId, partNumber, sizeBytes, etag } = options;

  await db
    .insert(partReservations)
    .values({
      id: crypto.randomUUID(),
      managedBucketId,
      uploadId,
      partNumber,
      sizeBytes,
      etag: etag ? etag.replace(/^"|"$/g, "") : null,
    })
    .onConflictDoUpdate({
      target: [partReservations.uploadId, partReservations.partNumber],
      set: {
        sizeBytes,
        etag: etag ? etag.replace(/^"|"$/g, "") : null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Converts part reservations into a permanent object in the local object registry,
 * applies net delta accounting to the bucket used_bytes, and cleans up multipart records.
 */
export async function completeMultipartUploadRecord(options: {
  managedBucketId: string;
  uploadId: string;
  key: string;
  etag: string;
  storageQuotaBytes: number;
  currentUsedBytes: number;
}) {
  const {
    managedBucketId,
    uploadId,
    key,
    etag,
    storageQuotaBytes,
    currentUsedBytes,
  } = options;

  // Retrieve all parts for this upload to compute total byte size
  const parts = await db
    .select({ sizeBytes: partReservations.sizeBytes })
    .from(partReservations)
    .where(eq(partReservations.uploadId, uploadId));

  const totalSize = parts.reduce((acc, p) => acc + p.sizeBytes, 0);

  // Check for existing object to compute net delta
  const [existingObj] = await db
    .select()
    .from(managedObjects)
    .where(
      and(
        eq(managedObjects.managedBucketId, managedBucketId),
        eq(managedObjects.key, key),
      ),
    )
    .limit(1);

  const oldSize = existingObj ? existingObj.sizeBytes : 0;
  const netDelta = totalSize - oldSize;
  const newUsedBytes = Math.max(0, currentUsedBytes + netDelta);
  const newStatus =
    newUsedBytes >= storageQuotaBytes ? "quota_exceeded" : "active";

  const cleanEtag = etag.replace(/^"|"$/g, "");

  await db.transaction(async (tx) => {
    if (existingObj) {
      await tx
        .update(managedObjects)
        .set({
          sizeBytes: totalSize,
          etag: cleanEtag,
          lastModified: new Date(),
        })
        .where(eq(managedObjects.id, existingObj.id));
    } else {
      await tx.insert(managedObjects).values({
        id: crypto.randomUUID(),
        managedBucketId,
        key,
        sizeBytes: totalSize,
        etag: cleanEtag,
        lastModified: new Date(),
      });
    }

    // Release part reservations and upload session
    await tx
      .delete(partReservations)
      .where(eq(partReservations.uploadId, uploadId));

    await tx
      .delete(multipartUploads)
      .where(eq(multipartUploads.uploadId, uploadId));

    // Update managed bucket used bytes and status
    await tx
      .update(managedBucket)
      .set({
        usedBytes: newUsedBytes,
        status: newStatus,
      })
      .where(eq(managedBucket.id, managedBucketId));
  });

  return { totalSize, newUsedBytes, newStatus };
}

/**
 * Aborts a multipart upload and releases its database reservations.
 */
export async function abortMultipartUploadRecord(options: {
  managedBucketId: string;
  uploadId: string;
}) {
  const { uploadId } = options;
  await db.transaction(async (tx) => {
    await tx
      .delete(partReservations)
      .where(eq(partReservations.uploadId, uploadId));

    await tx
      .delete(multipartUploads)
      .where(eq(multipartUploads.uploadId, uploadId));
  });
}

/**
 * Finds and purges multipart upload sessions older than 24 hours (or specified cutoff).
 * Issues upstream AbortMultipartUpload requests to free orphaned cloud storage,
 * and releases local part reservations.
 */
export async function cleanupExpiredMultipartUploads(
  bucketId?: string,
  cutoffDate?: Date,
): Promise<{ expiredCount: number }> {
  const cutoff = cutoffDate || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const query = db
    .select({
      uploadId: multipartUploads.uploadId,
      upstreamKey: multipartUploads.upstreamKey,
      bucketId: multipartUploads.managedBucketId,
      upstreamBucket: managedBucket.upstreamBucket,
      endpointUrl: upstreamAccount.endpointUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      encryptedSecretAccessKey: upstreamAccount.encryptedSecretAccessKey,
    })
    .from(multipartUploads)
    .innerJoin(
      managedBucket,
      eq(multipartUploads.managedBucketId, managedBucket.id),
    )
    .innerJoin(
      upstreamAccount,
      eq(managedBucket.upstreamAccountId, upstreamAccount.id),
    )
    .where(
      and(
        lt(multipartUploads.createdAt, cutoff),
        bucketId ? eq(multipartUploads.managedBucketId, bucketId) : undefined,
      ),
    );

  const expiredUploads = await query;

  for (const upload of expiredUploads) {
    // 1. Attempt upstream abort
    try {
      const secretAccessKey = decryptSecret(upload.encryptedSecretAccessKey);
      const upstreamUrl = new URL(upload.endpointUrl);
      const parts = [
        encodeURIComponent(upload.upstreamBucket),
        ...upload.upstreamKey.split("/").map(encodeURIComponent),
      ];
      upstreamUrl.pathname = `/${parts.join("/")}`;
      upstreamUrl.searchParams.set("uploadId", upload.uploadId);

      const signedHeaders = signS3Request({
        method: "DELETE",
        url: upstreamUrl,
        region: upload.region,
        accessKeyId: upload.accessKeyId,
        secretAccessKey,
      });

      await fetch(upstreamUrl.toString(), {
        method: "DELETE",
        headers: signedHeaders,
      });
    } catch {
      // Upstream abort errors should not block local database cleanup
    }

    // 2. Clean up database records
    await db.transaction(async (tx) => {
      await tx
        .delete(partReservations)
        .where(eq(partReservations.uploadId, upload.uploadId));
      await tx
        .delete(multipartUploads)
        .where(eq(multipartUploads.uploadId, upload.uploadId));
    });
  }

  // Also clean up any orphaned part_reservations whose upload was already deleted or is older than cutoff
  await db
    .delete(partReservations)
    .where(lt(partReservations.createdAt, cutoff));

  return { expiredCount: expiredUploads.length };
}
