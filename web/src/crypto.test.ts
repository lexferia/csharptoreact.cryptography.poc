import { describe, it, expect } from "vitest";
import { importKey, encryptWith, decryptWith } from "./crypto";

// 32 zero bytes base64-encoded = matches the C# test key.
const TEST_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

describe("crypto", () => {
  it("round-trips encrypt then decrypt", async () => {
    const key = await importKey(TEST_KEY_B64);
    const url = "https://picsum.photos/seed/1/400/300";

    const cipher = await encryptWith(key, url);
    const result = await decryptWith(key, cipher);

    expect(result).toBe(url);
  });

  it("produces the nonce||ciphertext||tag wire format", async () => {
    const key = await importKey(TEST_KEY_B64);
    const cipher = await encryptWith(key, "x");
    const bytes = base64ToBytes(cipher);
    // 12-byte nonce + 16-byte tag + at least 1 byte ciphertext.
    expect(bytes.length).toBeGreaterThanOrEqual(12 + 16 + 1);
  });

  it("does not embed the plaintext", async () => {
    const key = await importKey(TEST_KEY_B64);
    const url = "https://picsum.photos/seed/1/400/300";
    const cipher = await encryptWith(key, url);
    expect(cipher).not.toContain(url);
  });
});
