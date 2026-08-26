{/* Everything that touches storage lives here */}

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const MAX_BYTES = 10 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export async function saveUpload(file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error(`Unsupported file type: ${file.type}`);
  if (file.size > MAX_BYTES) throw new Error("File too large");

  const key = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, key), bytes);

  return key;
}

export async function readUpload(key: string): Promise<Buffer> {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/i.test(key)) {
    throw new Error("Invalid file key");
  }
  return readFile(path.join(UPLOAD_DIR, key));
}

export function mimeFromKey(key: string): string {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const found = Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext);
  if (!found) throw new Error(`Unknown extension: ${ext}`);
  return found[0];
}

