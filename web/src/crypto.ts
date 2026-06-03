// AES-256-GCM helpers matching the .NET PathEncryptor wire format:
// base64( nonce[12] || ciphertext || tag[16] ).
// Web Crypto expects the 16-byte tag appended to the ciphertext, which is
// exactly what the .NET side produces, so no tag re-splitting is needed.

const NONCE_SIZE = 12;

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

export function importKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(base64Key),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const data = new TextEncoder().encode(plaintext);
  const cipherAndTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data),
  );

  const output = new Uint8Array(nonce.length + cipherAndTag.length);
  output.set(nonce, 0);
  output.set(cipherAndTag, nonce.length);
  return bytesToBase64(output);
}

export async function decryptWith(key: CryptoKey, base64: string): Promise<string> {
  const data = base64ToBytes(base64);
  const nonce = data.slice(0, NONCE_SIZE);
  const cipherAndTag = data.slice(NONCE_SIZE);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    cipherAndTag,
  );
  return new TextDecoder().decode(plainBuf);
}

let cachedKey: Promise<CryptoKey> | null = null;
function configuredKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    const b64 = import.meta.env.VITE_ENC_KEY as string | undefined;
    if (!b64) throw new Error("Missing VITE_ENC_KEY environment variable.");
    cachedKey = importKey(b64);
  }
  return cachedKey;
}

export async function decryptPath(base64: string): Promise<string> {
  return decryptWith(await configuredKey(), base64);
}
