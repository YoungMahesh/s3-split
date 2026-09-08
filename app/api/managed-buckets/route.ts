import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  managedBucket,
  managedObjects,
  upstreamAccount,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { crawlUpstreamBucket } from "@/lib/s3/crawl";
import { parseQuotaToBytes, calculateQuotaProgress, type StorageQuotaUnit } from "@/lib/quota";
import crypto from "node:crypto";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const buckets = await db
    .select({
      id: managedBucket.id,
      name: managedBucket.name,
      upstreamAccountId: managedBucket.upstreamAccountId,
      upstreamAccountName: upstreamAccount.name,
      upstreamBucket: managedBucket.upstreamBucket,
      bucketType: managedBucket.bucketType,
      virtualPrefix: managedBucket.virtualPrefix,
      storageQuotaBytes: managedBucket.storageQuotaBytes,
      usedBytes: managedBucket.usedBytes,
      status: managedBucket.status,
      createdAt: managedBucket.createdAt,
      updatedAt: managedBucket.updatedAt,
      objectCount: sql<number>`count(${managedObjects.id})::int`,
    })
    .from(managedBucket)
    .leftJoin(
      upstreamAccount,
      eq(managedBucket.upstreamAccountId, upstreamAccount.id),
    )
    .leftJoin(
      managedObjects,
      eq(managedBucket.id, managedObjects.managedBucketId),
    )
    .where(eq(managedBucket.userId, session.user.id))
    .groupBy(managedBucket.id, upstreamAccount.id)
    .orderBy(desc(managedBucket.createdAt));

  const bucketsWithProgress = buckets.map((b) => ({
    ...b,
    progress: calculateQuotaProgress(b.usedBytes, b.storageQuotaBytes),
  }));

  return NextResponse.json({ buckets: bucketsWithProgress });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    upstreamAccountId?: string;
    upstreamBucket?: string;
    bucketType?: "physical" | "virtual_prefix";
    storageQuotaValue?: number;
    storageQuotaUnit?: StorageQuotaUnit;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    upstreamAccountId,
    upstreamBucket: upstreamBucketName,
    bucketType = "physical",
    storageQuotaValue,
    storageQuotaUnit,
  } = body || {};

  if (
    !name?.trim() ||
    !upstreamAccountId?.trim() ||
    !upstreamBucketName?.trim() ||
    storageQuotaValue === undefined ||
    !storageQuotaUnit
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Bucket name, upstream account, upstream bucket, quota value, and quota unit are all required.",
      },
      { status: 400 },
    );
  }

  const trimmedName = name.trim().toLowerCase();
  const trimmedUpstreamBucket = upstreamBucketName.trim();

  // Validate bucket naming: 3 to 63 chars, lowercase alphanumeric, hyphens, dots
  const bucketNameRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
  if (!bucketNameRegex.test(trimmedName)) {
    return NextResponse.json(
      {
        error:
          "Invalid bucket name. Must be between 3 and 63 characters, start and end with a lowercase letter or number, and contain only lowercase letters, numbers, hyphens, or dots.",
      },
      { status: 400 },
    );
  }

  // Calculate storage quota in bytes
  let storageQuotaBytes: number;
  try {
    storageQuotaBytes = parseQuotaToBytes(
      Number(storageQuotaValue),
      storageQuotaUnit,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid quota value" },
      { status: 400 },
    );
  }

  // Verify the upstream account belongs to this user
  const [account] = await db
    .select()
    .from(upstreamAccount)
    .where(
      and(
        eq(upstreamAccount.id, upstreamAccountId.trim()),
        eq(upstreamAccount.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!account) {
    return NextResponse.json(
      { error: "Upstream account not found or does not belong to user." },
      { status: 404 },
    );
  }

  // Check tenant-scoped bucket uniqueness
  const [existing] = await db
    .select({ id: managedBucket.id })
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.userId, session.user.id),
        eq(managedBucket.name, trimmedName),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        error: `A managed bucket with the name '${trimmedName}' already exists in your account. Bucket names must be unique per account.`,
      },
      { status: 409 },
    );
  }

  const bucketId = crypto.randomUUID();
  const isVirtualPrefix = bucketType === "virtual_prefix";
  const virtualPrefix = isVirtualPrefix ? `split/${bucketId}/` : null;

  // Decrypt upstream credentials for the baseline crawl
  let secretAccessKey: string;
  try {
    secretAccessKey = decryptSecret(account.encryptedSecretAccessKey);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt upstream credentials for crawl." },
      { status: 500 },
    );
  }

  // Perform initial baseline crawl to index existing objects and compute baseline used_bytes
  const crawlResult = await crawlUpstreamBucket({
    credentials: {
      endpointUrl: account.endpointUrl,
      region: account.region,
      accessKeyId: account.accessKeyId,
      secretAccessKey,
    },
    upstreamBucket: trimmedUpstreamBucket,
    prefix: virtualPrefix || undefined,
  });

  if (!crawlResult.ok) {
    return NextResponse.json(
      { error: crawlResult.error },
      { status: 422 },
    );
  }

  const totalUsedBytes = crawlResult.totalBytes;
  const initialStatus =
    totalUsedBytes > storageQuotaBytes ? "quota_exceeded" : "active";

  // Insert bucket and crawled objects into database atomically
  const [created] = await db
    .insert(managedBucket)
    .values({
      id: bucketId,
      userId: session.user.id,
      upstreamAccountId: account.id,
      name: trimmedName,
      upstreamBucket: trimmedUpstreamBucket,
      bucketType: isVirtualPrefix ? "virtual_prefix" : "physical",
      virtualPrefix,
      storageQuotaBytes,
      usedBytes: totalUsedBytes,
      status: initialStatus,
    })
    .returning();

  if (crawlResult.objects.length > 0) {
    const objectRows = crawlResult.objects.map((obj) => ({
      id: crypto.randomUUID(),
      managedBucketId: bucketId,
      key: obj.key,
      sizeBytes: obj.sizeBytes,
      etag: obj.etag,
      lastModified: obj.lastModified,
    }));

    // Batch insert in chunks of 500
    for (let i = 0; i < objectRows.length; i += 500) {
      const chunk = objectRows.slice(i, i + 500);
      await db.insert(managedObjects).values(chunk);
    }
  }

  return NextResponse.json(
    {
      bucket: {
        ...created,
        progress: calculateQuotaProgress(
          created.usedBytes,
          created.storageQuotaBytes,
        ),
      },
    },
    { status: 201 },
  );
}
