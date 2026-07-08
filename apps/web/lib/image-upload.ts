export function isSupportedPocketImageFile(file: File) {
  return file.type === "image/png" || file.type === "image/jpeg";
}

export function getPocketImageAltFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

const TARGET_UPLOAD_BYTES = 5.5 * 1024 * 1024;
const MAX_DIMENSION = 2200;

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to process image file."));
    };
    image.src = objectUrl;
  });
}

function blobToFile(blob: Blob, originalName: string, mimeType: string) {
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const baseName = originalName.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to generate image preview."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function preparePocketImageUpload(file: File) {
  if (!isSupportedPocketImageFile(file)) {
    throw new Error("Only PNG and JPEG images are allowed.");
  }

  if (file.size <= TARGET_UPLOAD_BYTES) {
    return file;
  }

  const image = await loadImageElement(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1;
  let mimeType = file.type === "image/png" ? "image/jpeg" : file.type;
  let quality = mimeType === "image/jpeg" ? 0.9 : undefined;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to process image file.");
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (blob.size <= TARGET_UPLOAD_BYTES) {
      return blobToFile(blob, file.name, mimeType);
    }

    if (mimeType === "image/jpeg" && typeof quality === "number" && quality > 0.55) {
      quality = Number((quality - 0.1).toFixed(2));
      continue;
    }

    scale *= 0.85;
  }

  throw new Error("Image is too large. Use a smaller PNG/JPEG.");
}
