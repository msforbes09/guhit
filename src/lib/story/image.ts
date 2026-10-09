/** Decodes a Blob, File or data URL into something a canvas can draw. */
export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      reject(new Error("That picture could not be opened."));
    };
    img.src = url;
  });
}

/**
 * Shrinks a photo to a size that keeps IndexedDB small and the phone fast,
 * returning a JPEG data URL and how much it was scaled. Phone cameras
 * produce 12 MP images that would otherwise cost megabytes per friend.
 */
export async function shrinkPhoto(source: Blob | string, maxSide = 1280): Promise<{ dataUrl: string; scale: number }> {
  const img = await loadImage(source);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw pictures.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.86), scale };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Snapshot failed"))), type),
  );
}
