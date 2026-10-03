import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, decryptJson, encrypt, encryptJson } from "./crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips text and JSON", () => {
    expect(decrypt(encrypt("hello ✓"))).toBe("hello ✓");
    expect(decryptJson(encryptJson({ a: 1 }))).toEqual({ a: 1 });
  });

  it("produces different ciphertext each time", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("rejects tampered data", () => {
    const c = Buffer.from(encrypt("secret"), "base64");
    c[c.length - 1] ^= 1;
    expect(() => decrypt(c.toString("base64"))).toThrow();
  });
});
