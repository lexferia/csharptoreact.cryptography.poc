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
