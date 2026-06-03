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
