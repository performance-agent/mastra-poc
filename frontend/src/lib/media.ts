import { useEffect, useState } from "react";
import { getFirebaseAuth } from "./firebase";

export const MEDIA_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
export function useImageSource(source?: string | null) {
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    if (!source?.startsWith("media:")) return;
    const controller = new AbortController();
    let objectUrl = "";
    void (async () => {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${MEDIA_BASE}/media/${encodeURIComponent(source.slice(6))}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Image unavailable");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ source, url: objectUrl });
    })().catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);
  return source?.startsWith("media:")
    ? resolved?.source === source
      ? resolved.url
      : undefined
    : source || undefined;
}
export async function uploadImage(
  file: Blob,
  target: { scope: string; targetId: string; purpose: string },
  onProgress: (value: number) => void,
): Promise<string> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${MEDIA_BASE}/media`);
    xhr.timeout = 60000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error(
            Array.isArray(data.message) ? data.message.join(", ") : data.message || "Upload failed",
          );
        resolve(data.photoUrl);
      } catch (error) {
        reject(error);
      }
    };
    const form = new FormData();
    form.append("file", file, "image.webp");
    Object.entries(target).forEach(([key, value]) => form.append(key, value));
    xhr.send(form);
  });
}
