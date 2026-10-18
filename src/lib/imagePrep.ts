/**
 * Headshot preparation in the browser: whatever the phone or computer hands us (JPEG, PNG, WebP, an iPhone HEIC where the
 * browser can decode it, a 12 MP camera photo, a file with an empty MIME type) becomes one JPEG, at most 1600 px on its long
 * side, upright. broker-media only accepts image/jpeg|png|webp (smc_06), which is why raw HEIC / typeless files failed.
 * No imports, so the sizing rules are unit-tested with `node --test src/lib/imagePrep.test.mjs`.
 */

export const HEADSHOT_MAX_EDGE = 1600;
export const HEADSHOT_QUALITY = 0.86;

/** Scale (w, h) down so the longer edge is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max = HEADSHOT_MAX_EDGE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) throw new Error("Image has no size");
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** HEIC/HEIF by MIME type or extension (some browsers report an empty type for them). */
export const isHeic = (name: string, type: string): boolean =>
  /image\/hei[cf]/i.test(type || "") || /\.(heic|heif)$/i.test(name || "");

/** True when the file can plausibly be an image we can open. */
export const looksLikeImage = (name: string, type: string): boolean =>
  /^image\//i.test(type || "") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(name || "");

export class HeadshotError extends Error {}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall through to <img> (older Safari) */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Any image Blob → JPEG File ≤ 1600 px. Throws HeadshotError with a broker-facing message. */
export async function prepareHeadshot(input: Blob, name = "headshot"): Promise<File> {
  const fileName = (input as File).name || name;
  if (!looksLikeImage(fileName, input.type)) throw new HeadshotError("That isn't a photo. Choose a JPG, PNG or HEIC image, or take one now.");
  let img;
  try {
    img = await decode(input);
  } catch {
    throw new HeadshotError(isHeic(fileName, input.type)
      ? "This browser can't open iPhone HEIC photos. Take the photo here, or choose a JPG or PNG."
      : "We couldn't open that photo. Try another one, or take one now.");
  }
  try {
    const { width, height } = fitWithin(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new HeadshotError("Your browser couldn't process the photo. Please try another browser.");
    ctx.fillStyle = "#ffffff"; // PNG transparency → white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", HEADSHOT_QUALITY));
    if (!blob) throw new HeadshotError("Your browser couldn't process the photo. Please try another browser.");
    return new File([blob], "headshot.jpg", { type: "image/jpeg" });
  } finally {
    img.close?.();
  }
}
