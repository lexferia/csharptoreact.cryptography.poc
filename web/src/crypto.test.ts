import { describe, it, expect } from "vitest";
import { importKey, encryptWith, decryptWith } from "./crypto";

// 32 zero bytes base64-encoded = matches the C# test key.
const TEST_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
// Same length, differs in the last byte.
const OTHER_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

describe("crypto", () => {
  it("round-trips encrypt then decrypt", async () => {
    const key = await importKey(TEST_KEY_B64);
    const url = "https://picsum.photos/seed/1/400/300";

    const cipher = await encryptWith(key, url);
    const result = await decryptWith(key, cipher);

    expect(result).toBe(url);
  });

  it("produces the nonce||ciphertext||tag wire format with a fresh nonce each call", async () => {
    const key = await importKey(TEST_KEY_B64);

    const a = await encryptWith(key, "x");
    const b = await encryptWith(key, "x");
    const ba = base64ToBytes(a);
    const bb = base64ToBytes(b);

    // 12-byte nonce + 16-byte tag + at least 1 byte ciphertext.
    expect(ba.length).toBeGreaterThanOrEqual(12 + 16 + 1);
    // Nonce (first 12 bytes) must differ across calls.
    expect(Array.from(ba.slice(0, 12))).not.toEqual(Array.from(bb.slice(0, 12)));
    // And the nonce really is in the leading slot: decrypt succeeds.
    await expect(decryptWith(key, a)).resolves.toBe("x");
  });

  it("rejects a tampered ciphertext (AES-GCM authentication)", async () => {
    const key = await importKey(TEST_KEY_B64);
    const cipher = await encryptWith(key, "hello");
    const bytes = base64ToBytes(cipher);
    bytes[bytes.length - 1] ^= 0xff; // flip the last tag byte
    await expect(decryptWith(key, bytesToBase64(bytes))).rejects.toThrow();
  });

  it("cannot be decrypted with a different key", async () => {
    const key1 = await importKey(TEST_KEY_B64);
    const key2 = await importKey(OTHER_KEY_B64);
    const cipher = await encryptWith(key1, "secret");
    await expect(decryptWith(key2, cipher)).rejects.toThrow();
  });
});
