import { v2 as cloudinary } from "cloudinary";

// Validated lazily (on first actual upload/delete/getUrl call), not at module
// import time: this module is imported by route files that merely define a
// Server Action using it, and `next build`'s page-data collection phase
// imports every route module without invoking any of them — an eager
// top-level throw would make the app un-buildable whenever Cloudinary isn't
// configured yet, even for routes that never touch a file upload at runtime.
let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
  const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
  const API_KEY = process.env.CLOUDINARY_API_KEY;
  const API_SECRET = process.env.CLOUDINARY_API_SECRET;

  if (!CLOUDINARY_URL && !(CLOUD_NAME && API_KEY && API_SECRET)) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_URL, or all of CLOUDINARY_CLOUD_NAME / " +
        "CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET, in your .env file.",
    );
  }

  if (!CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: CLOUD_NAME,
      api_key: API_KEY,
      api_secret: API_SECRET,
      secure: true,
    });
  }
  // If CLOUDINARY_URL is set, the SDK picks it up from the environment automatically.

  configured = true;
}

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export type UploadOptions = {
  /** Logical folder, e.g. `businesses/{businessId}/logos`. Never derive this from raw user input. */
  folder: string;
  filename?: string;
};

export type UploadedFile = {
  publicId: string;
  url: string;
  bytes: number;
  format: string;
};

/**
 * Validates and uploads a file buffer to Cloudinary. Callers must pass the
 * MIME type as detected from the actual file content, not just the
 * client-supplied Content-Type header.
 */
export async function uploadFile(
  buffer: Buffer,
  mimeType: string,
  options: UploadOptions,
): Promise<UploadedFile> {
  ensureConfigured();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds maximum allowed size of ${MAX_UPLOAD_BYTES} bytes`);
  }

  const result = await new Promise<UploadedFile>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.filename,
        resource_type: "auto",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed with no error detail"));
          return;
        }
        resolve({
          publicId: result.public_id,
          url: result.secure_url,
          bytes: result.bytes,
          format: result.format,
        });
      },
    );
    uploadStream.end(buffer);
  });

  return result;
}

export async function deleteFile(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}

export function getUrl(publicId: string): string {
  ensureConfigured();
  return cloudinary.url(publicId, { secure: true });
}
