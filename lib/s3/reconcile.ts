import crypto from "node:crypto";
import { db } from "@/db";
import { managedBucket, managedObjects, upstreamAccount } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { crawlUpstreamBucket } from "./crawl";

export interface ReconcileResult {
  addedCount: number;
  deletedCount: number;
  updatedCount: number;
  totalObjects: number;
  usedBytes: number;
  previousUsedBytes: number;
  driftBytes: number;
  status: "active" | "quota_exceeded";
}

export type ReconcileOutcome =
  | { ok: true; result: ReconcileResult }
  | { ok: false; error: string; status: number };

/**
 * Reconciles storage drift for a Managed Bucket against upstream S3 storage.
 * Performs a fresh ListObjectsV2 crawl, synchronizes the database object registry
 * (inserting out-of-band additions, removing deleted objects, updating modified objects),
 * and accurately recalculates total used_bytes and quota health status atomically.
 */
export async function reconcileManagedBucket(
  bucketId: string,
  userId: string,
): Promise<ReconcileOutcome> {
  const [bucket] = await db
    .select({
      id: managedBucket.id,
      userId: managedBucket.userId,
      upstreamAccountId: managedBucket.upstreamAccountId,
      upstreamBucket: managedBucket.upstreamBucket,
      bucketType: managedBucket.bucketType,
      virtualPrefix: managedBucket.virtualPrefix,
      storageQuotaBytes: managedBucket.storageQuotaBytes,
      usedBytes: managedBucket.usedBytes,
      status: managedBucket.status,
      accountEndpointUrl: upstreamAccount.endpointUrl,
      accountRegion: upstreamAccount.region,
      accountAccessKeyId: upstreamAccount.accessKeyId,
      accountEncryptedSecret: upstreamAccount.encryptedSecretAccessKey,
    })
    .from(managedBucket)
    .innerJoin(
      upstreamAccount,
      eq(managedBucket.upstreamAccountId, upstreamAccount.id),
    )
    .where(
      and(
        eq(managedBucket.id, bucketId),
        eq(managedBucket.userId, userId),
      ),
    )
    .limit(1);

  if (!bucket) {
    return {
      ok: false,
      error: "Managed bucket not found or does not belong to user.",
      status: 404,
    };
  }

  let secretAccessKey: string;
  try {
    secretAccessKey = decryptSecret(bucket.accountEncryptedSecret);
  } catch {
    return {
      ok: false,
      error: "Failed to decrypt upstream credentials for crawl.",
      status: 500,
    };
  }

  const crawlResult = await crawlUpstreamBucket({
    credentials: {
      endpointUrl: bucket.accountEndpointUrl,
      region: bucket.accountRegion,
      accessKeyId: bucket.accountAccessKeyId,
      secretAccessKey,
    },
    upstreamBucket: bucket.upstreamBucket,
    prefix: bucket.virtualPrefix || undefined,
  });

  if (!crawlResult.ok) {
    return {
      ok: false,
      error: crawlResult.error,
      status: 422,
    };
  }

  const currentObjects = await db
    .select()
    .from(managedObjects)
    .where(eq(managedObjects.managedBucketId, bucket.id));

  const currentMap = new Map(currentObjects.map((obj) => [obj.key, obj]));
  const upstreamMap = new Map(crawlResult.objects.map((obj) => [obj.key, obj]));

  // Find objects deleted upstream
  const toDeleteIds: string[] = [];
  for (const [key, obj] of currentMap) {
    if (!upstreamMap.has(key)) {
      toDeleteIds.push(obj.id);
    }
  }

  // Find newly added objects upstream
  const toInsert: Array<{
    id: string;
    managedBucketId: string;
    key: string;
    sizeBytes: number;
    etag: string | null;
    lastModified: Date | null;
  }> = [];

  // Find modified objects
  const toUpdate: Array<{
    id: string;
    sizeBytes: number;
    etag: string | null;
    lastModified: Date | null;
  }> = [];

  for (const [key, crawled] of upstreamMap) {
    const existing = currentMap.get(key);
    if (!existing) {
      toInsert.push({
        id: crypto.randomUUID(),
        managedBucketId: bucket.id,
        key: crawled.key,
        sizeBytes: crawled.sizeBytes,
        etag: crawled.etag,
        lastModified: crawled.lastModified,
      });
    } else {
      const sizeChanged = existing.sizeBytes !== crawled.sizeBytes;
      const etagChanged = (existing.etag || "") !== (crawled.etag || "");
      const dateChanged =
        (existing.lastModified?.getTime() || 0) !==
        (crawled.lastModified?.getTime() || 0);

      if (sizeChanged || etagChanged || dateChanged) {
        toUpdate.push({
          id: existing.id,
          sizeBytes: crawled.sizeBytes,
          etag: crawled.etag,
          lastModified: crawled.lastModified,
        });
      }
    }
  }

  const totalUsedBytes = crawlResult.totalBytes;
  const newStatus: "active" | "quota_exceeded" =
    totalUsedBytes > bucket.storageQuotaBytes ? "quota_exceeded" : "active";
  const previousUsedBytes = bucket.usedBytes;
  const driftBytes = totalUsedBytes - previousUsedBytes;

  await db.transaction(async (tx) => {
    // Delete removed objects
    if (toDeleteIds.length > 0) {
      for (let i = 0; i < toDeleteIds.length; i += 500) {
        const chunk = toDeleteIds.slice(i, i + 500);
        await tx.delete(managedObjects).where(inArray(managedObjects.id, chunk));
      }
    }

    // Insert new objects
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500);
        await tx.insert(managedObjects).values(chunk);
      }
    }

    // Update modified objects
    for (const item of toUpdate) {
      await tx
        .update(managedObjects)
        .set({
          sizeBytes: item.sizeBytes,
          etag: item.etag,
          lastModified: item.lastModified,
        })
        .where(eq(managedObjects.id, item.id));
    }

    // Update managed bucket ledger and status
    await tx
      .update(managedBucket)
      .set({
        usedBytes: totalUsedBytes,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(managedBucket.id, bucket.id));
  });

  return {
    ok: true,
    result: {
      addedCount: toInsert.length,
      deletedCount: toDeleteIds.length,
      updatedCount: toUpdate.length,
      totalObjects: crawlResult.objects.length,
      usedBytes: totalUsedBytes,
      previousUsedBytes,
      driftBytes,
      status: newStatus,
    },
  };
}
