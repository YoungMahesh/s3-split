import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PUT,
  DELETE,
  POST,
} from "@/app/api/s3/[...path]/route";
import { db } from "@/db";
import {
  user,
  upstreamAccount,
  managedBucket,
  clientKey,
  managedObjects,
  multipartUploads,
  partReservations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";
import { signS3Request } from "@/lib/s3/sigv4";
import {
  cleanupExpiredMultipartUploads,
  getPendingReservations,
} from "@/lib/s3/multipart";

describe("Multipart Upload Quota Accounting & Part Reservations (Ticket 05)", () => {
  const testUserId = "test-user-mp-05";
  const testUpstreamAccountId = "upstream-acc-mp-05";
  const physicalBucketId = "mb-phys-mp-05";
  const virtualBucketId = "mb-virt-mp-05";

  const rawUpstreamSecret = "upstream-secret-raw-value-mp-05";

  // Client Key 1: Read-Write for physical bucket
  const rwAccessKeyId = "SPLITRWMP0000000001";
  const rwSecretKey = "ClientSecretRW12345678901234567890123456";

  // Client Key 2: Read-Only for physical bucket
  const roAccessKeyId = "SPLITROMP0000000002";
  const roSecretKey = "ClientSecretRO12345678901234567890123456";

  // Client Key 3: Read-Write for virtual prefix bucket
  const vpAccessKeyId = "SPLITVPMP0000000003";
  const vpSecretKey = "ClientSecretVP12345678901234567890123456";

  const physicalQuota = 1000; // 1000 bytes
  const virtualQuota = 2000; // 2000 bytes

  beforeEach(async () => {
    vi.restoreAllMocks();

    // 1. Seed user
    await db
      .insert(user)
      .values({
        id: testUserId,
        name: "Multipart Test User",
        email: "mp-user@example.com",
        emailVerified: true,
      })
      .onConflictDoNothing();

    // Clean up test data
    await db
      .delete(partReservations)
      .where(eq(partReservations.managedBucketId, physicalBucketId));
    await db
      .delete(partReservations)
      .where(eq(partReservations.managedBucketId, virtualBucketId));
    await db
      .delete(multipartUploads)
      .where(eq(multipartUploads.managedBucketId, physicalBucketId));
    await db
      .delete(multipartUploads)
      .where(eq(multipartUploads.managedBucketId, virtualBucketId));
    await db
      .delete(managedObjects)
      .where(eq(managedObjects.managedBucketId, physicalBucketId));
    await db
      .delete(managedObjects)
      .where(eq(managedObjects.managedBucketId, virtualBucketId));
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db
      .delete(upstreamAccount)
      .where(eq(upstreamAccount.userId, testUserId));

    // 2. Create upstream account
    await db.insert(upstreamAccount).values({
      id: testUpstreamAccountId,
      userId: testUserId,
      name: "Multipart Upstream Account",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "AKIAUPSTREAMMP01",
      encryptedSecretAccessKey: encryptSecret(rawUpstreamSecret),
    });

    // 3. Create physical 1:1 managed bucket (quota: 1000 bytes, used: 0)
    await db.insert(managedBucket).values({
      id: physicalBucketId,
      userId: testUserId,
      upstreamAccountId: testUpstreamAccountId,
      name: "my-physical-bucket",
      upstreamBucket: "real-upstream-bucket",
      bucketType: "physical",
      storageQuotaBytes: physicalQuota,
      usedBytes: 0,
      status: "active",
    });

    // 4. Create virtual prefix managed bucket (quota: 2000 bytes, used: 0)
    await db.insert(managedBucket).values({
      id: virtualBucketId,
      userId: testUserId,
      upstreamAccountId: testUpstreamAccountId,
      name: "my-virtual-bucket",
      upstreamBucket: "real-upstream-bucket",
      bucketType: "virtual_prefix",
      virtualPrefix: "split/tenant-virtual-123/",
      storageQuotaBytes: virtualQuota,
      usedBytes: 0,
      status: "active",
    });

    // 5. Seed Client Keys
    await db.insert(clientKey).values([
      {
        id: "ck-rw-mp-01",
        userId: testUserId,
        managedBucketId: physicalBucketId,
        name: "RW MP Key",
        accessKeyId: rwAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(rwSecretKey),
        permission: "read_write",
        status: "active",
      },
      {
        id: "ck-ro-mp-02",
        userId: testUserId,
        managedBucketId: physicalBucketId,
        name: "RO MP Key",
        accessKeyId: roAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(roSecretKey),
        permission: "read_only",
        status: "active",
      },
      {
        id: "ck-vp-mp-03",
        userId: testUserId,
        managedBucketId: virtualBucketId,
        name: "VP MP Key",
        accessKeyId: vpAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(vpSecretKey),
        permission: "read_write",
        status: "active",
      },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db
      .delete(partReservations)
      .where(eq(partReservations.managedBucketId, physicalBucketId));
    await db
      .delete(partReservations)
      .where(eq(partReservations.managedBucketId, virtualBucketId));
    await db
      .delete(multipartUploads)
      .where(eq(multipartUploads.managedBucketId, physicalBucketId));
    await db
      .delete(multipartUploads)
      .where(eq(multipartUploads.managedBucketId, virtualBucketId));
    await db
      .delete(managedObjects)
      .where(eq(managedObjects.managedBucketId, physicalBucketId));
    await db
      .delete(managedObjects)
      .where(eq(managedObjects.managedBucketId, virtualBucketId));
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db
      .delete(upstreamAccount)
      .where(eq(upstreamAccount.userId, testUserId));
  });

  function createSignedRequest({
    method,
    bucketName,
    objectKey = "",
    search = "",
    body = "",
    accessKeyId,
    secretAccessKey,
    headers = {},
    region = "us-east-1",
  }: {
    method: string;
    bucketName: string;
    objectKey?: string;
    search?: string;
    body?: string | Buffer;
    accessKeyId: string;
    secretAccessKey: string;
    headers?: Record<string, string>;
    region?: string;
  }) {
    const pathPart = objectKey
      ? `/${bucketName}/${objectKey}`
      : `/${bucketName}`;
    const searchPart = search
      ? search.startsWith("?")
        ? search
        : `?${search}`
      : "";
    const url = new URL(
      `http://localhost:3000/api/s3${pathPart}${searchPart}`,
    );

    const signedHeaders = signS3Request({
      method,
      url,
      region,
      accessKeyId,
      secretAccessKey,
      body,
      headers,
    });

    const reqHeaders = new Headers();
    for (const [k, v] of Object.entries(signedHeaders)) {
      reqHeaders.set(k, v);
    }

    const reqInit: RequestInit = {
      method,
      headers: reqHeaders,
    };
    if (method === "PUT" || method === "POST") {
      reqInit.body = typeof body === "string" ? body : new Uint8Array(body);
    }

    const req = new Request(url.toString(), reqInit);
    const pathSegments = objectKey
      ? [bucketName, ...objectKey.split("/")]
      : [bucketName];

    return {
      request: req,
      params: Promise.resolve({ path: pathSegments }),
    };
  }

  describe("Initiate Multipart Upload (CreateMultipartUpload)", () => {
    it("applications can initiate multipart uploads via standard S3 SDKs, receiving a valid UploadId", async () => {
      const mockUploadId = "mock-upstream-upload-id-12345";
      const upstreamXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>real-upstream-bucket</Bucket>
  <Key>large-video.mp4</Key>
  <UploadId>${mockUploadId}</UploadId>
</InitiateMultipartUploadResult>`;

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(upstreamXmlResponse, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { request, params } = createSignedRequest({
        method: "POST",
        bucketName: "my-physical-bucket",
        objectKey: "large-video.mp4",
        search: "uploads=",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await POST(request, { params });
      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toContain("<UploadId>mock-upstream-upload-id-12345</UploadId>");
      expect(text).toContain("<Bucket>my-physical-bucket</Bucket>");
      expect(text).toContain("<Key>large-video.mp4</Key>");

      // Verify recorded in DB
      const [saved] = await db
        .select()
        .from(multipartUploads)
        .where(eq(multipartUploads.uploadId, mockUploadId));
      expect(saved).toBeDefined();
      expect(saved.key).toBe("large-video.mp4");
      expect(saved.managedBucketId).toBe(physicalBucketId);

      // Verify upstream request parameters
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(callUrl.searchParams.has("uploads")).toBe(true);
      expect(callUrl.pathname).toBe("/real-upstream-bucket/large-video.mp4");
    });

    it("rejects read-only client key with HTTP 403 AccessDenied", async () => {
      const { request, params } = createSignedRequest({
        method: "POST",
        bucketName: "my-physical-bucket",
        objectKey: "large-video.mp4",
        search: "uploads=",
        accessKeyId: roAccessKeyId,
        secretAccessKey: roSecretKey,
      });

      const response = await POST(request, { params });
      expect(response.status).toBe(403);
      const text = await response.text();
      expect(text).toContain("<Code>AccessDenied</Code>");
    });
  });

  describe("UploadPart & Quota Reservations", () => {
    const activeUploadId = "upload-session-xyz-100";

    beforeEach(async () => {
      // Seed an active multipart upload
      await db.insert(multipartUploads).values({
        id: "mp-session-01",
        managedBucketId: physicalBucketId,
        key: "data.bin",
        uploadId: activeUploadId,
        upstreamKey: "data.bin",
      });
    });

    it("checks used_bytes + pending_reservations + part_size <= storage_quota_bytes and records part reservation", async () => {
      const partBody = Buffer.alloc(400, "a"); // 400 bytes

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { ETag: '"etag-part-1"' },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { request, params } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "data.bin",
        search: `partNumber=1&uploadId=${activeUploadId}`,
        body: partBody,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await PUT(request, { params });
      expect(response.status).toBe(200);
      expect(response.headers.get("ETag")).toBe('"etag-part-1"');

      // Verify reservation saved in DB
      const pending = await getPendingReservations(physicalBucketId);
      expect(pending).toBe(400);

      // Part 2 of 400 bytes: total pending becomes 800 (within 1000 quota)
      const part2Body = Buffer.alloc(400, "b");
      const { request: req2, params: params2 } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "data.bin",
        search: `partNumber=2&uploadId=${activeUploadId}`,
        body: part2Body,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response2 = await PUT(req2, { params: params2 });
      expect(response2.status).toBe(200);

      const pendingAfter2 = await getPendingReservations(physicalBucketId);
      expect(pendingAfter2).toBe(800);
    });

    it("rejects immediately with HTTP 507 QuotaExceeded if part would breach quota, preventing bandwidth waste", async () => {
      // Bucket quota is 1000. Reserve 800 bytes with part 1.
      await db.insert(partReservations).values({
        id: "res-part-1",
        managedBucketId: physicalBucketId,
        uploadId: activeUploadId,
        partNumber: 1,
        sizeBytes: 800,
        etag: "etag-1",
      });

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      // Attempt part 2 with 300 bytes (800 + 300 = 1100 > 1000 quota)
      const oversizedPart = Buffer.alloc(300, "c");
      const { request, params } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "data.bin",
        search: `partNumber=2&uploadId=${activeUploadId}`,
        body: oversizedPart,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await PUT(request, { params });
      expect(response.status).toBe(507);

      const text = await response.text();
      expect(text).toContain("<Code>QuotaExceeded</Code>");
      expect(text).toContain("Storage quota exceeded");

      // Verify upstream fetch was NEVER called
      expect(fetchMock).not.toHaveBeenCalled();

      // Verify reservation was NOT created
      const reservations = await db
        .select()
        .from(partReservations)
        .where(eq(partReservations.uploadId, activeUploadId));
      expect(reservations).toHaveLength(1);
    });

    it("accounts for concurrent multipart uploads across the bucket", async () => {
      // Second multipart upload in the same bucket
      const concurrentUploadId = "concurrent-session-999";
      await db.insert(multipartUploads).values({
        id: "mp-session-02",
        managedBucketId: physicalBucketId,
        key: "second-file.bin",
        uploadId: concurrentUploadId,
        upstreamKey: "second-file.bin",
      });

      // Upload A already reserved 600 bytes
      await db.insert(partReservations).values({
        id: "res-upload-a",
        managedBucketId: physicalBucketId,
        uploadId: activeUploadId,
        partNumber: 1,
        sizeBytes: 600,
        etag: "etag-a",
      });

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      // Upload B tries to upload 500 bytes: 600 + 500 = 1100 > 1000 quota
      const partBody = Buffer.alloc(500, "x");
      const { request, params } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "second-file.bin",
        search: `partNumber=1&uploadId=${concurrentUploadId}`,
        body: partBody,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await PUT(request, { params });
      expect(response.status).toBe(507);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns HTTP 404 NoSuchUpload when uploadId does not exist", async () => {
      const { request, params } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "data.bin",
        search: "partNumber=1&uploadId=non-existent-upload-id",
        body: Buffer.alloc(100),
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await PUT(request, { params });
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toContain("<Code>NoSuchUpload</Code>");
    });
  });

  describe("CompleteMultipartUpload", () => {
    const completeUploadId = "complete-upload-id-555";

    beforeEach(async () => {
      await db.insert(multipartUploads).values({
        id: "mp-complete-session",
        managedBucketId: physicalBucketId,
        key: "finished-object.zip",
        uploadId: completeUploadId,
        upstreamKey: "finished-object.zip",
      });

      await db.insert(partReservations).values([
        {
          id: "pr-01",
          managedBucketId: physicalBucketId,
          uploadId: completeUploadId,
          partNumber: 1,
          sizeBytes: 300,
          etag: "etag-part-1",
        },
        {
          id: "pr-02",
          managedBucketId: physicalBucketId,
          uploadId: completeUploadId,
          partNumber: 2,
          sizeBytes: 400,
          etag: "etag-part-2",
        },
      ]);
    });

    it("converts part reservations into permanent used_bytes and records object in local registry", async () => {
      const completeXmlPayload = `<CompleteMultipartUpload>
  <Part><PartNumber>1</PartNumber><ETag>"etag-part-1"</ETag></Part>
  <Part><PartNumber>2</PartNumber><ETag>"etag-part-2"</ETag></Part>
</CompleteMultipartUpload>`;

      const upstreamCompleteResponse = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Location>https://s3.us-east-1.amazonaws.com/real-upstream-bucket/finished-object.zip</Location>
  <Bucket>real-upstream-bucket</Bucket>
  <Key>finished-object.zip</Key>
  <ETag>"final-complete-etag-123"</ETag>
</CompleteMultipartUploadResult>`;

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(upstreamCompleteResponse, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { request, params } = createSignedRequest({
        method: "POST",
        bucketName: "my-physical-bucket",
        objectKey: "finished-object.zip",
        search: `uploadId=${completeUploadId}`,
        body: completeXmlPayload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await POST(request, { params });
      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toContain("<Bucket>my-physical-bucket</Bucket>");
      expect(text).toContain("<Key>finished-object.zip</Key>");
      expect(text).toContain("<ETag>\"final-complete-etag-123\"</ETag>");

      // Verify object recorded in managed_objects
      const [obj] = await db
        .select()
        .from(managedObjects)
        .where(eq(managedObjects.key, "finished-object.zip"));
      expect(obj).toBeDefined();
      expect(obj.sizeBytes).toBe(700); // 300 + 400
      expect(obj.etag).toBe("final-complete-etag-123");

      // Verify bucket used_bytes updated
      const [b] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(b.usedBytes).toBe(700);
      expect(b.status).toBe("active");

      // Verify part reservations and upload session deleted
      const remainingReservations = await db
        .select()
        .from(partReservations)
        .where(eq(partReservations.uploadId, completeUploadId));
      expect(remainingReservations).toHaveLength(0);

      const remainingUploads = await db
        .select()
        .from(multipartUploads)
        .where(eq(multipartUploads.uploadId, completeUploadId));
      expect(remainingUploads).toHaveLength(0);
    });

    it("applies net delta when overwriting an existing object via multipart upload", async () => {
      // Pre-existing object with 500 bytes and usedBytes = 500
      await db.insert(managedObjects).values({
        id: "existing-zip-obj",
        managedBucketId: physicalBucketId,
        key: "finished-object.zip",
        sizeBytes: 500,
        etag: "old-etag",
      });

      await db
        .update(managedBucket)
        .set({ usedBytes: 500 })
        .where(eq(managedBucket.id, physicalBucketId));

      const upstreamCompleteResponse = `<CompleteMultipartUploadResult>
  <Bucket>real-upstream-bucket</Bucket>
  <Key>finished-object.zip</Key>
  <ETag>"new-etag-700"</ETag>
</CompleteMultipartUploadResult>`;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(upstreamCompleteResponse, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
          }),
        ),
      );

      const { request, params } = createSignedRequest({
        method: "POST",
        bucketName: "my-physical-bucket",
        objectKey: "finished-object.zip",
        search: `uploadId=${completeUploadId}`,
        body: "<CompleteMultipartUpload></CompleteMultipartUpload>",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await POST(request, { params });
      expect(response.status).toBe(200);

      // New size is 700 bytes. Net delta is 700 - 500 = +200 bytes.
      // New usedBytes should be 500 + 200 = 700 bytes.
      const [b] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(b.usedBytes).toBe(700);

      const [obj] = await db
        .select()
        .from(managedObjects)
        .where(eq(managedObjects.key, "finished-object.zip"));
      expect(obj.sizeBytes).toBe(700);
      expect(obj.etag).toBe("new-etag-700");
    });
  });

  describe("AbortMultipartUpload", () => {
    const abortUploadId = "abort-upload-id-777";

    beforeEach(async () => {
      await db.insert(multipartUploads).values({
        id: "mp-abort-session",
        managedBucketId: physicalBucketId,
        key: "canceled-upload.dat",
        uploadId: abortUploadId,
        upstreamKey: "canceled-upload.dat",
      });

      await db.insert(partReservations).values({
        id: "pr-abort-01",
        managedBucketId: physicalBucketId,
        uploadId: abortUploadId,
        partNumber: 1,
        sizeBytes: 600,
        etag: "etag-temp",
      });
    });

    it("aborts upstream parts and releases database reservations", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      const { request, params } = createSignedRequest({
        method: "DELETE",
        bucketName: "my-physical-bucket",
        objectKey: "canceled-upload.dat",
        search: `uploadId=${abortUploadId}`,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const response = await DELETE(request, { params });
      expect(response.status).toBe(204);

      // Upstream abort verified
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(callUrl.searchParams.get("uploadId")).toBe(abortUploadId);
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");

      // Verify DB records released
      const remainingReservations = await db
        .select()
        .from(partReservations)
        .where(eq(partReservations.uploadId, abortUploadId));
      expect(remainingReservations).toHaveLength(0);

      const remainingUploads = await db
        .select()
        .from(multipartUploads)
        .where(eq(multipartUploads.uploadId, abortUploadId));
      expect(remainingUploads).toHaveLength(0);

      // Pending reservations should now be 0
      const pending = await getPendingReservations(physicalBucketId);
      expect(pending).toBe(0);
    });
  });

  describe("24-Hour Expiration & Orphan Cleanup", () => {
    it("multipart upload reservations older than 24 hours automatically expire and release bytes", async () => {
      const staleUploadId = "stale-upload-id-24h";
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      await db.insert(multipartUploads).values({
        id: "mp-stale-session",
        managedBucketId: physicalBucketId,
        key: "abandoned.mp4",
        uploadId: staleUploadId,
        upstreamKey: "abandoned.mp4",
        createdAt: staleDate,
      });

      await db.insert(partReservations).values({
        id: "pr-stale-01",
        managedBucketId: physicalBucketId,
        uploadId: staleUploadId,
        partNumber: 1,
        sizeBytes: 700,
        etag: "etag-stale",
        createdAt: staleDate,
      });

      // 1. Pending reservations check excludes stale reservations (>24h)
      const pending = await getPendingReservations(physicalBucketId);
      expect(pending).toBe(0);

      // 2. Cleanup job calls upstream abort and purges database records
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cleanupExpiredMultipartUploads(physicalBucketId);
      expect(result.expiredCount).toBe(1);

      // Upstream delete was called
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(callUrl.searchParams.get("uploadId")).toBe(staleUploadId);

      // DB records are purged
      const remainingUploads = await db
        .select()
        .from(multipartUploads)
        .where(eq(multipartUploads.uploadId, staleUploadId));
      expect(remainingUploads).toHaveLength(0);

      const remainingParts = await db
        .select()
        .from(partReservations)
        .where(eq(partReservations.uploadId, staleUploadId));
      expect(remainingParts).toHaveLength(0);
    });
  });

  describe("Virtual Prefix Isolation in Multipart Uploads", () => {
    it("prepends prefix upstream on initiate and strips prefix from client response", async () => {
      const mockUploadId = "virt-upload-id-888";
      const upstreamXml = `<InitiateMultipartUploadResult>
  <Bucket>real-upstream-bucket</Bucket>
  <Key>split/tenant-virtual-123/docs/manual.pdf</Key>
  <UploadId>${mockUploadId}</UploadId>
</InitiateMultipartUploadResult>`;

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(upstreamXml, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { request, params } = createSignedRequest({
        method: "POST",
        bucketName: "my-virtual-bucket",
        objectKey: "docs/manual.pdf",
        search: "uploads=",
        accessKeyId: vpAccessKeyId,
        secretAccessKey: vpSecretKey,
      });

      const response = await POST(request, { params });
      expect(response.status).toBe(200);

      const text = await response.text();
      // Upstream prefix must be stripped in response to client
      expect(text).toContain("<Bucket>my-virtual-bucket</Bucket>");
      expect(text).toContain("<Key>docs/manual.pdf</Key>");
      expect(text).not.toContain("split/tenant-virtual-123");

      // Verify upstream URL included the virtual prefix
      const callUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(callUrl.pathname).toBe(
        "/real-upstream-bucket/split/tenant-virtual-123/docs/manual.pdf",
      );

      // Verify recorded in DB with both logical key and upstream key
      const [record] = await db
        .select()
        .from(multipartUploads)
        .where(eq(multipartUploads.uploadId, mockUploadId));
      expect(record.key).toBe("docs/manual.pdf");
      expect(record.upstreamKey).toBe(
        "split/tenant-virtual-123/docs/manual.pdf",
      );
    });
  });
});
