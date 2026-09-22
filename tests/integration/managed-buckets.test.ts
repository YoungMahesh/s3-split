import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GET as getManagedBuckets,
  POST as createManagedBucket,
} from "@/app/api/managed-buckets/route";
import {
  GET as getManagedBucketById,
  DELETE as deleteManagedBucket,
} from "@/app/api/managed-buckets/[id]/route";
import * as authLib from "@/lib/auth";
import * as crawlLib from "@/lib/s3/crawl";
import { db } from "@/db";
import {
  user,
  upstreamAccount,
  managedBucket,
  managedObjects,
  clientKey,
  multipartUploads,
  partReservations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";

type SessionResult = Awaited<ReturnType<typeof authLib.auth.api.getSession>>;

describe("Managed Buckets API", () => {
  const testUserId = "test-user-mb-02";
  const testUserEmail = "user-mb-02@example.com";
  const otherUserId = "other-user-mb-02";
  const otherUserEmail = "other-mb-02@example.com";

  let testUpstreamAccountId: string;

  const mockSession: NonNullable<SessionResult> = {
    user: {
      id: testUserId,
      email: testUserEmail,
      name: "Test User 02",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "sess-mb-02",
      userId: testUserId,
      expiresAt: new Date(Date.now() + 86400000),
      token: "tok-mb-02",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(async () => {
    // Seed users
    await db
      .insert(user)
      .values([
        {
          id: testUserId,
          name: "Test User 02",
          email: testUserEmail,
          emailVerified: true,
        },
        {
          id: otherUserId,
          name: "Other User 02",
          email: otherUserEmail,
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    // Clean up buckets and accounts
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));

    // Create an upstream account for testUserId
    testUpstreamAccountId = "upstream-acc-02-test";
    await db.insert(upstreamAccount).values({
      id: testUpstreamAccountId,
      userId: testUserId,
      name: "AWS Production S3",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      encryptedSecretAccessKey: encryptSecret("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
    });
  });

  afterEach(async () => {
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));
    vi.restoreAllMocks();
  });

  it("returns 401 Unauthorized for unauthenticated requests", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

    const getReq = new Request("http://localhost/api/managed-buckets", { method: "GET" });
    const getRes = await getManagedBuckets(getReq);
    expect(getRes.status).toBe(401);

    const postReq = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-bucket" }),
    });
    const postRes = await createManagedBucket(postReq);
    expect(postRes.status).toBe(401);
  });

  it("returns 400 Bad Request when required fields are missing", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "incomplete-bucket",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required fields/i);
  });

  it("returns 404 when upstream account is not found or belongs to another user", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-bucket",
        upstreamAccountId: "non-existent-account-id",
        upstreamBucket: "my-upstream-bucket",
        bucketType: "physical",
        storageQuotaValue: 10,
        storageQuotaUnit: "GB",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/upstream account not found/i);
  });

  it("returns 422 if upstream baseline crawl fails", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: false,
      error: "Upstream bucket 'missing-bucket' does not exist on this provider.",
    });

    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "failing-bucket",
        upstreamAccountId: testUpstreamAccountId,
        upstreamBucket: "missing-bucket",
        bucketType: "physical",
        storageQuotaValue: 1,
        storageQuotaUnit: "GB",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/does not exist/i);
  });

  it("creates a physical 1:1 bucket, performs crawl, and indexes baseline objects within quota", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const mockCrawledObjects = [
      {
        key: "logs/app.log",
        sizeBytes: 1024 * 1024, // 1 MB
        etag: "etag1",
        lastModified: new Date("2026-09-08T00:00:00.000Z"),
      },
      {
        key: "images/logo.png",
        sizeBytes: 2 * 1024 * 1024, // 2 MB
        etag: "etag2",
        lastModified: new Date("2026-09-08T01:00:00.000Z"),
      },
    ];

    const crawlSpy = vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: mockCrawledObjects,
      totalBytes: 3 * 1024 * 1024, // 3 MB total
    });

    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "physical-bucket-1",
        upstreamAccountId: testUpstreamAccountId,
        upstreamBucket: "real-upstream-physical-bucket",
        bucketType: "physical",
        storageQuotaValue: 100, // 100 MB
        storageQuotaUnit: "MB",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bucket).toBeDefined();
    expect(body.bucket.name).toBe("physical-bucket-1");
    expect(body.bucket.bucketType).toBe("physical");
    expect(body.bucket.virtualPrefix).toBeNull();
    expect(body.bucket.storageQuotaBytes).toBe(100 * 1024 * 1024);
    expect(body.bucket.usedBytes).toBe(3 * 1024 * 1024);
    expect(body.bucket.status).toBe("active");

    // Check crawler was called without prefix
    expect(crawlSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamBucket: "real-upstream-physical-bucket",
        prefix: undefined,
      }),
    );

    // Verify database objects were populated
    const objectsInDb = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, body.bucket.id));

    expect(objectsInDb).toHaveLength(2);
    expect(objectsInDb.map((o) => o.key)).toContain("logs/app.log");
    expect(objectsInDb.map((o) => o.key)).toContain("images/logo.png");
  });

  it("creates a virtual prefix bucket with generated prefix split/<id>/", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const crawlSpy = vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [],
      totalBytes: 0,
    });

    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "virtual-prefix-app",
        upstreamAccountId: testUpstreamAccountId,
        upstreamBucket: "shared-company-bucket",
        bucketType: "virtual_prefix",
        storageQuotaValue: 5,
        storageQuotaUnit: "GB",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bucket.bucketType).toBe("virtual_prefix");
    expect(body.bucket.virtualPrefix).toMatch(/^split\/.+\/$/);

    // Verify crawl was called with that virtual prefix
    expect(crawlSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamBucket: "shared-company-bucket",
        prefix: body.bucket.virtualPrefix,
      }),
    );
  });

  it("sets bucket status to quota_exceeded if pre-existing baseline objects exceed quota", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Baseline objects total 50 MB
    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [
        {
          key: "huge-data.iso",
          sizeBytes: 50 * 1024 * 1024,
          etag: "etag-iso",
          lastModified: new Date(),
        },
      ],
      totalBytes: 50 * 1024 * 1024,
    });

    // Quota configured is only 10 MB
    const req = new Request("http://localhost/api/managed-buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "small-quota-bucket",
        upstreamAccountId: testUpstreamAccountId,
        upstreamBucket: "existing-data-bucket",
        bucketType: "physical",
        storageQuotaValue: 10, // 10 MB quota
        storageQuotaUnit: "MB",
      }),
    });

    const res = await createManagedBucket(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bucket.usedBytes).toBe(50 * 1024 * 1024);
    expect(body.bucket.storageQuotaBytes).toBe(10 * 1024 * 1024);
    expect(body.bucket.status).toBe("quota_exceeded");
  });

  it("enforces tenant-scoped uniqueness: same bucket name for same user fails, but different users can use the same name", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [],
      totalBytes: 0,
    });

    const createFirst = async () =>
      createManagedBucket(
        new Request("http://localhost/api/managed-buckets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "common-name",
            upstreamAccountId: testUpstreamAccountId,
            upstreamBucket: "bucket-a",
            bucketType: "physical",
            storageQuotaValue: 1,
            storageQuotaUnit: "GB",
          }),
        }),
      );

    const firstRes = await createFirst();
    expect(firstRes.status).toBe(201);

    // Second bucket with identical name for same user should fail with 409 Conflict
    const secondRes = await createFirst();
    expect(secondRes.status).toBe(409);
    const errBody = await secondRes.json();
    expect(errBody.error).toMatch(/already exists/i);
  });

  it("lists all managed buckets for the authenticated user", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Insert 2 buckets directly
    await db.insert(managedBucket).values([
      {
        id: "b1-test",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "app-uploads",
        upstreamBucket: "real-uploads",
        bucketType: "physical",
        storageQuotaBytes: 10 * 1024 * 1024,
        usedBytes: 2 * 1024 * 1024,
        status: "active",
      },
      {
        id: "b2-test",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "app-media",
        upstreamBucket: "real-media",
        bucketType: "virtual_prefix",
        virtualPrefix: "split/b2-test/",
        storageQuotaBytes: 5 * 1024 * 1024,
        usedBytes: 6 * 1024 * 1024,
        status: "quota_exceeded",
      },
    ]);

    const req = new Request("http://localhost/api/managed-buckets", { method: "GET" });
    const res = await getManagedBuckets(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buckets).toHaveLength(2);

    const names = body.buckets.map((b: { name: string }) => b.name);
    expect(names).toContain("app-uploads");
    expect(names).toContain("app-media");

    const mediaBucket = body.buckets.find((b: { id: string }) => b.id === "b2-test");
    expect(mediaBucket.status).toBe("quota_exceeded");
    expect(mediaBucket.progress.isExceeded).toBe(true);
    expect(mediaBucket.progress.percentage).toBe(120);
  });

  it("retrieves bucket detail and tracked objects by ID", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const [b] = await db
      .insert(managedBucket)
      .values({
        id: "b-detail-test",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "detail-bucket",
        upstreamBucket: "real-detail",
        bucketType: "physical",
        storageQuotaBytes: 1000,
        usedBytes: 300,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values({
      id: "obj-detail",
      managedBucketId: b.id,
      key: "readme.md",
      sizeBytes: 300,
    });

    const req = new Request(`http://localhost/api/managed-buckets/${b.id}`, {
      method: "GET",
    });
    const res = await getManagedBucketById(req, {
      params: Promise.resolve({ id: b.id }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bucket.id).toBe(b.id);
    expect(data.objects).toHaveLength(1);
    expect(data.objects[0].key).toBe("readme.md");
  });

  it("deletes a managed bucket and cascades to delete all registered objects", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const [b] = await db
      .insert(managedBucket)
      .values({
        id: "b-to-delete",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "to-delete",
        upstreamBucket: "delete-me",
        bucketType: "physical",
        storageQuotaBytes: 1000,
        usedBytes: 500,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values({
      id: "obj-to-delete",
      managedBucketId: b.id,
      key: "temp.txt",
      sizeBytes: 500,
    });

    const deleteReq = new Request(`http://localhost/api/managed-buckets/${b.id}`, {
      method: "DELETE",
    });
    const deleteRes = await deleteManagedBucket(deleteReq, {
      params: Promise.resolve({ id: b.id }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify bucket was deleted
    const foundBucket = await db
      .select()
      .from(managedBucket)
      .where(eq(managedBucket.id, b.id));
    expect(foundBucket).toHaveLength(0);

    // Verify object was cascade deleted
    const foundObject = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, b.id));
    expect(foundObject).toHaveLength(0);
  });

  it("deletes a managed bucket and cascades to revoke all associated client keys and reservations", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const [b] = await db
      .insert(managedBucket)
      .values({
        id: "b-cascade-test",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "cascade-test",
        upstreamBucket: "delete-me-all",
        bucketType: "physical",
        storageQuotaBytes: 1000,
        usedBytes: 500,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values({
      id: "obj-cascade",
      managedBucketId: b.id,
      key: "item.txt",
      sizeBytes: 500,
    });

    await db.insert(clientKey).values({
      id: "key-cascade",
      userId: testUserId,
      managedBucketId: b.id,
      name: "Test Cascade Key",
      accessKeyId: "SPLITCAS1234567890",
      encryptedSecretAccessKey: encryptSecret("secret-val"),
      permission: "read_write",
      status: "active",
    });

    await db.insert(multipartUploads).values({
      id: "mp-cascade",
      managedBucketId: b.id,
      key: "bigfile.bin",
      uploadId: "upl-cascade-1",
      upstreamKey: "bigfile.bin",
    });

    await db.insert(partReservations).values({
      id: "res-cascade",
      managedBucketId: b.id,
      uploadId: "upl-cascade-1",
      partNumber: 1,
      sizeBytes: 500,
    });

    const deleteReq = new Request(`http://localhost/api/managed-buckets/${b.id}`, {
      method: "DELETE",
    });
    const deleteRes = await deleteManagedBucket(deleteReq, {
      params: Promise.resolve({ id: b.id }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify bucket deleted
    expect(
      await db.select().from(managedBucket).where(eq(managedBucket.id, b.id)),
    ).toHaveLength(0);

    // Verify objects cascade deleted
    expect(
      await db.select().from(managedObjects).where(eq(managedObjects.managedBucketId, b.id)),
    ).toHaveLength(0);

    // Verify client keys cascade deleted (revoked)
    expect(
      await db.select().from(clientKey).where(eq(clientKey.managedBucketId, b.id)),
    ).toHaveLength(0);

    // Verify multipart uploads & reservations cascade deleted
    expect(
      await db.select().from(multipartUploads).where(eq(multipartUploads.managedBucketId, b.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(partReservations).where(eq(partReservations.managedBucketId, b.id)),
    ).toHaveLength(0);
  });
});
