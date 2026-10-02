/**
 * PRDS Image Compression Utilities
 * Compresses and downscales avatar images on the client to protect
 * Supabase Free Tier storage (1 GB limit) and monthly egress bandwidth (2 GB).
 */

export const compressAvatarImage = (
  file,
  { maxWidth = 400, maxHeight = 400, quality = 0.8 } = {}
) => {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof Blob)) {
      return reject(new Error("Invalid file provided for compression."));
    }

    // In SSR, Node tests, or environments where DOM Image/Canvas is unavailable, return original
    if (typeof Image === "undefined" || typeof document === "undefined") {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image data."));
      img.onload = () => {
        const width = img.width;
        const height = img.height;

        // Perform center square crop
        const minDim = Math.min(width, height);
        const startX = (width - minDim) / 2;
        const startY = (height - minDim) / 2;

        const canvas = document.createElement("canvas");
        const targetDim = Math.min(minDim, maxWidth);
        canvas.width = targetDim;
        canvas.height = targetDim;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(file);
        }

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetDim, targetDim);

        // Attempt WebP export first, fallback to JPEG
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              canvas.toBlob(
                (jpegBlob) => {
                  resolve(jpegBlob || file);
                },
                "image/jpeg",
                quality
              );
            }
          },
          "image/webp",
          quality
        );
      };
      img.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  });
};
