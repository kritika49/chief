import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. Stored format: base64(iv[12] | tag[16] | ciphertext).

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Encrypts a JSON object of credentials. */
export function encryptJson(value: Record<string, unknown>): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = Record<string, unknown>>(stored: string): T {
  return JSON.parse(decrypt(stored)) as T;
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
