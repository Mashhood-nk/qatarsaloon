// Shrinks photos in the browser before upload so big phone pictures stay fast to load
// (and free image resizing isn't needed on the server).
export async function resizeImage(file: File, maxSize: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("This photo format isn't supported. Try a JPG or PNG.");
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob("image/webp", 0.82);
  // Older Safari can't encode WebP and silently returns PNG; use JPEG there.
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error("Couldn't process the photo");
  return blob;
}
