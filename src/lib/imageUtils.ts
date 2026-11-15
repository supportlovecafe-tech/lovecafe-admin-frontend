/**
 * Client-side image compression and validation utility
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
}

/**
 * Compresses an image file in the browser using HTML5 Canvas.
 * Reduces 5MB-15MB phone photos down to ~100-200KB without visible quality loss.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.82 } = options;

  // Don't compress SVGs or animated GIFs
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  // If already under 150KB and a standard format, skip canvas overhead
  if (file.size <= 150 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp')) {
    return file;
  }

  return new Promise((resolve) => {
    const startTime = performance.now();
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Calculate constrained dimensions preserving aspect ratio
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback to original if context unavailable
        return;
      }

      // Fill white background for transparent images converted to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Determine output format (JPEG is universally supported across Flutter & web)
      const outputType = 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const cleanName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const compressedFile = new File([blob], `${cleanName}.jpg`, {
            type: outputType,
            lastModified: Date.now(),
          });

          const elapsed = Math.round(performance.now() - startTime);
          const savedPercent = Math.round((1 - compressedFile.size / file.size) * 100);
          console.log(
            `[ImageCompressor] Compressed "${file.name}" (${(file.size / 1024).toFixed(1)} KB) -> (${(compressedFile.size / 1024).toFixed(1)} KB) [${savedPercent}% saved in ${elapsed}ms]`
          );

          resolve(compressedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      console.warn('[ImageCompressor] Canvas failed to load image, using original file.');
      resolve(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Validates a user-entered image URL to alert if they pasted an HTML webpage,
 * an expiring Facebook CDN link, or a Facebook fanpage URL.
 */
export function validateImageUrl(url: string): { isValid: boolean; warning?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) return { isValid: true };

  try {
    const parsed = new URL(trimmed);

    // Check for Facebook page URLs
    if (parsed.hostname.includes('facebook.com')) {
      return {
        isValid: false,
        warning: 'This is a Facebook webpage link, not an image. Browsers and mobile apps cannot display webpages as images.',
      };
    }

    // Check for Facebook CDN URLs that have expiry tokens
    if (parsed.hostname.includes('fbcdn.net') || trimmed.includes('&oe=')) {
      return {
        isValid: true,
        warning: 'Facebook CDN links expire after a short time and will turn blank. We recommend uploading the image file instead.',
      };
    }

    // Check if the URL points to a web page (html, htm, php, etc.)
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.html') || pathname.endsWith('.htm') || pathname.endsWith('.php') || pathname.endsWith('.asp')) {
      return {
        isValid: false,
        warning: 'This URL points to a webpage document, not an image file.',
      };
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      warning: 'Please enter a valid URL starting with http:// or https://',
    };
  }
}
