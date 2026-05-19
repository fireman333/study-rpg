/**
 * Daily R2-to-R2 backup cron @ 00:00 UTC.
 *
 * Copies every `users/*` object from R2_PRIMARY to R2_BACKUP under
 * `backup/<YYYY-MM-DD>/users/<user>/<bundle>.json.gz`, then prunes any
 * `backup/<DATE>/` prefix older than 30 days.
 *
 * Internal R2→R2 transfer = zero egress.
 */

import type { Env } from "./index";

function dateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function dateFromPrefix(prefix: string): Date | null {
  const match = prefix.match(/^backup\/(\d{4}-\d{2}-\d{2})\//);
  if (!match) return null;
  const d = new Date(match[1] + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

async function listAllUserObjects(bucket: R2Bucket): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: "users/", cursor, limit: 1000 });
    for (const obj of listed.objects) {
      keys.push(obj.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return keys;
}

async function copyObject(srcBucket: R2Bucket, dstBucket: R2Bucket, srcKey: string, dstKey: string): Promise<boolean> {
  const obj = await srcBucket.get(srcKey);
  if (!obj) return false;
  await dstBucket.put(dstKey, obj.body, {
    httpMetadata: obj.httpMetadata,
    customMetadata: obj.customMetadata,
  });
  return true;
}

async function pruneOldBackups(bucket: R2Bucket, retainDays: number): Promise<{ pruned: number }> {
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix: "backup/", cursor, limit: 1000 });
    for (const obj of listed.objects) {
      const d = dateFromPrefix(obj.key);
      if (d && d.getTime() < cutoff) {
        toDelete.push(obj.key);
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  if (toDelete.length > 0) {
    // R2 delete() accepts up to 1000 keys per call
    for (let i = 0; i < toDelete.length; i += 1000) {
      await bucket.delete(toDelete.slice(i, i + 1000));
    }
  }
  return { pruned: toDelete.length };
}

export async function runBackupCron(env: Env): Promise<void> {
  const stamp = dateStamp();
  console.log("[backup] starting", { stamp });

  const srcKeys = await listAllUserObjects(env.R2_PRIMARY);
  let copied = 0;
  let failed = 0;

  for (const srcKey of srcKeys) {
    const dstKey = `backup/${stamp}/${srcKey}`;
    try {
      const ok = await copyObject(env.R2_PRIMARY, env.R2_BACKUP, srcKey, dstKey);
      if (ok) copied++;
    } catch (err) {
      failed++;
      console.error("[backup] copy failed", { srcKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const pruneResult = await pruneOldBackups(env.R2_BACKUP, 30);

  console.log("[backup] done", {
    stamp,
    copied,
    failed,
    pruned: pruneResult.pruned,
    totalSrc: srcKeys.length,
  });
}
