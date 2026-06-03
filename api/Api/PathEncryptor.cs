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
