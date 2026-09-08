import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GET,
  PUT,
  DELETE,
  HEAD,
} from "@/app/api/s3/[...path]/route";
import { db } from "@/db";
import {
  user,
  upstreamAccount,
  managedBucket,
  clientKey,
  managedObjects,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";
import { signS3Request } from "@/lib/s3/sigv4";

describe("S3 Gateway Proxy & Storage Quota Enforcement (Ticket 04)", () => {
  const testUserId = "test-user-gw-04";
  const otherUserId = "other-user-gw-04";

  const testUpstreamAccountId = "upstream-acc-gw-04";
  const physicalBucketId = "mb-phys-gw-04";
  const virtualBucketId = "mb-virt-gw-04";

  const rawUpstreamSecret = "upstream-secret-raw-value-gw-04";

  // Client Key 1: Read-Write for physical bucket
  const rwAccessKeyId = "SPLITRWKEY00000001";
  const rwSecretKey = "ClientSecretRW12345678901234567890123456";

  // Client Key 2: Read-Only for physical bucket
  const roAccessKeyId = "SPLITROKEY00000002";
  const roSecretKey = "ClientSecretRO12345678901234567890123456";

  // Client Key 3: Read-Write for virtual prefix bucket
  const vpAccessKeyId = "SPLITVPKEY00000003";
  const vpSecretKey = "ClientSecretVP12345678901234567890123456";

  // Client Key 4: Revoked key
  const revokedAccessKeyId = "SPLITREVOKED000004";
  const revokedSecretKey = "ClientSecretRevoked12345678901234567890";

  const physicalQuota = 1000; // 1000 bytes
  const virtualQuota = 2000; // 2000 bytes

  beforeEach(async () => {
    vi.restoreAllMocks();

    // 1. Seed users
    await db
      .insert(user)
      .values([
        {
          id: testUserId,
          name: "Gateway Test User",
          email: "gw-user@example.com",
          emailVerified: true,
        },
        {
          id: otherUserId,
          name: "Other User",
          email: "other-gw@example.com",
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    // Clean up test data
    await db.delete(managedObjects).where(eq(managedObjects.managedBucketId, physicalBucketId));
    await db.delete(managedObjects).where(eq(managedObjects.managedBucketId, virtualBucketId));
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));

    // 2. Create upstream account
    await db.insert(upstreamAccount).values({
      id: testUpstreamAccountId,
      userId: testUserId,
      name: "Gateway Upstream Account",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "AKIAUPSTREAMGATEWAY01",
      encryptedSecretAccessKey: encryptSecret(rawUpstreamSecret),
    });

    // 3. Create physical 1:1 managed bucket (quota: 1000 bytes, initial used: 0)
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

    // 4. Create virtual prefix managed bucket (quota: 2000 bytes, initial used: 0)
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
        id: "ck-rw-01",
        userId: testUserId,
        managedBucketId: physicalBucketId,
        name: "RW Key",
        accessKeyId: rwAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(rwSecretKey),
        permission: "read_write",
        status: "active",
      },
      {
        id: "ck-ro-02",
        userId: testUserId,
        managedBucketId: physicalBucketId,
        name: "RO Key",
        accessKeyId: roAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(roSecretKey),
        permission: "read_only",
        status: "active",
      },
      {
        id: "ck-vp-03",
        userId: testUserId,
        managedBucketId: virtualBucketId,
        name: "VP Key",
        accessKeyId: vpAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(vpSecretKey),
        permission: "read_write",
        status: "active",
      },
      {
        id: "ck-rev-04",
        userId: testUserId,
        managedBucketId: physicalBucketId,
        name: "Revoked Key",
        accessKeyId: revokedAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(revokedSecretKey),
        permission: "read_write",
        status: "revoked",
      },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(managedObjects).where(eq(managedObjects.managedBucketId, physicalBucketId));
    await db.delete(managedObjects).where(eq(managedObjects.managedBucketId, virtualBucketId));
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
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
    const pathPart = objectKey ? `/${bucketName}/${objectKey}` : `/${bucketName}`;
    const searchPart = search ? (search.startsWith("?") ? search : `?${search}`) : "";
    const url = new URL(`http://localhost:3000/api/s3${pathPart}${searchPart}`);

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
    const pathSegments = objectKey ? [bucketName, ...objectKey.split("/")] : [bucketName];

    return { req, pathSegments };
  }

  describe("Authentication & SigV4 Verification", () => {
    it("rejects request without Authorization header with HTTP 403 AccessDenied", async () => {
      const req = new Request("http://localhost:3000/api/s3/my-physical-bucket/test.txt", {
        method: "GET",
      });
      const res = await GET(req, {
        params: Promise.resolve({ path: ["my-physical-bucket", "test.txt"] }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>AccessDenied</Code>");
    });

    it("rejects request with unknown access key with HTTP 403 InvalidAccessKeyId", async () => {
      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        objectKey: "test.txt",
        accessKeyId: "SPLITUNKNOWNKEY00000",
        secretAccessKey: "SomeRandomSecretAccessKey123456789012345",
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>InvalidAccessKeyId</Code>");
    });

    it("rejects request with revoked client key with HTTP 403 InvalidAccessKeyId", async () => {
      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        objectKey: "test.txt",
        accessKeyId: revokedAccessKeyId,
        secretAccessKey: revokedSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>InvalidAccessKeyId</Code>");
    });

    it("rejects request with tampered signature with HTTP 403 SignatureDoesNotMatch", async () => {
      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        objectKey: "test.txt",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: "WrongSecretKeyForSignatureCalculation123",
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>SignatureDoesNotMatch</Code>");
    });

    it("rejects request when client key belongs to a different bucket", async () => {
      // rwAccessKeyId is for 'my-physical-bucket', but request targets 'other-bucket'
      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "other-bucket",
        objectKey: "test.txt",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>AccessDenied</Code>");
      expect(text).toContain("not authorized to access bucket");
    });
  });

  describe("Permission Scopes (Read-Only vs Read-Write)", () => {
    it("allows Read-Only key to perform GetObject", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"sample-etag-123"',
          "content-type": "text/plain",
          "content-length": "13",
        }),
        body: "Hello, world!",
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        objectKey: "hello.txt",
        accessKeyId: roAccessKeyId,
        secretAccessKey: roSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"sample-etag-123"');
    });

    it("allows Read-Only key to perform ListObjectsV2", async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>real-upstream-bucket</Name>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>test.txt</Key>
        <Size>10</Size>
    </Contents>
</ListBucketResult>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/xml" }),
        text: async () => mockXml,
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        search: "list-type=2",
        accessKeyId: roAccessKeyId,
        secretAccessKey: roSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("<Name>my-physical-bucket</Name>");
    });

    it("rejects Read-Only key on PutObject with HTTP 403 AccessDenied", async () => {
      global.fetch = vi.fn();

      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "new-file.txt",
        body: "payload data",
        accessKeyId: roAccessKeyId,
        secretAccessKey: roSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>AccessDenied</Code>");
      expect(text).toContain("Read-only client credentials cannot perform mutating operations");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("rejects Read-Only key on DeleteObject with HTTP 403 AccessDenied", async () => {
      global.fetch = vi.fn();

      const { req, pathSegments } = createSignedRequest({
        method: "DELETE",
        bucketName: "my-physical-bucket",
        objectKey: "target.txt",
        accessKeyId: roAccessKeyId,
        secretAccessKey: roSecretKey,
      });

      const res = await DELETE(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("<Code>AccessDenied</Code>");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("PutObject Quota Enforcement & Net Delta Overwrites", () => {
    it("streams upload upstream, updates usedBytes and object registry atomically when within quota", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"upstream-etag-456"' }),
        text: async () => "",
      } as unknown as Response);

      const payload = "1234567890".repeat(20); // 200 bytes (quota is 1000)
      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "documents/notes.txt",
        body: payload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"upstream-etag-456"');

      // Verify upstream fetch was invoked with re-signed request
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [upstreamCallUrl, upstreamCallInit] = vi.mocked(fetch).mock.calls[0];
      expect(upstreamCallUrl).toContain("real-upstream-bucket/documents/notes.txt");
      const authHeader = (upstreamCallInit?.headers as Record<string, string> | undefined)?.authorization;
      expect(authHeader).toContain("AKIAUPSTREAMGATEWAY01");

      // Verify atomic database ledger and registry update
      const [updatedBucket] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(updatedBucket.usedBytes).toBe(200);
      expect(updatedBucket.status).toBe("active");

      const [storedObject] = await db
        .select()
        .from(managedObjects)
        .where(eq(managedObjects.managedBucketId, physicalBucketId));
      expect(storedObject).toBeDefined();
      expect(storedObject.key).toBe("documents/notes.txt");
      expect(storedObject.sizeBytes).toBe(200);
      expect(storedObject.etag).toBe("upstream-etag-456");
    });

    it("rejects PutObject immediately with HTTP 507 QuotaExceeded when size exceeds storageQuotaBytes", async () => {
      global.fetch = vi.fn();

      // Quota is 1000 bytes; upload is 1001 bytes
      const oversizedPayload = "a".repeat(1001);
      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "too-large.bin",
        body: oversizedPayload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(507);
      const text = await res.text();
      expect(text).toContain("<Code>QuotaExceeded</Code>");
      expect(text).toContain("Storage quota exceeded for bucket 'my-physical-bucket'");

      // Critical: verify request was NEVER streamed upstream
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify ledger was not modified
      const [b] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(b.usedBytes).toBe(0);
    });

    it("handles overwrites: calculates net delta (new_size - old_size) and accepts larger file within quota", async () => {
      // Seed existing object of 300 bytes
      await db.insert(managedObjects).values({
        id: "obj-existing-1",
        managedBucketId: physicalBucketId,
        key: "overwrite-me.txt",
        sizeBytes: 300,
        etag: "old-etag",
      });
      await db
        .update(managedBucket)
        .set({ usedBytes: 800 })
        .where(eq(managedBucket.id, physicalBucketId));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"new-etag-789"' }),
        text: async () => "",
      } as unknown as Response);

      // New file is 400 bytes.
      // Net delta: 400 - 300 = +100 bytes.
      // 800 + 100 = 900 <= 1000 bytes (quota passes!)
      const newPayload = "x".repeat(400);
      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "overwrite-me.txt",
        body: newPayload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);

      const [updatedBucket] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(updatedBucket.usedBytes).toBe(900);

      const [updatedObj] = await db
        .select()
        .from(managedObjects)
        .where(eq(managedObjects.managedBucketId, physicalBucketId));
      expect(updatedObj.sizeBytes).toBe(400);
      expect(updatedObj.etag).toBe("new-etag-789");
    });

    it("handles overwrites: rejects larger file when net delta pushes usage past quota", async () => {
      // Existing file: 300 bytes, usedBytes: 800 (remaining: 200)
      await db.insert(managedObjects).values({
        id: "obj-existing-2",
        managedBucketId: physicalBucketId,
        key: "overwrite-me.txt",
        sizeBytes: 300,
        etag: "old-etag",
      });
      await db
        .update(managedBucket)
        .set({ usedBytes: 800 })
        .where(eq(managedBucket.id, physicalBucketId));

      global.fetch = vi.fn();

      // New file: 600 bytes. Net delta: 600 - 300 = +300.
      // 800 + 300 = 1100 > 1000 (exceeds quota!)
      const newPayload = "x".repeat(600);
      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "overwrite-me.txt",
        body: newPayload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(507);
      const text = await res.text();
      expect(text).toContain("<Code>QuotaExceeded</Code>");
      expect(global.fetch).not.toHaveBeenCalled();

      // Used bytes unchanged
      const [b] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(b.usedBytes).toBe(800);
    });

    it("handles overwrites: allows smaller replacement file even when bucket is at quota", async () => {
      // Bucket is at quota (used: 1000, quota: 1000, status: quota_exceeded)
      await db.insert(managedObjects).values({
        id: "obj-existing-3",
        managedBucketId: physicalBucketId,
        key: "large-file.bin",
        sizeBytes: 400,
        etag: "etag-400",
      });
      await db
        .update(managedBucket)
        .set({ usedBytes: 1000, status: "quota_exceeded" })
        .where(eq(managedBucket.id, physicalBucketId));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"etag-100"' }),
        text: async () => "",
      } as unknown as Response);

      // New file is 100 bytes (net delta: 100 - 400 = -300)
      // New used: 1000 - 300 = 700 <= 1000 (succeeds!)
      const newPayload = "y".repeat(100);
      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-physical-bucket",
        objectKey: "large-file.bin",
        body: newPayload,
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);

      const [updatedBucket] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(updatedBucket.usedBytes).toBe(700);
      expect(updatedBucket.status).toBe("active");
    });
  });

  describe("Quota Exceeded State: Read & Delete Survival", () => {
    beforeEach(async () => {
      // Set bucket to quota exceeded
      await db
        .update(managedBucket)
        .set({ usedBytes: 1200, status: "quota_exceeded" })
        .where(eq(managedBucket.id, physicalBucketId));

      await db.insert(managedObjects).values({
        id: "obj-full-1",
        managedBucketId: physicalBucketId,
        key: "existing.txt",
        sizeBytes: 400,
        etag: "etag-existing",
      });
    });

    it("GetObject succeeds when bucket Storage Quota is exceeded", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"etag-existing"',
          "content-type": "text/plain",
          "content-length": "400",
        }),
        body: "readable content",
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        objectKey: "existing.txt",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"etag-existing"');
    });

    it("HeadObject succeeds when bucket Storage Quota is exceeded", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"etag-existing"',
          "content-type": "text/plain",
          "content-length": "400",
        }),
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "HEAD",
        bucketName: "my-physical-bucket",
        objectKey: "existing.txt",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await HEAD(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"etag-existing"');
    });

    it("ListObjectsV2 succeeds when bucket Storage Quota is exceeded", async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>real-upstream-bucket</Name>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>existing.txt</Key>
        <Size>400</Size>
    </Contents>
</ListBucketResult>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/xml" }),
        text: async () => mockXml,
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-physical-bucket",
        search: "list-type=2",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("<Name>my-physical-bucket</Name>");
      expect(text).toContain("<Key>existing.txt</Key>");
    });

    it("DeleteObject succeeds when Storage Quota is exceeded, cleans registry and decrements usedBytes", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "DELETE",
        bucketName: "my-physical-bucket",
        objectKey: "existing.txt",
        accessKeyId: rwAccessKeyId,
        secretAccessKey: rwSecretKey,
      });

      const res = await DELETE(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(204);

      // Verify database cleanup: object deleted, usedBytes decremented by 400 (1200 - 400 = 800)
      const [remainingObj] = await db
        .select()
        .from(managedObjects)
        .where(
          eq(managedObjects.managedBucketId, physicalBucketId),
        );
      expect(remainingObj).toBeUndefined();

      const [updatedBucket] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, physicalBucketId));
      expect(updatedBucket.usedBytes).toBe(800);
      // 800 <= 1000 quota, so status transitions back to active!
      expect(updatedBucket.status).toBe("active");
    });
  });

  describe("Virtual Prefix Isolation", () => {
    it("prepends virtual prefix when streaming PutObject upstream", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"vp-etag-1"' }),
        text: async () => "",
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "PUT",
        bucketName: "my-virtual-bucket",
        objectKey: "app/config.json",
        body: JSON.stringify({ key: "val" }),
        accessKeyId: vpAccessKeyId,
        secretAccessKey: vpSecretKey,
      });

      const res = await PUT(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);

      // Verify that upstream URL contains prepended virtual prefix
      const [upstreamCallUrl] = vi.mocked(fetch).mock.calls[0];
      expect(upstreamCallUrl).toContain(
        "real-upstream-bucket/split/tenant-virtual-123/app/config.json",
      );

      // Verify local object registry stores the clean client key
      const [storedObj] = await db
        .select()
        .from(managedObjects)
        .where(eq(managedObjects.managedBucketId, virtualBucketId));
      expect(storedObj.key).toBe("app/config.json");
    });

    it("prepends virtual prefix when fetching GetObject upstream", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          etag: '"vp-etag-2"',
          "content-type": "application/json",
        }),
        body: '{"status":"ok"}',
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-virtual-bucket",
        objectKey: "app/config.json",
        accessKeyId: vpAccessKeyId,
        secretAccessKey: vpSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);

      const [upstreamCallUrl] = vi.mocked(fetch).mock.calls[0];
      expect(upstreamCallUrl).toContain(
        "real-upstream-bucket/split/tenant-virtual-123/app/config.json",
      );
    });

    it("prepends virtual prefix on upstream ListObjectsV2 and strips prefix from client XML response", async () => {
      const upstreamXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>real-upstream-bucket</Name>
    <Prefix>split/tenant-virtual-123/</Prefix>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>split/tenant-virtual-123/</Key>
        <Size>0</Size>
    </Contents>
    <Contents>
        <Key>split/tenant-virtual-123/images/photo.png</Key>
        <Size>50000</Size>
        <ETag>"tag-photo"</ETag>
    </Contents>
    <Contents>
        <Key>split/tenant-virtual-123/docs/manual.pdf</Key>
        <Size>120000</Size>
        <ETag>"tag-manual"</ETag>
    </Contents>
</ListBucketResult>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/xml" }),
        text: async () => upstreamXml,
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "GET",
        bucketName: "my-virtual-bucket",
        search: "list-type=2",
        accessKeyId: vpAccessKeyId,
        secretAccessKey: vpSecretKey,
      });

      const res = await GET(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(200);

      // Verify upstream query had prepended prefix
      const [upstreamCallUrl] = vi.mocked(fetch).mock.calls[0];
      expect(upstreamCallUrl).toContain("prefix=split%2Ftenant-virtual-123%2F");

      // Verify client received clean XML with stripped prefix and rewritten bucket name
      const bodyXml = await res.text();
      expect(bodyXml).toContain("<Name>my-virtual-bucket</Name>");
      expect(bodyXml).toContain("<Key>images/photo.png</Key>");
      expect(bodyXml).toContain("<Key>docs/manual.pdf</Key>");
      expect(bodyXml).not.toContain("<Key>split/tenant-virtual-123/images/photo.png</Key>");
      // Root directory placeholder marker should be removed
      expect(bodyXml).not.toContain("<Key></Key>");
    });

    it("prepends virtual prefix when deleting object upstream", async () => {
      // Seed object
      await db.insert(managedObjects).values({
        id: "obj-vp-del",
        managedBucketId: virtualBucketId,
        key: "temp.log",
        sizeBytes: 150,
      });
      await db
        .update(managedBucket)
        .set({ usedBytes: 150 })
        .where(eq(managedBucket.id, virtualBucketId));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      } as unknown as Response);

      const { req, pathSegments } = createSignedRequest({
        method: "DELETE",
        bucketName: "my-virtual-bucket",
        objectKey: "temp.log",
        accessKeyId: vpAccessKeyId,
        secretAccessKey: vpSecretKey,
      });

      const res = await DELETE(req, {
        params: Promise.resolve({ path: pathSegments }),
      });

      expect(res.status).toBe(204);

      const [upstreamCallUrl] = vi.mocked(fetch).mock.calls[0];
      expect(upstreamCallUrl).toContain(
        "real-upstream-bucket/split/tenant-virtual-123/temp.log",
      );

      const [updatedBucket] = await db
        .select()
        .from(managedBucket)
        .where(eq(managedBucket.id, virtualBucketId));
      expect(updatedBucket.usedBytes).toBe(0);
    });
  });
});
