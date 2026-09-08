import crypto from "node:crypto";
import { db } from "@/db";
import { clientKey, managedBucket, upstreamAccount } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generates a 20-character AWS-compatible Client Access Key ID
 * starting with "SPLIT" followed by 15 uppercase alphanumeric characters.
 */
export function generateClientAccessKeyId(): string {
  const randomBytes = crypto.randomBytes(15);
  let id = "SPLIT";
  for (let i = 0; i < 15; i++) {
    id += KEY_CHARS[randomBytes[i] % KEY_CHARS.length];
  }
  return id;
}

/**
 * Generates a cryptographically strong 40-character Client Secret Access Key.
 * Uses base64url characters (A-Z, a-z, 0-9, -, _) for maximum compatibility.
 */
export function generateClientSecretAccessKey(): string {
  // 30 bytes of entropy -> 40 base64 characters
  const raw = crypto.randomBytes(30).toString("base64");
  // Replace '+' and '/' with url-safe alphanumeric-compatible characters if desired,
  // or return standard 40-char string without padding
  return raw.replace(/\+/g, "A").replace(/\//g, "B").replace(/=/g, "C").slice(0, 40);
}

export interface ResolvedClientKey {
  keyId: string;
  accessKeyId: string;
  secretAccessKey: string;
  name: string;
  permission: "read_write" | "read_only";
  status: "active" | "revoked";
  userId: string;
  managedBucket: {
    id: string;
    name: string;
    bucketType: string;
    virtualPrefix: string | null;
    upstreamBucket: string;
    storageQuotaBytes: number;
    usedBytes: number;
    status: string;
  };
  upstreamAccount: {
    id: string;
    endpointUrl: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Resolves a Client Key by accessKeyId for gateway authentication.
 * Enforces revocation gating: returns null if the key is revoked or does not exist.
 */
export async function resolveClientKey(
  accessKeyId: string,
): Promise<ResolvedClientKey | null> {
  const [record] = await db
    .select({
      keyId: clientKey.id,
      accessKeyId: clientKey.accessKeyId,
      encryptedSecretAccessKey: clientKey.encryptedSecretAccessKey,
      name: clientKey.name,
      permission: clientKey.permission,
      status: clientKey.status,
      userId: clientKey.userId,
      bucketId: managedBucket.id,
      bucketName: managedBucket.name,
      bucketType: managedBucket.bucketType,
      virtualPrefix: managedBucket.virtualPrefix,
      upstreamBucket: managedBucket.upstreamBucket,
      storageQuotaBytes: managedBucket.storageQuotaBytes,
      usedBytes: managedBucket.usedBytes,
      bucketStatus: managedBucket.status,
      upstreamId: upstreamAccount.id,
      upstreamEndpointUrl: upstreamAccount.endpointUrl,
      upstreamRegion: upstreamAccount.region,
      upstreamAccessKeyId: upstreamAccount.accessKeyId,
      upstreamEncryptedSecret: upstreamAccount.encryptedSecretAccessKey,
    })
    .from(clientKey)
    .innerJoin(managedBucket, eq(clientKey.managedBucketId, managedBucket.id))
    .innerJoin(
      upstreamAccount,
      eq(managedBucket.upstreamAccountId, upstreamAccount.id),
    )
    .where(and(eq(clientKey.accessKeyId, accessKeyId), eq(clientKey.status, "active")))
    .limit(1);

  if (!record) {
    return null;
  }

  const clientSecret = decryptSecret(record.encryptedSecretAccessKey);
  const upstreamSecret = decryptSecret(record.upstreamEncryptedSecret);

  return {
    keyId: record.keyId,
    accessKeyId: record.accessKeyId,
    secretAccessKey: clientSecret,
    name: record.name,
    permission: record.permission as "read_write" | "read_only",
    status: record.status as "active" | "revoked",
    userId: record.userId,
    managedBucket: {
      id: record.bucketId,
      name: record.bucketName,
      bucketType: record.bucketType,
      virtualPrefix: record.virtualPrefix,
      upstreamBucket: record.upstreamBucket,
      storageQuotaBytes: record.storageQuotaBytes,
      usedBytes: record.usedBytes,
      status: record.bucketStatus,
    },
    upstreamAccount: {
      id: record.upstreamId,
      endpointUrl: record.upstreamEndpointUrl,
      region: record.upstreamRegion,
      accessKeyId: record.upstreamAccessKeyId,
      secretAccessKey: upstreamSecret,
    },
  };
}

/**
 * Updates the lastUsedAt timestamp for an active client key.
 */
export async function touchClientKeyLastUsed(keyId: string): Promise<void> {
  await db
    .update(clientKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(clientKey.id, keyId));
}
