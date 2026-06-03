# Encrypted File-Path POC (C# → React)

A proof of concept demonstrating **end-to-end AES-256-GCM encryption of file paths**
between a .NET 6 Web API and a React + TypeScript browser client.

The API never returns the real "file paths" (here, public image URLs) in plaintext.
Each value is encrypted server-side, sent as an opaque base64 blob, and decrypted in
the browser using the Web Crypto API before being rendered.

> ⚠️ **This is a POC, not a production security control.** See [Security Caveat](#security-caveat).

## Goal

Show that .NET's `System.Security.Cryptography.AesGcm` and the browser's
`crypto.subtle` (Web Crypto API) can interoperate on a shared symmetric key, so a
value encrypted on the server can be decrypted on the client without the plaintext
ever appearing in the HTTP response.

## Architecture

```
┌─────────────────────────┐         GET /api/images          ┌──────────────────────────┐
│  .NET 6 minimal API      │  ───────────────────────────────▶ │  React + TypeScript (Vite) │
│  api/                    │                                   │  web/                      │
│                          │  [{ id, encryptedPath }, ...]     │                            │
│  • holds image URLs      │  ◀─────────────────────────────── │  • fetches the list        │
│  • AES-256-GCM encrypts  │      encryptedPath is base64       │  • decrypts each path      │
│    each URL              │                                   │    with Web Crypto         │
│  • returns ciphertext    │                                   │  • renders <img> grid      │
└─────────────────────────┘                                   └──────────────────────────┘
            ▲                                                              ▲
            │                 same base64 256-bit key                     │
            └──────────────────────────────────────────────────────────────┘
        appsettings.json (Encryption:Key)                          web/.env (VITE_ENC_KEY)
```

### Components

- **`api/`** — .NET 6 minimal Web API.
  - One endpoint: `GET /api/images`, listening on `http://localhost:5050`.
  - Returns JSON: a list of `{ id, encryptedPath }` objects.
  - `encryptedPath` is an encrypted public image URL (e.g. `https://picsum.photos/seed/1/400/300`).
  - Holds a hardcoded list of public image URLs as the data source.
  - [`PathEncryptor.cs`](api/Api/PathEncryptor.cs) — the AES-256-GCM encrypt/decrypt logic.
  - [`Program.cs`](api/Api/Program.cs) — key loading, CORS, and the endpoint.

- **`web/`** — React + TypeScript built with Vite, served on `http://localhost:5173`.
  - Fetches `GET /api/images`.
  - Decrypts each `encryptedPath` in the browser using the Web Crypto API.
  - Renders the decrypted URLs as a grid of `<img>` elements.
  - [`crypto.ts`](web/src/crypto.ts) — the Web Crypto decrypt helpers.
  - [`App.tsx`](web/src/App.tsx) — fetch, decrypt, and render the image grid.

## Crypto scheme

- **Algorithm:** AES-256-GCM (symmetric, authenticated encryption).
  - .NET: `System.Security.Cryptography.AesGcm`.
  - Browser: `crypto.subtle` (Web Crypto API).
- **Shared key:** a single 256-bit (32-byte) key, base64-encoded, identical on both sides.
  - API side: `Encryption:Key` in `appsettings.json` (or an environment variable).
  - Web side: `VITE_ENC_KEY` in `web/.env`.
- **Wire format per encrypted value:** `base64( nonce[12 bytes] || ciphertext || tag[16 bytes] )`
  - The API concatenates `nonce || ciphertext || tag`, then base64-encodes.
  - The client base64-decodes, slices off the first 12 bytes as the nonce, and passes
    the remaining bytes (`ciphertext || tag`) to Web Crypto, which expects the
    16-byte tag appended to the ciphertext. This is the standard .NET ↔ Web Crypto
    AES-GCM interop layout.
- **Nonce:** randomly generated per encryption (12 bytes), never reused with the same key.

### Security Caveat

The shared key is shipped inside the client JavaScript bundle, so any user can extract
it and decrypt the paths themselves. This design **obscures** the path in the API
response but is **not** secure against a determined user. It is acceptable only because
this is a POC. A production version would decrypt server-side or use per-session keys /
signed opaque tokens instead.

## Project structure

```
.
├── api/                          # .NET 6 solution
│   ├── Api/
│   │   ├── Program.cs            # minimal API: CORS, key load, GET /api/images
│   │   ├── PathEncryptor.cs      # AES-256-GCM encrypt/decrypt + wire format
│   │   └── appsettings.json      # Encryption:Key (shared base64 256-bit key)
│   └── Api.Tests/
│       └── PathEncryptorTests.cs # round-trip, wire-format, tamper, key-length tests
├── web/                          # React + TypeScript (Vite)
│   ├── .env                      # VITE_ENC_KEY (same key as API) — gitignored
│   ├── .env.example              # documents VITE_ENC_KEY
│   └── src/
│       ├── crypto.ts             # importKey / encryptWith / decryptWith / decryptPath
│       ├── crypto.test.ts        # round-trip + interop format tests
│       └── App.tsx               # fetch + decrypt + image grid
└── docs/superpowers/             # design spec and implementation plan
```

## Getting started

### Prerequisites

- .NET 6 SDK
- Node.js (v18+; the crypto tests use globals such as `crypto.subtle`)

### 1. Generate and install the shared key

Both sides MUST use the **identical** base64 key. Generate one:

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

- Put the value in `api/Api/appsettings.json` under `Encryption:Key`.
- Put the same value in `web/.env` as `VITE_ENC_KEY=<key>` (copy from `web/.env.example`).

`web/.env` is gitignored because it contains the key.

### 2. Run the API

```powershell
dotnet run --project api/Api/Api.csproj
```

Listens on `http://localhost:5050`. Verify it returns encrypted paths:

```powershell
Invoke-RestMethod http://localhost:5050/api/images | ConvertTo-Json
```

Each `encryptedPath` should be an opaque base64 string that does **not** contain `picsum.photos`.

### 3. Run the web app

```powershell
npm --prefix web install   # first time only
npm --prefix web run dev
```

Open `http://localhost:5173`. A 2-column grid of four images should render. If images
are broken or you see "Failed to decrypt", the keys do not match — re-check that
`Encryption:Key` and `VITE_ENC_KEY` are the identical string.

## Testing

- **API (xUnit):** `dotnet test api/Api.sln` — round-trip, wire-format (12-byte nonce
  prefix), tamper rejection, and key-length validation.
- **Web (Vitest):** `npm --prefix web test` — decrypt helper round-trip and interop
  format, locking in cross-platform compatibility with the .NET side.
- **Manual:** run both projects and confirm the image grid renders (step 3 above).

## Out of scope

- Authentication / authorization.
- Key rotation or key management infrastructure.
- Server-side decryption or signed opaque tokens (the production path).
- Serving image bytes from the API (images come from public URLs).

## Further reading

- [Design spec](docs/superpowers/specs/2026-06-02-encrypted-filepath-poc-design.md)
- [Implementation plan](docs/superpowers/plans/2026-06-02-encrypted-filepath-poc.md)
