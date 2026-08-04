/**
 * AES-256-GCM encryption utility for sensitive at-rest values.
 *
 * Uso: `MetaWhatsAppConfig.accessToken` e `webhookVerifyToken` são gravados
 * cifrados aqui.
 * Plain values are NEVER returned from GET responses — only masked previews.
 *
 * Requires env: ENCRYPTION_KEY — 64 hex chars (32 bytes).
 * Generate with: openssl rand -hex 32
 *
 * Storage format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 16;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes). " +
        "Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string.
 * Returns a storable string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a value previously produced by `encrypt()`.
 * Throws if the value is tampered or the key is wrong.
 */
export function decrypt(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const ivHex = parts[0]!;
  const authTagHex = parts[1]!;
  const ciphertextHex = parts[2]!;

  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted value: bad IV or auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Returns a masked preview of a decrypted value for API responses.
 * Never returns the full value — even partial exposure helps debug config issues.
 * Example: "sk_live_abc...xyz"
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "***";
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}
