import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { clientKey, managedBucket } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";
import {
  generateClientAccessKeyId,
  generateClientSecretAccessKey,
} from "@/lib/client-key";
import { generateAllSnippets } from "@/lib/snippets";
import crypto from "node:crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bucketId } = await params;

  // Verify that the bucket exists and belongs to the authenticated user
  const [bucket] = await db
    .select({ id: managedBucket.id, name: managedBucket.name })
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.id, bucketId),
        eq(managedBucket.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!bucket) {
    return NextResponse.json(
      { error: "Managed bucket not found." },
      { status: 404 },
    );
  }

  // Retrieve active client keys for this managed bucket
  // Notice: secret keys are STRICTLY OMITTED to guarantee one-time reveal security
  const keys = await db
    .select({
      id: clientKey.id,
      name: clientKey.name,
      accessKeyId: clientKey.accessKeyId,
      permission: clientKey.permission,
      status: clientKey.status,
      lastUsedAt: clientKey.lastUsedAt,
      createdAt: clientKey.createdAt,
    })
    .from(clientKey)
    .where(
      and(
        eq(clientKey.managedBucketId, bucketId),
        eq(clientKey.userId, session.user.id),
        eq(clientKey.status, "active"),
      ),
    )
    .orderBy(desc(clientKey.createdAt));

  return NextResponse.json({ keys });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bucketId } = await params;

  // Verify that the bucket exists and belongs to the authenticated user
  const [bucket] = await db
    .select({ id: managedBucket.id, name: managedBucket.name })
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.id, bucketId),
        eq(managedBucket.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!bucket) {
    return NextResponse.json(
      { error: "Managed bucket not found." },
      { status: 404 },
    );
  }

  let body: {
    name?: string;
    permission?: "read_write" | "read_only";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, permission = "read_write" } = body || {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Key name is required." },
      { status: 400 },
    );
  }

  if (permission !== "read_write" && permission !== "read_only") {
    return NextResponse.json(
      { error: "Invalid permission scope. Allowed values: 'read_write', 'read_only'." },
      { status: 400 },
    );
  }

  const keyId = `ckey_${crypto.randomUUID()}`;
  const accessKeyId = generateClientAccessKeyId();
  const secretAccessKey = generateClientSecretAccessKey();
  const encryptedSecret = encryptSecret(secretAccessKey);

  await db.insert(clientKey).values({
    id: keyId,
    userId: session.user.id,
    managedBucketId: bucket.id,
    name: name.trim(),
    accessKeyId,
    encryptedSecretAccessKey: encryptedSecret,
    permission,
    status: "active",
  });

  // Build the endpoint URL for code snippets
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const endpointUrl = `${proto}://${host}/api/s3`;

  const snippets = generateAllSnippets({
    endpointUrl,
    bucketName: bucket.name,
    accessKeyId,
    secretAccessKey,
    region: "us-east-1",
  });

  // ONE-TIME REVEAL response containing plaintext secret and snippets
  return NextResponse.json(
    {
      key: {
        id: keyId,
        managedBucketId: bucket.id,
        name: name.trim(),
        accessKeyId,
        permission,
        status: "active" as const,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      },
      secretAccessKey,
      snippets,
    },
    { status: 201 },
  );
}
