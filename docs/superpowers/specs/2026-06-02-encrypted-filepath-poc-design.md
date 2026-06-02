# Encrypted File-Path POC — Design

**Date:** 2026-06-02
**Status:** Approved

## Goal

Demonstrate end-to-end encryption of file paths between a .NET 6 API and a
React web client. The API returns a list of image "paths" (public image URLs)
in encrypted form so the real value never appears in plaintext in the HTTP
response. The React client decrypts each value in the browser and displays the
images.

This is a proof of concept, not a production security control.

## Architecture & Components

Two projects in this repository:

- **`api/`** — .NET 6 minimal Web API.
  - One endpoint: `GET /api/images`.
  - Returns JSON: a list of `{ id, encryptedPath }` objects.
  - `encryptedPath` is an encrypted public image URL
    (e.g. `https://picsum.photos/seed/1/400`).
  - Holds a hardcoded list of public image URLs as the data source.

- **`web/`** — React + TypeScript built with Vite.
  - Fetches `GET /api/images`.
  - Decrypts each `encryptedPath` in the browser using the Web Crypto API.
  - Renders the decrypted URLs as a grid of `<img>` elements.

## Crypto Scheme

- **Algorithm:** AES-256-GCM (symmetric, authenticated encryption).
  - .NET: `System.Security.Cryptography.AesGcm`.
  - Browser: `crypto.subtle` (Web Crypto API).
- **Shared key:** a single 256-bit key, base64-encoded.
  - API side: stored in `appsettings.json` / environment variable.
  - Web side: stored in a Vite `.env` file as `VITE_ENC_KEY`.
- **Wire format per encrypted value:**
  `base64( nonce[12 bytes] || ciphertext || tag[16 bytes] )`
  - The API concatenates `nonce || ciphertext || tag` then base64-encodes.
  - React base64-decodes, slices the first 12 bytes as the nonce, and passes
    the remaining bytes (`ciphertext || tag`) to Web Crypto, which expects the
    tag appended to the ciphertext.
  - This is the standard .NET ↔ Web Crypto AES-GCM interop layout.
- **Nonce:** randomly generated per encryption (12 bytes), never reused with the
  same key.

### Security Caveat

The shared key is shipped inside the client JavaScript bundle, so any user can
extract it and decrypt the paths themselves. This design obscures the path in
the API response but is **not** secure against a determined user. It is
acceptable only because this is a POC. A production version would decrypt
server-side or use per-session keys / signed opaque tokens instead.

## Data Flow

1. API holds a hardcoded list of public image URLs.
2. On `GET /api/images`, the API encrypts each URL and returns
   `[{ id, encryptedPath }, ...]`.
3. React fetches the list, decrypts each `encryptedPath`, and sets
   `<img src={decryptedUrl}>`.

## Error Handling

- **API:**
  - The encryption key is loaded and validated at startup. If it is missing or
    not a valid 256-bit base64 key, the app fails fast with a clear error.
  - Endpoint returns 500 with a clear message on unexpected encryption failure.
  - CORS is enabled for the Vite dev origin (e.g. `http://localhost:5173`).
- **Web:**
  - Each per-image decrypt is wrapped in try/catch. A failed decrypt renders a
    broken-image placeholder instead of crashing the whole grid.
  - Network/fetch errors show a simple error message in the UI.

## Testing

- **API (xUnit):** round-trip test that encrypts then decrypts a known string
  and asserts the wire format (12-byte nonce prefix, base64 output).
- **Web (unit):** test the decrypt helper against a known ciphertext produced by
  the .NET side, locking in cross-platform interop.
- **Manual:** run both projects and confirm the image grid renders.

## Out of Scope

- Authentication / authorization.
- Key rotation or key management infrastructure.
- Server-side decryption or signed opaque tokens (noted as the production path).
- Serving image bytes from the API (images come from public URLs).
