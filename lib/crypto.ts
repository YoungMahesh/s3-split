import crypto from "node:crypto";

/**
 * Derives a 32-byte (256-bit) encryption key from the environment.
 * Prefers DATA_ENCRYPTION_KEY, falls back to BETTER_AUTH_SECRET.
 */
function getEncryptionKey(): Buffer {
  const masterSecret =
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    "s3-split-fallback-master-encryption-key-for-development-32b";

  // SHA-256 digest ensures exactly 32 bytes regardless of input format or length
  return crypto.createHash("sha256").update(masterSecret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 12-byte IV.
 * Returns formatted string: `${ivHex}:${authTagHex}:${ciphertextHex}`
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypts an encrypted payload formatted as `${ivHex}:${authTagHex}:${ciphertextHex}`
 * using AES-256-GCM.
 * Throws an error if the payload is malformed or if tag authentication fails.
 */
export function decryptSecret(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted payload format. Expected 'iv:authTag:ciphertext'",
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error(
      "Invalid encrypted payload format. Missing component in 'iv:authTag:ciphertext'",
    );
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
