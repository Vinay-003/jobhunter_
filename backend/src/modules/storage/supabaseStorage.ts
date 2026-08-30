import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Supabase storage abstraction:
 * uploadFile(userId, resumeId, buffer, filename) -> {bucket, path, sha256}
 * Handles Supabase private bucket if env configured else writes to local uploads folder for dev (with warning).
 * Also download, delete.
 */

export type StorageRef = {
  bucket: string;
  path: string;
  sha256: string;
};

function getBucket(): string {
  return env.SUPABASE_RESUME_BUCKET || 'resumes';
}

function hasSupabase(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getSupabaseClient(): Promise<unknown> {
  try {
    // @ts-ignore - optional peer dep
    const mod: unknown = await import('@supabase/supabase-js');
    const { createClient } = mod as { createClient: (url: string, key: string) => unknown };
    return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  } catch {
    return null;
  }
}

function localUploadsDir(): string {
  // backend/uploads or cwd/uploads
  const candidates = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'backend', 'uploads'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../uploads'),
  ];
  for (const p of candidates) {
    // pick first existing parent
    if (fs.existsSync(path.dirname(p))) return p;
  }
  return path.resolve(process.cwd(), 'uploads');
}

export async function uploadFile(
  userId: string,
  resumeId: string,
  buffer: Buffer,
  filename: string,
): Promise<StorageRef> {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const bucket = getBucket();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'resume.pdf';
  const objectPath = `${userId}/${resumeId}/${safeFilename}`;

  if (hasSupabase()) {
    const client = (await getSupabaseClient()) as {
      storage: { from: (b: string) => { upload: (p: string, buf: Buffer, opts: unknown) => Promise<{ error: unknown }> } };
    } | null;
    if (client) {
      const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (error) {
        console.warn('[supabaseStorage] Supabase upload failed, falling back to local:', (error as { message?: string }).message ?? error);
      } else {
        return { bucket, path: objectPath, sha256 };
      }
    }
  }

  // Local fallback
  if (!hasSupabase()) {
    console.warn('[supabaseStorage] Supabase not configured — writing to local uploads folder (dev only)');
  }
  const base = localUploadsDir();
  const fullPath = path.join(base, objectPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return { bucket: 'local', path: objectPath, sha256 };
}

export async function downloadFile(ref: StorageRef): Promise<Buffer> {
  if (ref.bucket !== 'local' && hasSupabase()) {
    const client = (await getSupabaseClient()) as {
      storage: { from: (b: string) => { download: (p: string) => Promise<{ data: unknown; error: unknown }> } };
    } | null;
    if (client) {
      const { data, error } = await client.storage.from(ref.bucket).download(ref.path);
      if (!error && data) {
        // data is Blob in supabase-js
        if (data instanceof Blob) {
          const ab = await (data as Blob).arrayBuffer();
          return Buffer.from(ab);
        }
        if (Buffer.isBuffer(data)) return data as Buffer;
        // fallback try to handle as Uint8Array
        return Buffer.from(data as Uint8Array);
      }
      if (error) throw new Error(`Supabase download failed: ${(error as { message?: string }).message ?? String(error)}`);
    }
  }
  // Local
  const base = localUploadsDir();
  const fullPath = path.join(base, ref.path);
  if (!fs.existsSync(fullPath)) throw new Error(`Local file not found: ${fullPath}`);
  return fs.readFileSync(fullPath);
}

export async function deleteFile(ref: StorageRef): Promise<void> {
  if (ref.bucket !== 'local' && hasSupabase()) {
    const client = (await getSupabaseClient()) as {
      storage: { from: (b: string) => { remove: (paths: string[]) => Promise<{ error: unknown }> } };
    } | null;
    if (client) {
      const { error } = await client.storage.from(ref.bucket).remove([ref.path]);
      if (!error) return;
      console.warn('[supabaseStorage] Supabase delete failed, trying local fallback:', (error as { message?: string }).message ?? error);
    }
  }
  const base = localUploadsDir();
  const fullPath = path.join(base, ref.path);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export default { uploadFile, downloadFile, deleteFile };
