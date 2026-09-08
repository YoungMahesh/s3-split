import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

describe("AES-256-GCM Cryptography", () => {
  it("encrypts and decrypts a secret access key successfully", () => {
    const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(typeof encrypted).toBe("string");
    // format: iv:authTag:ciphertext
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12 bytes = 24 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
    expect(parts[2].length).toBeGreaterThan(0);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("produces distinct ciphertexts for identical plaintexts due to unique IVs", () => {
    const secret = "secret-value-12345";
    const encrypted1 = encryptSecret(secret);
    const encrypted2 = encryptSecret(secret);

    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptSecret(encrypted1)).toBe(secret);
    expect(decryptSecret(encrypted2)).toBe(secret);
  });

  it("throws an authentication error when ciphertext is tampered with", () => {
    const secret = "super-confidential-secret";
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(":");

    // Flip bits in the ciphertext hex string
    const tamperedCiphertext =
      parts[2].slice(0, -2) + (parts[2].endsWith("00") ? "ff" : "00");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

    expect(() => decryptSecret(tamperedPayload)).toThrow();
  });

  it("throws an error when auth tag is tampered with", () => {
    const secret = "super-confidential-secret";
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(":");

    const tamperedTag = "0".repeat(32);
    const tamperedPayload = `${parts[0]}:${tamperedTag}:${parts[2]}`;

    expect(() => decryptSecret(tamperedPayload)).toThrow();
  });

  it("throws an error on malformed encrypted payload", () => {
    expect(() => decryptSecret("invalid-payload")).toThrow(
      /Invalid encrypted payload format/,
    );
  });
});
