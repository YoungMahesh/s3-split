import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as reconcileBucket } from "@/app/api/managed-buckets/[id]/reconcile/route";
import * as authLib from "@/lib/auth";
import * as crawlLib from "@/lib/s3/crawl";
import { db } from "@/db";
import {
  user,
  upstreamAccount,
  managedBucket,
  managedObjects,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";

type SessionResult = Awaited<ReturnType<typeof authLib.auth.api.getSession>>;

describe("Storage Drift Reconciliation API (Ticket 06)", () => {
  const testUserId = "test-user-reconcile-06";
  const testUserEmail = "user-reconcile-06@example.com";
  const otherUserId = "other-user-reconcile-06";
  const otherUserEmail = "other-reconcile-06@example.com";

  let testUpstreamAccountId: string;

  const mockSession: NonNullable<SessionResult> = {
    user: {
      id: testUserId,
      email: testUserEmail,
      name: "Test User 06",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "sess-reconcile-06",
      userId: testUserId,
      expiresAt: new Date(Date.now() + 86400000),
      token: "tok-reconcile-06",
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
          name: "Test User 06",
          email: testUserEmail,
          emailVerified: true,
        },
        {
          id: otherUserId,
          name: "Other User 06",
          email: otherUserEmail,
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    // Clean up
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));

    // Create upstream account
    testUpstreamAccountId = "upstream-acc-reconcile";
    await db.insert(upstreamAccount).values({
      id: testUpstreamAccountId,
      userId: testUserId,
      name: "Test S3 Provider",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7RECONCILE",
      encryptedSecretAccessKey: encryptSecret("secret-reconcile-key"),
    });
  });

  afterEach(async () => {
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));
    vi.restoreAllMocks();
  });

  it("returns 401 Unauthorized for unauthenticated reconcile requests", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

    const req = new Request("http://localhost/api/managed-buckets/b-123/reconcile", {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: "b-123" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when bucket does not exist or belongs to another user", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const req = new Request("http://localhost/api/managed-buckets/non-existent/reconcile", {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: "non-existent" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 422 if upstream crawl fails and preserves existing records", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const [bucket] = await db
      .insert(managedBucket)
      .values({
        id: "b-crawl-fail",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "fail-bucket",
        upstreamBucket: "missing-upstream",
        bucketType: "physical",
        storageQuotaBytes: 10 * 1024 * 1024,
        usedBytes: 500,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values({
      id: "obj-safe",
      managedBucketId: bucket.id,
      key: "safe.txt",
      sizeBytes: 500,
    });

    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: false,
      error: "Upstream bucket 'missing-upstream' does not exist on this provider.",
    });

    const req = new Request(`http://localhost/api/managed-buckets/${bucket.id}/reconcile`, {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: bucket.id }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("missing-upstream");

    // Existing object should still be in the database intact
    const existingObjects = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, bucket.id));
    expect(existingObjects).toHaveLength(1);
    expect(existingObjects[0].key).toBe("safe.txt");
  });

  it("reconciles out-of-band upstream additions by inserting new object records and updating usedBytes", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Initial bucket with 1 object of 100 bytes
    const [bucket] = await db
      .insert(managedBucket)
      .values({
        id: "b-additions",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "additions-bucket",
        upstreamBucket: "my-real-bucket",
        bucketType: "physical",
        storageQuotaBytes: 10 * 1024 * 1024,
        usedBytes: 100,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values({
      id: "obj-init-1",
      managedBucketId: bucket.id,
      key: "existing.txt",
      sizeBytes: 100,
      etag: "etag-init",
    });

    // Simulated upstream crawl returns the existing object + 2 newly added objects
    const now = new Date();
    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [
        {
          key: "existing.txt",
          sizeBytes: 100,
          etag: "etag-init",
          lastModified: now,
        },
        {
          key: "photos/vacation.jpg",
          sizeBytes: 2500,
          etag: "etag-vacation",
          lastModified: now,
        },
        {
          key: "docs/specs.pdf",
          sizeBytes: 5000,
          etag: "etag-specs",
          lastModified: now,
        },
      ],
      totalBytes: 7600,
    });

    const req = new Request(`http://localhost/api/managed-buckets/${bucket.id}/reconcile`, {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: bucket.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reconciliation.addedCount).toBe(2);
    expect(body.reconciliation.deletedCount).toBe(0);
    expect(body.reconciliation.totalObjects).toBe(3);
    expect(body.reconciliation.usedBytes).toBe(7600);
    expect(body.reconciliation.driftBytes).toBe(7500);

    // Verify database state
    const objects = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, bucket.id));

    expect(objects).toHaveLength(3);
    const keys = objects.map((o) => o.key);
    expect(keys).toContain("existing.txt");
    expect(keys).toContain("photos/vacation.jpg");
    expect(keys).toContain("docs/specs.pdf");

    // Verify bucket usedBytes was updated
    const [updatedBucket] = await db
      .select()
      .from(managedBucket)
      .where(eq(managedBucket.id, bucket.id));
    expect(updatedBucket.usedBytes).toBe(7600);
    expect(updatedBucket.status).toBe("active");
  });

  it("reconciles out-of-band upstream deletions by removing missing records and decrementing usedBytes", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Initial bucket with 2 objects totaling 1000 bytes
    const [bucket] = await db
      .insert(managedBucket)
      .values({
        id: "b-deletions",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "deletions-bucket",
        upstreamBucket: "my-real-bucket",
        bucketType: "physical",
        storageQuotaBytes: 10 * 1024 * 1024,
        usedBytes: 1000,
        status: "active",
      })
      .returning();

    await db.insert(managedObjects).values([
      {
        id: "obj-keep",
        managedBucketId: bucket.id,
        key: "keep-me.txt",
        sizeBytes: 400,
        etag: "etag-keep",
      },
      {
        id: "obj-deleted-upstream",
        managedBucketId: bucket.id,
        key: "expired-lifecycle.log",
        sizeBytes: 600,
        etag: "etag-expired",
      },
    ]);

    // Upstream crawl only finds keep-me.txt (expired-lifecycle.log was purged upstream)
    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [
        {
          key: "keep-me.txt",
          sizeBytes: 400,
          etag: "etag-keep",
          lastModified: new Date(),
        },
      ],
      totalBytes: 400,
    });

    const req = new Request(`http://localhost/api/managed-buckets/${bucket.id}/reconcile`, {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: bucket.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reconciliation.deletedCount).toBe(1);
    expect(body.reconciliation.addedCount).toBe(0);
    expect(body.reconciliation.totalObjects).toBe(1);
    expect(body.reconciliation.usedBytes).toBe(400);
    expect(body.reconciliation.driftBytes).toBe(-600);

    // Verify database only has keep-me.txt
    const objects = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, bucket.id));

    expect(objects).toHaveLength(1);
    expect(objects[0].key).toBe("keep-me.txt");

    // Verify bucket usedBytes was decremented
    const [updatedBucket] = await db
      .select()
      .from(managedBucket)
      .where(eq(managedBucket.id, bucket.id));
    expect(updatedBucket.usedBytes).toBe(400);
  });

  it("transitions bucket status to quota_exceeded when upstream additions breach quota", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Quota is 5000 bytes
    const [bucket] = await db
      .insert(managedBucket)
      .values({
        id: "b-quota-check",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "quota-check-bucket",
        upstreamBucket: "my-real-bucket",
        bucketType: "physical",
        storageQuotaBytes: 5000,
        usedBytes: 2000,
        status: "active",
      })
      .returning();

    // Upstream has large file totaling 6000 bytes (> 5000 byte quota)
    vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [
        {
          key: "giant-payload.bin",
          sizeBytes: 6000,
          etag: "etag-giant",
          lastModified: new Date(),
        },
      ],
      totalBytes: 6000,
    });

    const req = new Request(`http://localhost/api/managed-buckets/${bucket.id}/reconcile`, {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: bucket.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reconciliation.status).toBe("quota_exceeded");
    expect(body.bucket.status).toBe("quota_exceeded");
    expect(body.bucket.progress.isExceeded).toBe(true);

    const [updated] = await db
      .select()
      .from(managedBucket)
      .where(eq(managedBucket.id, bucket.id));
    expect(updated.status).toBe("quota_exceeded");
    expect(updated.usedBytes).toBe(6000);
  });

  it("reconciles virtual prefix bucket properly without leaking virtual prefix", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const virtualPrefix = "split/b-vp-test/";
    const [bucket] = await db
      .insert(managedBucket)
      .values({
        id: "b-vp-test",
        userId: testUserId,
        upstreamAccountId: testUpstreamAccountId,
        name: "vp-bucket",
        upstreamBucket: "shared-bucket",
        bucketType: "virtual_prefix",
        virtualPrefix,
        storageQuotaBytes: 10 * 1024 * 1024,
        usedBytes: 0,
        status: "active",
      })
      .returning();

    const crawlSpy = vi.spyOn(crawlLib, "crawlUpstreamBucket").mockResolvedValue({
      ok: true,
      objects: [
        {
          key: "subfolder/file.json",
          sizeBytes: 1234,
          etag: "etag-json",
          lastModified: new Date(),
        },
      ],
      totalBytes: 1234,
    });

    const req = new Request(`http://localhost/api/managed-buckets/${bucket.id}/reconcile`, {
      method: "POST",
    });
    const res = await reconcileBucket(req, {
      params: Promise.resolve({ id: bucket.id }),
    });

    expect(res.status).toBe(200);
    expect(crawlSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        upstreamBucket: "shared-bucket",
        prefix: virtualPrefix,
      }),
    );

    const objects = await db
      .select()
      .from(managedObjects)
      .where(eq(managedObjects.managedBucketId, bucket.id));

    expect(objects).toHaveLength(1);
    expect(objects[0].key).toBe("subfolder/file.json");
    expect(objects[0].key.startsWith("split/")).toBe(false);
  });
});
