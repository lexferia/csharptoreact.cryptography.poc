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
