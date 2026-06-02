# Encrypted File-Path POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a .NET 6 API that returns a list of AES-256-GCM-encrypted image URLs and a React+TypeScript app that decrypts them in the browser and renders the images.

**Architecture:** A .NET 6 minimal API exposes `GET /api/images` returning `[{ id, encryptedPath }]`, where `encryptedPath` is `base64(nonce[12] || ciphertext || tag[16])`. A Vite React app fetches the list, decrypts each value with the Web Crypto API using a shared 256-bit key, and displays `<img>` tags. The same base64 key is configured on both sides.

**Tech Stack:** .NET 6 (`AesGcm`, minimal APIs, xUnit), React + TypeScript via Vite, Web Crypto API (`crypto.subtle`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-encrypted-filepath-poc-design.md`

---

## File Structure

```
.gitignore
api/
  Api.sln
  Api/
    Api.csproj            # net6.0 web project
    Program.cs            # minimal API: CORS, key load, GET /api/images
    PathEncryptor.cs      # AES-256-GCM encrypt/decrypt + wire format
    appsettings.json      # Encryption:Key (base64 256-bit)
  Api.Tests/
    Api.Tests.csproj      # xUnit
    PathEncryptorTests.cs # round-trip + wire-format tests
web/
  .env                    # VITE_ENC_KEY (same key as API) - gitignored
  .env.example            # documents VITE_ENC_KEY
  vitest.config.ts        # vitest config (node env)
  src/
    crypto.ts             # importKey / encryptWith / decryptWith / decryptPath
    crypto.test.ts        # round-trip + format tests
    App.tsx               # fetch + decrypt + image grid
    main.tsx              # (from scaffold)
```

**Shared key:** A single base64-encoded 256-bit (32-byte) key is used by both `api/Api/appsettings.json` (`Encryption:Key`) and `web/.env` (`VITE_ENC_KEY`). They MUST be identical. Task 7 generates and installs it.

---

## Task 0: Repository setup

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Initialize git**

Run:
```powershell
git init
```
Expected: "Initialized empty Git repository".

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore`:
```gitignore
# .NET
bin/
obj/
*.user

# Node / Vite
node_modules/
dist/

# Local env (contains the shared key)
web/.env
```

- [ ] **Step 3: Commit**

```powershell
git add .gitignore docs
git commit -m "chore: repo setup with gitignore and design docs"
```

---

## Task 1: Scaffold the .NET 6 API project

**Files:**
- Create: `api/Api/Api.csproj`, `api/Api/Program.cs` (via template)
- Create: `api/Api.sln`

- [ ] **Step 1: Create the web project targeting net6.0**

Run:
```powershell
dotnet new web -n Api -o api/Api -f net6.0
```
Expected: "The template "ASP.NET Core Empty" was created successfully."

> If this fails with a message about the `net6.0` targeting pack not being installed, install the .NET 6 SDK/targeting pack, or temporarily change `<TargetFramework>` to an installed version. The code in this plan uses only APIs present in .NET 6 and later.

- [ ] **Step 2: Create a solution and add the project**

Run:
```powershell
dotnet new sln -n Api -o api
dotnet sln api/Api.sln add api/Api/Api.csproj
```
Expected: "Project ... added to the solution."

- [ ] **Step 3: Build to verify the scaffold compiles**

Run:
```powershell
dotnet build api/Api.sln
```
Expected: "Build succeeded." with 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add api
git commit -m "feat: scaffold .NET 6 minimal API project"
```

---

## Task 2: PathEncryptor (AES-256-GCM) with TDD

**Files:**
- Create: `api/Api.Tests/Api.Tests.csproj`, `api/Api.Tests/PathEncryptorTests.cs`
- Create: `api/Api/PathEncryptor.cs`

- [ ] **Step 1: Create the test project and wire references**

Run:
```powershell
dotnet new xunit -n Api.Tests -o api/Api.Tests -f net6.0
dotnet sln api/Api.sln add api/Api.Tests/Api.Tests.csproj
dotnet add api/Api.Tests/Api.Tests.csproj reference api/Api/Api.csproj
```
Expected: each command reports success.

- [ ] **Step 2: Write the failing tests**

Replace the contents of `api/Api.Tests/PathEncryptorTests.cs` with:
```csharp
using System;
using Api;
using Xunit;

namespace Api.Tests;

public class PathEncryptorTests
{
    // 32 zero bytes, base64-encoded = a valid 256-bit key for tests.
    private const string TestKeyB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    [Fact]
    public void Encrypt_Then_Decrypt_Roundtrips()
    {
        var enc = PathEncryptor.FromBase64(TestKeyB64);
        var plaintext = "https://picsum.photos/seed/1/400/300";

        var cipher = enc.Encrypt(plaintext);
        var result = enc.Decrypt(cipher);

        Assert.Equal(plaintext, result);
    }

    [Fact]
    public void Encrypt_DoesNotContainPlaintext_AndUsesWireFormat()
    {
        var enc = PathEncryptor.FromBase64(TestKeyB64);
        var plaintext = "https://picsum.photos/seed/1/400/300";

        var cipher = enc.Encrypt(plaintext);

        Assert.DoesNotContain(plaintext, cipher);
        var bytes = Convert.FromBase64String(cipher);
        // 12-byte nonce + 16-byte tag + at least 1 byte of ciphertext.
        Assert.True(bytes.Length >= 12 + 16 + 1);
    }

    [Fact]
    public void Encrypt_ProducesDifferentOutputEachCall_DueToRandomNonce()
    {
        var enc = PathEncryptor.FromBase64(TestKeyB64);
        var plaintext = "same-input";

        Assert.NotEqual(enc.Encrypt(plaintext), enc.Encrypt(plaintext));
    }

    [Fact]
    public void FromBase64_ThrowsOnWrongKeyLength()
    {
        // 16 bytes, not 32.
        var shortKey = Convert.ToBase64String(new byte[16]);
        Assert.Throws<ArgumentException>(() => PathEncryptor.FromBase64(shortKey));
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```powershell
dotnet test api/Api.sln
```
Expected: FAIL — compile error, `PathEncryptor` does not exist.

- [ ] **Step 4: Implement `PathEncryptor`**

Create `api/Api/PathEncryptor.cs`:
```csharp
using System;
using System.Security.Cryptography;
using System.Text;

namespace Api;

/// <summary>
/// AES-256-GCM encryption with the wire format:
/// base64( nonce[12] || ciphertext || tag[16] ).
/// </summary>
public sealed class PathEncryptor
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public PathEncryptor(byte[] key)
    {
        if (key.Length != 32)
            throw new ArgumentException("Key must be 32 bytes (256-bit).", nameof(key));
        _key = key;
    }

    public static PathEncryptor FromBase64(string base64Key)
        => new(Convert.FromBase64String(base64Key));

    public string Encrypt(string plaintext)
    {
        var nonce = new byte[NonceSize];
        RandomNumberGenerator.Fill(nonce);

        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipher = new byte[plainBytes.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        var output = new byte[NonceSize + cipher.Length + TagSize];
        Buffer.BlockCopy(nonce, 0, output, 0, NonceSize);
        Buffer.BlockCopy(cipher, 0, output, NonceSize, cipher.Length);
        Buffer.BlockCopy(tag, 0, output, NonceSize + cipher.Length, TagSize);

        return Convert.ToBase64String(output);
    }

    public string Decrypt(string base64)
    {
        var data = Convert.FromBase64String(base64);
        var nonce = data[..NonceSize];
        var tag = data[^TagSize..];
        var cipher = data[NonceSize..^TagSize];

        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(_key);
        aes.Decrypt(nonce, cipher, tag, plain);

        return Encoding.UTF8.GetString(plain);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```powershell
dotnet test api/Api.sln
```
Expected: PASS — all 4 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add api
git commit -m "feat: add AES-256-GCM PathEncryptor with tests"
```

---

## Task 3: Wire up the API endpoint

**Files:**
- Modify: `api/Api/Program.cs` (replace template contents)
- Modify: `api/Api/appsettings.json` (add Encryption:Key)

- [ ] **Step 1: Add a placeholder key to `appsettings.json`**

Replace the contents of `api/Api/appsettings.json` with:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "Encryption": {
    "Key": "REPLACE_IN_TASK_7"
  }
}
```
(The real key is generated and inserted in Task 7. The app will throw a clear error until then, which is expected.)

- [ ] **Step 2: Replace `Program.cs` with the full app**

Replace the contents of `api/Api/Program.cs` with:
```csharp
using System;
using System.Linq;
using Api;

var builder = WebApplication.CreateBuilder(args);

const string WebOrigin = "http://localhost:5173";
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(WebOrigin).AllowAnyHeader().AllowAnyMethod()));

var keyB64 = builder.Configuration["Encryption:Key"]
    ?? throw new InvalidOperationException("Missing configuration value 'Encryption:Key'.");
// FromBase64 throws ArgumentException if the key is not 32 bytes (256-bit).
var encryptor = PathEncryptor.FromBase64(keyB64);
builder.Services.AddSingleton(encryptor);

var app = builder.Build();
app.UseCors();

// The real, secret "file paths" — public image URLs for this POC.
var imageUrls = new[]
{
    "https://picsum.photos/seed/1/400/300",
    "https://picsum.photos/seed/2/400/300",
    "https://picsum.photos/seed/3/400/300",
    "https://picsum.photos/seed/4/400/300",
};

app.MapGet("/api/images", (PathEncryptor enc) =>
    imageUrls.Select((url, index) => new
    {
        id = index + 1,
        encryptedPath = enc.Encrypt(url),
    }));

app.Run("http://localhost:5050");
```

- [ ] **Step 3: Verify it builds**

Run:
```powershell
dotnet build api/Api.sln
```
Expected: "Build succeeded." (Running the app now would throw on the placeholder key — that is intentional and fixed in Task 7.)

- [ ] **Step 4: Commit**

```powershell
git add api
git commit -m "feat: add GET /api/images endpoint with CORS and key loading"
```

---

## Task 4: Scaffold the React + TypeScript web app

**Files:**
- Create: `web/` (Vite scaffold), `web/vitest.config.ts`
- Modify: `web/package.json` (add test script + vitest dev dep)

- [ ] **Step 1: Scaffold with Vite**

Run:
```powershell
npm create vite@latest web -- --template react-ts
```
Expected: project created in `web/`.

- [ ] **Step 2: Install dependencies and vitest**

Run:
```powershell
npm --prefix web install
npm --prefix web install -D vitest
```
Expected: installs complete with no errors.

- [ ] **Step 3: Add a vitest config**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```
(Node 24 exposes `crypto.subtle`, `atob`, `TextDecoder`, and `TextEncoder` as globals, so no jsdom is needed for the crypto tests.)

- [ ] **Step 4: Add a `test` script to `web/package.json`**

In `web/package.json`, inside `"scripts"`, add:
```json
    "test": "vitest run"
```
(Add a comma after the preceding entry as needed so the JSON stays valid.)

- [ ] **Step 5: Verify the dev build compiles**

Run:
```powershell
npm --prefix web run build
```
Expected: TypeScript compiles and Vite reports a successful build.

- [ ] **Step 6: Commit**

```powershell
git add web
git commit -m "feat: scaffold Vite React TS web app with vitest"
```

---

## Task 5: Decryption helper (crypto.ts) with TDD

**Files:**
- Create: `web/src/crypto.test.ts`
- Create: `web/src/crypto.ts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/crypto.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```powershell
npm --prefix web test
```
Expected: FAIL — cannot resolve `./crypto`.

- [ ] **Step 3: Implement `crypto.ts`**

Create `web/src/crypto.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```powershell
npm --prefix web test
```
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web
git commit -m "feat: add Web Crypto AES-256-GCM decrypt helper with tests"
```

---

## Task 6: Image grid UI (App.tsx)

**Files:**
- Modify: `web/src/App.tsx` (replace scaffold contents)

- [ ] **Step 1: Replace `App.tsx`**

Replace the contents of `web/src/App.tsx` with:
```tsx
import { useEffect, useState } from "react";
import { decryptPath } from "./crypto";

const API_URL = "http://localhost:5050/api/images";

type ImageItem = { id: number; encryptedPath: string };
type DecodedItem = { id: number; url: string | null };

export default function App() {
  const [items, setItems] = useState<DecodedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        const data: ImageItem[] = await res.json();

        const decoded = await Promise.all(
          data.map(async (item) => {
            try {
              return { id: item.id, url: await decryptPath(item.encryptedPath) };
            } catch {
              return { id: item.id, url: null };
            }
          }),
        );

        if (!cancelled) setItems(decoded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p style={{ color: "red", padding: 16 }}>Error: {error}</p>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Encrypted Image Paths POC</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
        }}
      >
        {items.map((item) => (
          <div key={item.id}>
            {item.url ? (
              <img
                src={item.url}
                alt={`image ${item.id}`}
                style={{ width: "100%", borderRadius: 8 }}
              />
            ) : (
              <div style={{ color: "orange" }}>⚠️ Failed to decrypt image {item.id}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run:
```powershell
npm --prefix web run build
```
Expected: TypeScript compiles and Vite reports a successful build.

- [ ] **Step 3: Commit**

```powershell
git add web
git commit -m "feat: render decrypted image grid in App"
```

---

## Task 7: Install the shared key and verify end-to-end interop

**Files:**
- Modify: `api/Api/appsettings.json` (real key)
- Create: `web/.env`, `web/.env.example`

- [ ] **Step 1: Generate one shared 256-bit key**

Run:
```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```
Copy the printed base64 string. Use this SAME value in both Step 2 and Step 3.

- [ ] **Step 2: Put the key in the API config**

In `api/Api/appsettings.json`, replace `"REPLACE_IN_TASK_7"` with the generated base64 key, e.g.:
```json
  "Encryption": {
    "Key": "<paste-generated-key-here>"
  }
```

- [ ] **Step 3: Put the same key in the web env files**

Create `web/.env` (gitignored):
```
VITE_ENC_KEY=<paste-the-same-generated-key-here>
```

Create `web/.env.example` (committed, documents the variable):
```
VITE_ENC_KEY=replace-with-shared-256-bit-base64-key
```

- [ ] **Step 4: Start the API**

Run (in one terminal):
```powershell
dotnet run --project api/Api/Api.csproj
```
Expected: the app starts and listens on `http://localhost:5050` with no key error.

- [ ] **Step 5: Confirm the endpoint returns encrypted paths**

Run (in another terminal):
```powershell
Invoke-RestMethod http://localhost:5050/api/images | ConvertTo-Json
```
Expected: a JSON array of `{ id, encryptedPath }`; each `encryptedPath` is an opaque base64 string and does NOT contain `picsum.photos`.

- [ ] **Step 6: Start the web app and verify images render**

Run (in another terminal):
```powershell
npm --prefix web run dev
```
Open the printed URL (`http://localhost:5173`). Expected: a 2-column grid of four images renders. If images are broken or you see "Failed to decrypt", the keys do not match — re-check Steps 2 and 3 use the identical string.

- [ ] **Step 7: Commit**

```powershell
git add api/Api/appsettings.json web/.env.example
git commit -m "chore: install shared encryption key and document env"
```

---

## Self-Review Notes

- **Spec coverage:** `GET /api/images` (Task 3), AES-256-GCM + wire format (Tasks 2 & 5), shared base64 key on both sides (Task 7), React grid display via public URLs (Task 6), API key validation/fail-fast (Task 3), CORS for Vite origin (Task 3), per-image decrypt try/catch + fetch error UI (Task 6), API round-trip test (Task 2), web interop/format test (Task 5), manual end-to-end check (Task 7). All spec sections map to a task.
- **Interop note:** The .NET `AesGcm.Encrypt` produces ciphertext and tag separately; the plan concatenates `nonce || ciphertext || tag`. Web Crypto's `decrypt` expects `ciphertext || tag` together, so React only strips the 12-byte nonce prefix — confirmed consistent across Task 2 and Task 5.
- **Naming consistency:** `PathEncryptor.FromBase64/Encrypt/Decrypt` (C#) and `importKey/encryptWith/decryptWith/decryptPath` (TS) are used identically in their tests and call sites.
```
