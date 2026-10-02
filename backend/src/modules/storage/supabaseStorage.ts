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
  let mod: unknown;
  try {
    // @ts-ignore - optional peer dep
    mod = await import('@supabase/supabase-js');
  } catch (err) {
    // Issue 1 fix 1.2: never swallow silently — one greppable token explains the fallback.
    console.error('[supabaseStorage] FALLBACK reason=import — @supabase/supabase-js unavailable:', (err as Error)?.message ?? err);
    return null;
  }
  try {
    const { createClient } = mod as { createClient: (url: string, key: string) => unknown };
    return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  } catch (err) {
    console.error('[supabaseStorage] FALLBACK reason=create-client — SUPABASE_URL rejected:', (err as Error)?.message ?? err, `url=${JSON.stringify(env.SUPABASE_URL)}`);
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
  // Issue 1 fix 1.2: production must never pretend success while writing to the
  // ephemeral disk (that's how all 14 rows became bucket='local' with lost bytes).
  const isProd = process.env.NODE_ENV === 'production';

  if (hasSupabase()) {
    const client = (await getSupabaseClient()) as {
      storage: { from: (b: string) => { upload: (p: string, buf: Buffer, opts: unknown) => Promise<{ error: unknown }> } };
    } | null;
    if (client) {
      const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (!error) {
        return { bucket, path: objectPath, sha256 };
      }
      const msg = (error as { message?: string }).message ?? String(error);
      console.error(`[supabaseStorage] FALLBACK reason=upload-error path=${objectPath}: ${msg}`);
      if (isProd) throw new Error(`Supabase upload failed: ${msg}`);
    } else {
      // reason already logged by getSupabaseClient (reason=import|create-client)
      if (isProd) throw new Error('Supabase client unavailable (see [supabaseStorage] FALLBACK log)');
      console.warn('[supabaseStorage] FALLBACK reason=client-null (dev only — writing local)');
    }
  } else {
    if (isProd) throw new Error('Supabase not configured in production (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
    console.warn('[supabaseStorage] FALLBACK reason=env — Supabase not configured, writing local (dev only)');
  }

  // Local fallback (development only — production paths throw above)
  const base = localUploadsDir();
  const fullPath = path.join(base, objectPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return { bucket: 'local', path: objectPath, sha256 };
}

/** Non-secret storage probe for GET /health?deep=1 (Issue 1 fix 5). */
export async function probeStorage(): Promise<string> {
  if (!hasSupabase()) return 'not-configured';
  try {
    const client = (await getSupabaseClient()) as {
      storage: { from: (b: string) => { list: (p: string, opts: unknown) => Promise<{ error: unknown }> } };
    } | null;
    if (!client) return 'error client-unavailable';
    const { error } = await client.storage.from(getBucket()).list('', { limit: 1 });
    if (error) return `error ${(error as { code?: string }).code ?? (error as { message?: string }).message ?? 'unknown'}`;
    return 'ok';
  } catch (e) {
    return `error ${((e as Error)?.message ?? 'unknown').slice(0, 80)}`;
  }
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
