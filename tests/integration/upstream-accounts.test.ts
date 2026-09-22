import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as getAccounts, POST as createAccount } from "@/app/api/upstream-accounts/route";
import { DELETE as deleteAccount } from "@/app/api/upstream-accounts/[id]/route";
import * as authLib from "@/lib/auth";
import * as probeLib from "@/lib/s3/probe";
import { db } from "@/db";
import { upstreamAccount, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";

type SessionResult = Awaited<ReturnType<typeof authLib.auth.api.getSession>>;

describe("Upstream Accounts API", () => {
  const testUserId = "test-user-id-ticket-01";
  const testUserEmail = "ticket01@example.com";

  const mockSession: NonNullable<SessionResult> = {
    user: {
      id: testUserId,
      email: testUserEmail,
      name: "Test User 01",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "session-123",
      userId: testUserId,
      expiresAt: new Date(Date.now() + 86400000),
      token: "token-123",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(async () => {
    // Ensure test user exists in DB
    await db
      .insert(user)
      .values({
        id: testUserId,
        name: "Test User 01",
        email: testUserEmail,
        emailVerified: true,
      })
      .onConflictDoNothing();

    // Clean up any accounts for this user before each test
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
  });

  afterEach(async () => {
    await db.delete(upstreamAccount).where(eq(upstreamAccount.userId, testUserId));
    vi.restoreAllMocks();
  });

  it("returns 401 Unauthorized for unauthenticated GET and POST requests", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(null);

    const getReq = new Request("http://localhost/api/upstream-accounts", { method: "GET" });
    const getRes = await getAccounts(getReq);
    expect(getRes.status).toBe(401);

    const postReq = new Request("http://localhost/api/upstream-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const postRes = await createAccount(postReq);
    expect(postRes.status).toBe(401);
  });

  it("returns 400 Bad Request when required fields are missing", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    const req = new Request("http://localhost/api/upstream-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Upstream",
        // missing endpointUrl, region, accessKeyId, secretAccessKey
      }),
    });

    const res = await createAccount(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required fields/i);
  });

  it("aborts and does not create a record when upstream probe fails", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    vi.spyOn(probeLib, "probeUpstreamEndpoint").mockResolvedValue({
      ok: false,
      error: "Upstream authentication failed: Signature does not match.",
    });

    const req = new Request("http://localhost/api/upstream-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Failed Probe Account",
        endpointUrl: "https://s3.us-east-1.amazonaws.com",
        region: "us-east-1",
        accessKeyId: "AKIAINVALIDKEY",
        secretAccessKey: "badsecret",
      }),
    });

    const res = await createAccount(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Signature does not match");

    // Verify database has 0 records
    const stored = await db
      .select()
      .from(upstreamAccount)
      .where(eq(upstreamAccount.userId, testUserId));
    expect(stored).toHaveLength(0);
  });

  it("encrypts secret at rest and saves upstream account when probe succeeds", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    vi.spyOn(probeLib, "probeUpstreamEndpoint").mockResolvedValue({
      ok: true,
    });

    const rawSecret = "super-secret-aws-key-12345";
    const req = new Request("http://localhost/api/upstream-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Production S3",
        endpointUrl: "https://s3.us-east-1.amazonaws.com",
        region: "us-east-1",
        accessKeyId: "AKIAVALIDKEY123",
        secretAccessKey: rawSecret,
      }),
    });

    const res = await createAccount(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.account).toBeDefined();
    expect(data.account.name).toBe("Production S3");
    expect(data.account.accessKeyId).toBe("AKIAVALIDKEY123");
    expect(data.account.secretAccessKey).toBeUndefined();
    expect(data.account.encryptedSecretAccessKey).toBeUndefined();

    // Verify database record
    const records = await db
      .select()
      .from(upstreamAccount)
      .where(eq(upstreamAccount.userId, testUserId));
    expect(records).toHaveLength(1);
    const saved = records[0];
    expect(saved.name).toBe("Production S3");
    // Ensure raw secret was NOT saved in plain text
    expect(saved.encryptedSecretAccessKey).not.toBe(rawSecret);
    // Verify decrypted secret matches original
    expect(decryptSecret(saved.encryptedSecretAccessKey)).toBe(rawSecret);
  });

  it("lists accounts for user without leaking secrets", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    // Insert directly
    await db.insert(upstreamAccount).values({
      id: "acc-1",
      userId: testUserId,
      name: "List Account 1",
      endpointUrl: "https://s3.eu-central-1.amazonaws.com",
      region: "eu-central-1",
      accessKeyId: "KEY123",
      encryptedSecretAccessKey: "some:encrypted:secret",
    });

    const req = new Request("http://localhost/api/upstream-accounts", { method: "GET" });
    const res = await getAccounts(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].name).toBe("List Account 1");
    expect(data.accounts[0].accessKeyId).toBe("KEY123");
    expect(data.accounts[0].secretAccessKey).toBeUndefined();
    expect(data.accounts[0].encryptedSecretAccessKey).toBeUndefined();
  });

  it("deletes an account owned by user", async () => {
    vi.spyOn(authLib.auth.api, "getSession").mockResolvedValue(mockSession);

    await db.insert(upstreamAccount).values({
      id: "acc-to-delete",
      userId: testUserId,
      name: "To Delete",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "KEYDEL",
      encryptedSecretAccessKey: "some:encrypted:secret",
    });

    const deleteReq = new Request("http://localhost/api/upstream-accounts/acc-to-delete", {
      method: "DELETE",
    });
    const res = await deleteAccount(deleteReq, { params: Promise.resolve({ id: "acc-to-delete" }) });
    expect(res.status).toBe(200);

    const check = await db
      .select()
      .from(upstreamAccount)
      .where(eq(upstreamAccount.id, "acc-to-delete"));
    expect(check).toHaveLength(0);
  });
});
