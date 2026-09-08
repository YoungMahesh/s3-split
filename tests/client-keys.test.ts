import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GET as getClientKeys,
  POST as createClientKey,
} from "@/app/api/managed-buckets/[id]/client-keys/route";
import { DELETE as revokeClientKey } from "@/app/api/client-keys/[id]/route";
import * as authLib from "@/lib/auth";
import { db } from "@/db";
import {
  user,
  upstreamAccount,
  managedBucket,
  clientKey,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  generateClientAccessKeyId,
  generateClientSecretAccessKey,
  resolveClientKey,
} from "@/lib/client-key";
import {
  generateAllSnippets,
  generateEnvSnippet,
  generateNodeSnippet,
  generatePythonSnippet,
  generateAwsCliSnippet,
} from "@/lib/snippets";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

type SessionResult = Awaited<ReturnType<typeof authLib.auth.api.getSession>>;

describe("Client Key Management (Ticket 03)", () => {
  const testUserId = "test-user-ck-03";
  const testUserEmail = "user-ck-03@example.com";
  const otherUserId = "other-user-ck-03";
  const otherUserEmail = "other-ck-03@example.com";

  let testUpstreamAccountId: string;
  let testBucketId: string;
  let otherBucketId: string;

  const mockSession: NonNullable<SessionResult> = {
    user: {
      id: testUserId,
      email: testUserEmail,
      name: "Test User 03",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "sess-ck-03",
      userId: testUserId,
      expiresAt: new Date(Date.now() + 86400000),
      token: "tok-ck-03",
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
          name: "Test User 03",
          email: testUserEmail,
          emailVerified: true,
        },
        {
          id: otherUserId,
          name: "Other User 03",
          email: otherUserEmail,
          emailVerified: true,
        },
      ])
      .onConflictDoNothing();

    // Clean up
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(clientKey).where(eq(clientKey.userId, otherUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));

    // Create upstream account for test user
    testUpstreamAccountId = "upstream-acc-03-test";
    await db.insert(upstreamAccount).values({
      id: testUpstreamAccountId,
      userId: testUserId,
      name: "AWS Test Provider",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      encryptedSecretAccessKey: encryptSecret("upstream-secret-raw-value-xyz"),
    });

    // Create a managed bucket for test user
    testBucketId = "mb-ck-03-test";
    await db.insert(managedBucket).values({
      id: testBucketId,
      userId: testUserId,
      upstreamAccountId: testUpstreamAccountId,
      name: "test-managed-bucket",
      upstreamBucket: "my-real-s3-bucket",
      bucketType: "physical",
      storageQuotaBytes: 10 * 1024 * 1024 * 1024,
      usedBytes: 1024,
      status: "active",
    });

    // Create a managed bucket for other user
    otherBucketId = "mb-ck-03-other";
    await db.insert(managedBucket).values({
      id: otherBucketId,
      userId: otherUserId,
      upstreamAccountId: testUpstreamAccountId,
      name: "other-user-bucket",
      upstreamBucket: "other-real-bucket",
      bucketType: "physical",
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      usedBytes: 0,
      status: "active",
    });
  });

  afterEach(async () => {
    await db.delete(clientKey).where(eq(clientKey.userId, testUserId));
    await db.delete(clientKey).where(eq(clientKey.userId, otherUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, testUserId));
    await db.delete(managedBucket).where(eq(managedBucket.userId, otherUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, otherUserId));
    vi.restoreAllMocks();
  });

  describe("Client Key Generator & Utilities", () => {
    it("generates 20-character uppercase accessKeyId starting with 'SPLIT'", () => {
      const keyId = generateClientAccessKeyId();
      expect(keyId).toHaveLength(20);
      expect(keyId.startsWith("SPLIT")).toBe(true);
      expect(keyId).toMatch(/^SPLIT[A-Z0-9]{15}$/);
    });

    it("generates distinct key IDs on consecutive calls", () => {
      const id1 = generateClientAccessKeyId();
      const id2 = generateClientAccessKeyId();
      expect(id1).not.toBe(id2);
    });

    it("generates 40-character secret access key with high entropy", () => {
      const secret1 = generateClientSecretAccessKey();
      const secret2 = generateClientSecretAccessKey();
      expect(secret1).toHaveLength(40);
      expect(secret2).toHaveLength(40);
      expect(secret1).not.toBe(secret2);
    });
  });

  describe("Integration Snippets Generator", () => {
    const opts = {
      endpointUrl: "http://localhost:3000/api/s3",
      bucketName: "my-app-storage",
      accessKeyId: "SPLIT1234567890ABCDE",
      secretAccessKey: "supersecretaccesskey1234567890abcdefghij",
      region: "us-east-1",
    };

    it("generates .env configuration snippet", () => {
      const snippet = generateEnvSnippet(opts);
      expect(snippet).toContain("AWS_ENDPOINT_URL=http://localhost:3000/api/s3");
      expect(snippet).toContain("AWS_ACCESS_KEY_ID=SPLIT1234567890ABCDE");
      expect(snippet).toContain("AWS_SECRET_ACCESS_KEY=supersecretaccesskey1234567890abcdefghij");
      expect(snippet).toContain("S3_BUCKET_NAME=my-app-storage");
      expect(snippet).toContain("AWS_REGION=us-east-1");
    });

    it("generates Node.js (@aws-sdk/client-s3) snippet with forcePathStyle: true", () => {
      const snippet = generateNodeSnippet(opts);
      expect(snippet).toContain('endpoint: "http://localhost:3000/api/s3"');
      expect(snippet).toContain('accessKeyId: "SPLIT1234567890ABCDE"');
      expect(snippet).toContain('secretAccessKey: "supersecretaccesskey1234567890abcdefghij"');
      expect(snippet).toContain("forcePathStyle: true");
      expect(snippet).toContain('Bucket: "my-app-storage"');
    });

    it("generates Python (boto3) snippet", () => {
      const snippet = generatePythonSnippet(opts);
      expect(snippet).toContain('endpoint_url="http://localhost:3000/api/s3"');
      expect(snippet).toContain('aws_access_key_id="SPLIT1234567890ABCDE"');
      expect(snippet).toContain('aws_secret_access_key="supersecretaccesskey1234567890abcdefghij"');
      expect(snippet).toContain('Bucket="my-app-storage"');
    });

    it("generates AWS CLI snippet with custom profile and endpoint", () => {
      const snippet = generateAwsCliSnippet(opts);
      expect(snippet).toContain('aws configure set aws_access_key_id "SPLIT1234567890ABCDE" --profile s3-split');
      expect(snippet).toContain('aws configure set aws_secret_access_key "supersecretaccesskey1234567890abcdefghij" --profile s3-split');
      expect(snippet).toContain("aws s3 ls s3://my-app-storage/ --endpoint-url http://localhost:3000/api/s3 --profile s3-split");
    });

    it("generateAllSnippets returns all 4 formats", () => {
      const all = generateAllSnippets(opts);
      expect(all.env).toBeDefined();
      expect(all.node).toBeDefined();
      expect(all.python).toBeDefined();
      expect(all.awsCli).toBeDefined();
    });
  });

  describe("Client Keys API - POST /api/managed-buckets/[id]/client-keys", () => {
    it("returns 401 Unauthorized for unauthenticated requests", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Key" }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 if the managed bucket belongs to another user or does not exist", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${otherBucketId}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unauthorized Key" }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: otherBucketId }) });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/managed bucket not found/i);
    });

    it("returns 400 Bad Request when key name is missing or invalid", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/key name is required/i);
    });

    it("returns 400 Bad Request when permission is invalid", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Invalid Scope Key", permission: "admin" }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid permission scope/i);
    });

    it("creates a client key with default read_write scope, encrypts secret at rest with AES-256-GCM, and provides one-time reveal", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "custom.domain.test:3000",
        },
        body: JSON.stringify({ name: "Production Ingestion Worker" }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.key).toBeDefined();
      expect(data.key.name).toBe("Production Ingestion Worker");
      expect(data.key.accessKeyId).toMatch(/^SPLIT[A-Z0-9]{15}$/);
      expect(data.key.permission).toBe("read_write");
      expect(data.key.status).toBe("active");

      // Plaintext secret access key in one-time reveal
      expect(data.secretAccessKey).toBeDefined();
      expect(data.secretAccessKey).toHaveLength(40);

      // Integration snippets generated with correct endpoint URL
      expect(data.snippets).toBeDefined();
      expect(data.snippets.env).toContain("AWS_ENDPOINT_URL=http://custom.domain.test:3000/api/s3");
      expect(data.snippets.env).toContain(`AWS_ACCESS_KEY_ID=${data.key.accessKeyId}`);
      expect(data.snippets.env).toContain(`AWS_SECRET_ACCESS_KEY=${data.secretAccessKey}`);
      expect(data.snippets.node).toContain("forcePathStyle: true");

      // Verify Database Storage: Secret is encrypted at rest using AES-256-GCM
      const [storedKey] = await db
        .select()
        .from(clientKey)
        .where(eq(clientKey.id, data.key.id));

      expect(storedKey).toBeDefined();
      expect(storedKey.encryptedSecretAccessKey).not.toBe(data.secretAccessKey);
      // Format: ivHex:authTagHex:ciphertextHex (3 parts separated by colons)
      expect(storedKey.encryptedSecretAccessKey.split(":")).toHaveLength(3);

      // Round-trip decryption verification
      const decrypted = decryptSecret(storedKey.encryptedSecretAccessKey);
      expect(decrypted).toBe(data.secretAccessKey);
    });

    it("creates a client key with read_only permission scope", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Analytics Read-Only Key",
          permission: "read_only",
        }),
      });

      const res = await createClientKey(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.key.permission).toBe("read_only");

      const [storedKey] = await db
        .select()
        .from(clientKey)
        .where(eq(clientKey.id, data.key.id));
      expect(storedKey.permission).toBe("read_only");
    });
  });

  describe("Client Keys API - GET /api/managed-buckets/[id]/client-keys", () => {
    it("returns 401 Unauthorized for unauthenticated requests", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "GET",
      });

      const res = await getClientKeys(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 for buckets belonging to another user", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const req = new Request(`http://localhost/api/managed-buckets/${otherBucketId}/client-keys`, {
        method: "GET",
      });

      const res = await getClientKeys(req, { params: Promise.resolve({ id: otherBucketId }) });
      expect(res.status).toBe(404);
    });

    it("lists active client keys and strictly NEVER exposes secretAccessKey (One-Time Reveal enforcement)", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      // Seed 2 active keys and 1 revoked key
      await db.insert(clientKey).values([
        {
          id: "key-active-1",
          userId: testUserId,
          managedBucketId: testBucketId,
          name: "Active Key 1",
          accessKeyId: "SPLIT111111111111111",
          encryptedSecretAccessKey: encryptSecret("secret-1"),
          permission: "read_write",
          status: "active",
        },
        {
          id: "key-active-2",
          userId: testUserId,
          managedBucketId: testBucketId,
          name: "Active Key 2",
          accessKeyId: "SPLIT222222222222222",
          encryptedSecretAccessKey: encryptSecret("secret-2"),
          permission: "read_only",
          status: "active",
        },
        {
          id: "key-revoked-3",
          userId: testUserId,
          managedBucketId: testBucketId,
          name: "Revoked Key 3",
          accessKeyId: "SPLIT333333333333333",
          encryptedSecretAccessKey: encryptSecret("secret-3"),
          permission: "read_write",
          status: "revoked",
        },
      ]);

      const req = new Request(`http://localhost/api/managed-buckets/${testBucketId}/client-keys`, {
        method: "GET",
      });

      const res = await getClientKeys(req, { params: Promise.resolve({ id: testBucketId }) });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.keys).toHaveLength(2);
      const keyIds = data.keys.map((k: { id: string }) => k.id);
      expect(keyIds).toContain("key-active-1");
      expect(keyIds).toContain("key-active-2");
      expect(keyIds).not.toContain("key-revoked-3");

      // Verify metadata fields
      for (const k of data.keys) {
        expect(k.name).toBeDefined();
        expect(k.accessKeyId).toBeDefined();
        expect(k.permission).toBeDefined();
        expect(k.status).toBe("active");
        expect(k.createdAt).toBeDefined();

        // ONE-TIME REVEAL SECURITY: secret is never leaked!
        expect(k.secretAccessKey).toBeUndefined();
        expect(k.encryptedSecretAccessKey).toBeUndefined();
      }
    });
  });

  describe("Client Key Revocation - DELETE /api/client-keys/[id]", () => {
    it("returns 401 Unauthorized for unauthenticated requests", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

      const req = new Request("http://localhost/api/client-keys/key-to-revoke", {
        method: "DELETE",
      });

      const res = await revokeClientKey(req, { params: Promise.resolve({ id: "key-to-revoke" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when key does not exist or belongs to another user", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      // Create a key for other user
      await db.insert(clientKey).values({
        id: "other-user-key",
        userId: otherUserId,
        managedBucketId: otherBucketId,
        name: "Foreign Key",
        accessKeyId: "SPLIT999999999999999",
        encryptedSecretAccessKey: encryptSecret("secret-foreign"),
        permission: "read_write",
        status: "active",
      });

      const req = new Request("http://localhost/api/client-keys/other-user-key", {
        method: "DELETE",
      });

      const res = await revokeClientKey(req, { params: Promise.resolve({ id: "other-user-key" }) });
      expect(res.status).toBe(404);
    });

    it("immediately revokes active client key and enforces revocation gating", async () => {
      vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

      const targetKeyId = "ckey-to-be-revoked";
      const targetAccessKeyId = "SPLITREVOKE12345678";
      const rawSecret = "raw-secret-before-revocation-1234567890";

      await db.insert(clientKey).values({
        id: targetKeyId,
        userId: testUserId,
        managedBucketId: testBucketId,
        name: "Key to Revoke",
        accessKeyId: targetAccessKeyId,
        encryptedSecretAccessKey: encryptSecret(rawSecret),
        permission: "read_write",
        status: "active",
      });

      // Gateway resolution succeeds while key is active
      const activeResolution = await resolveClientKey(targetAccessKeyId);
      expect(activeResolution).not.toBeNull();
      expect(activeResolution?.secretAccessKey).toBe(rawSecret);
      expect(activeResolution?.managedBucket.name).toBe("test-managed-bucket");

      // Revoke the key
      const req = new Request(`http://localhost/api/client-keys/${targetKeyId}`, {
        method: "DELETE",
      });

      const res = await revokeClientKey(req, { params: Promise.resolve({ id: targetKeyId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify status in database
      const [updated] = await db
        .select()
        .from(clientKey)
        .where(eq(clientKey.id, targetKeyId));
      expect(updated.status).toBe("revoked");

      // REVOCATION GATING: Gateway resolution MUST fail (return null) for revoked keys!
      const revokedResolution = await resolveClientKey(targetAccessKeyId);
      expect(revokedResolution).toBeNull();
    });
  });
});
