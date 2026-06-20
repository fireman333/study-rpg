/**
 * Shoutout board ("留言" tab) — shared backend endpoints under /shoutouts/*.
 *
 * Endpoints (all under /shoutouts/:app/*, app ∈ APP_CONFIG):
 *   GET    /shoutouts/:app            → latest 40 (created_at DESC, visible), edge-cached
 *   PUT    /shoutouts/:app            → JWT verify → moderation pipeline → D1 UPSERT (+ audit)
 *   DELETE /shoutouts/:app            → JWT verify → soft-delete own message (+ audit)
 *   POST   /shoutouts/:app/report     → JWT verify → distinct-reporter count → soft-hide at threshold
 *   GET    /shoutouts/:app/admin/list → owner-only → list incl hidden/deleted + normalized text
 *   POST   /shoutouts/:app/admin/action → owner-only → delete/hide/unhide/ban/unban (+ audit)
 *
 * Design: openspec/changes/add-neurons-shoutout-board/design.md (Decisions 1–5)
 * Spec:   openspec/changes/.../specs/shoutout-board-backend/spec.md
 *
 * HARD-ISOLATED from sync/leaderboard/presign handlers (project「勿破壞共用 Worker」
 * rule): own namespace, own D1 tables (migration 0008), own rate-limit, own cache key.
 * Reuses only the shared auth (verifyJWT) + the leaderboard_<app> nickname/Top-100 join.
 *
 * Identity is server-sourced (design Decision 1): the display name is joined from
 * leaderboard_<app> by author_key and is NEVER read from the request body, so a
 * client cannot forge a name or bypass the (already-moderated) nickname surface.
 * The message body is the only free-text UGC field.
 */

import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

// === Per-app config ===
// Only apps with a migrated shoutouts_<app> table + leaderboard_<app> table are
// active here. This shoutout backend Worker is single-source in THIS monorepo
// (study-rpg-2nd hosts only the edge-router + the 留言 UI, not this backend), so
// every app's entry — neurons AND 二階 ('m2') — is registered here.
interface AppConfig {
  table: string;
  leaderboardTable: string;
  compositeKvKey: string;
  avatarType: string;
}
const APP_CONFIG: Record<string, AppConfig> = {
  neurons: {
    table: "shoutouts_neurons",
    leaderboardTable: "leaderboard_neurons",
    compositeKvKey: "leaderboard:neurons:top100:composite",
    avatarType: "neuron",
  },
  m2: {
    table: "shoutouts_m2",
    leaderboardTable: "leaderboard_m2",
    compositeKvKey: "leaderboard:m2:top100:composite",
    avatarType: "doctor",
  },
};

// === Tunable constants (dogfood-tunable per design Open Questions) ===
const MESSAGE_MAX_GRAPHEMES = 40;
const MESSAGE_MAX_LINES = 2;
const EDIT_COOLDOWN_MS = 5 * 60 * 1000; // 300s (design Facet/Decision: 5-min cooldown)
const DAILY_WRITE_CAP = 30; // coarse token bucket (per-user per-day)
const REPORT_HIDE_THRESHOLD = 3; // distinct reporters → soft-hide
const TOP_N_HALO = 10; // composite Top-N gets the special halo
// Opaque sprite key charset. Unicode letters/numbers allowed so apps with
// non-ASCII canonical sprite ids (neurons content pack's CJK family ids, e.g.
// 「寄生蟲學」) pass through verbatim; still excludes spaces / quotes / slashes /
// angle brackets / control chars. Mirror of @study-rpg/core ASSET_ID_PATTERN.
const ASSET_ID_PATTERN = /^[\p{L}\p{N}._:-]{1,64}$/u;

// Seed 繁中/EN keyword blocklist — minimal; owner extends via back-office / redeploy.
// Matched against the NFKC-normalized, whitespace-collapsed, lower-cased text.
const BLOCKLIST_SEED: readonly string[] = [
  "幹你", "去死", "智障", "白痴", "婊", "賤",
  "fuck", "shit", "bitch", "幹妳", "雜種",
];

// PII patterns (reject) — TW mobile / email / TW national id. Run on normalized text.
const PII_PATTERNS: readonly RegExp[] = [
  /09\d{8}/, // TW mobile (NFKC folds full-width digits)
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email
  /\b[a-z][12]\d{8}\b/i, // TW national id (letter + 1/2 + 8 digits)
];

// === Helpers ===

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function authUser(request: Request, env: Env): Promise<string> {
  const token = extractBearer(request);
  const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
  return user.sub;
}

// Strip zero-width + bidi-override + collapse whitespace; for blocklist/PII/hash.
// eslint-disable-next-line no-control-regex
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
// eslint-disable-next-line no-control-regex
const BIDI_OVERRIDE = /[\u202A-\u202E\u2066-\u2069]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/; // excludes \t\n\r

export function normalizeForMatch(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(BIDI_OVERRIDE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Grapheme-aware length (Intl.Segmenter on Workers runtime; codepoint fallback).
export function graphemeLen(s: string): number {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let n = 0;
    for (const _ of seg.segment(s)) n += 1;
    return n;
  } catch {
    return [...s].length;
  }
}

export function isBlocked(normalized: string): boolean {
  return BLOCKLIST_SEED.some((term) => normalized.includes(term));
}

export function hasPII(normalized: string): boolean {
  return PII_PATTERNS.some((re) => re.test(normalized));
}

// FNV-1a 32-bit hex — sync content hash for no-op-edit detection.
export function contentHash(parts: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
}

interface AvatarPayload {
  avatarType: string;
  assetId: string;
  cosmeticId?: string;
}

function parseAvatar(raw: unknown, cfg: AppConfig): AvatarPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (a.avatarType !== cfg.avatarType) return null;
  if (typeof a.assetId !== "string" || !ASSET_ID_PATTERN.test(a.assetId)) return null;
  if (a.cosmeticId !== undefined) {
    if (typeof a.cosmeticId !== "string" || !ASSET_ID_PATTERN.test(a.cosmeticId)) return null;
  }
  return {
    avatarType: a.avatarType,
    assetId: a.assetId,
    cosmeticId: typeof a.cosmeticId === "string" ? a.cosmeticId : undefined,
  };
}

async function topNSet(env: Env, cfg: AppConfig): Promise<Set<string>> {
  const snap = await env.LEADERBOARD_KV.get<{ rows: { user_id: string }[] }>(cfg.compositeKvKey, {
    type: "json",
  });
  const set = new Set<string>();
  if (snap?.rows) {
    for (const r of snap.rows.slice(0, TOP_N_HALO)) set.add(r.user_id);
  }
  return set;
}

async function nicknameFor(env: Env, cfg: AppConfig, authorKey: string): Promise<string | null> {
  const row = await env.LEADERBOARD_DB
    .prepare(`SELECT nickname FROM ${cfg.leaderboardTable} WHERE user_id = ?`)
    .bind(authorKey)
    .first<{ nickname: string }>();
  return row?.nickname ?? null;
}

async function isBanned(env: Env, app: string, authorKey: string, now: number): Promise<boolean> {
  const row = await env.LEADERBOARD_DB
    .prepare("SELECT until_ts FROM shoutout_bans WHERE app_id = ? AND author_key = ?")
    .bind(app, authorKey)
    .first<{ until_ts: number | null }>();
  if (!row) return false;
  return row.until_ts === null || row.until_ts > now;
}

async function writeAudit(
  env: Env,
  app: string,
  authorKey: string,
  action: string,
  fields: { original?: string; normalized?: string; avatar?: string; reporter?: string; reason?: string },
  now: number,
): Promise<void> {
  await env.LEADERBOARD_DB
    .prepare(
      `INSERT INTO shoutout_audit
         (app_id, author_key, action, message_original, message_normalized, avatar_json, reporter_key, reason, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      app,
      authorKey,
      action,
      fields.original ?? null,
      fields.normalized ?? null,
      fields.avatar ?? null,
      fields.reporter ?? null,
      fields.reason ?? null,
      now,
    )
    .run();
}

// === Dispatcher ===

export async function handleShoutout(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  // /shoutouts/<app>[/<sub>[/<sub2>]]
  const parts = url.pathname.split("/").filter(Boolean); // ["shoutouts", app, ...]
  const app = parts[1];
  const sub = parts[2];
  const sub2 = parts[3];
  const method = request.method;

  const cfg = app ? APP_CONFIG[app] : undefined;
  if (!cfg) return jsonResponse({ error: "unknown_app" }, 404, headers);

  if (!sub) {
    if (method === "GET") return handleGetBoard(env, headers, ctx, app, cfg);
    if (method === "PUT") return handlePut(request, env, headers, app, cfg);
    if (method === "DELETE") return handleDelete(request, env, headers, app, cfg);
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  }
  if (sub === "report" && method === "POST") return handleReport(request, env, headers, app, cfg);
  if (sub === "admin") {
    if (sub2 === "list" && method === "GET") return handleAdminList(request, env, headers, app, cfg);
    if (sub2 === "action" && method === "POST") return handleAdminAction(request, env, headers, app);
  }
  return jsonResponse({ error: "not_found" }, 404, headers);
}

// === GET board (edge-cached) ===

async function handleGetBoard(
  env: Env,
  headers: Record<string, string>,
  ctx: ExecutionContext,
  app: string,
  cfg: AppConfig,
): Promise<Response> {
  // Origin-independent cache key so all origins share one entry (CORS re-applied
  // per request). Edge cache (caches.default) — NOT KV — so no KV write budget burn.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://shoutout.cache/board/${app}/v1`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = await hit.text();
    return new Response(body, {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "X-Shoutout-Cache": "hit" },
    });
  }

  const rows = await env.LEADERBOARD_DB
    .prepare(
      `SELECT author_key, avatar_type, asset_id, cosmetic_id, message, created_at, updated_at
       FROM ${cfg.table}
       WHERE deleted = 0 AND hidden = 0
       ORDER BY created_at DESC
       LIMIT 40`,
    )
    .all<{
      author_key: string;
      avatar_type: string;
      asset_id: string;
      cosmetic_id: string | null;
      message: string;
      created_at: number;
      updated_at: number;
    }>();

  const list = rows.results ?? [];
  const authorKeys = list.map((r) => r.author_key);

  // Join nicknames in one query.
  const nameByKey = new Map<string, string>();
  if (authorKeys.length > 0) {
    const placeholders = authorKeys.map(() => "?").join(",");
    const nameRows = await env.LEADERBOARD_DB
      .prepare(`SELECT user_id, nickname FROM ${cfg.leaderboardTable} WHERE user_id IN (${placeholders})`)
      .bind(...authorKeys)
      .all<{ user_id: string; nickname: string }>();
    for (const n of nameRows.results ?? []) nameByKey.set(n.user_id, n.nickname);
  }

  const topN = await topNSet(env, cfg);

  const messages = list.map((r) => ({
    id: r.author_key,
    authorKey: r.author_key,
    nickname: nameByKey.get(r.author_key) ?? "匿名同學",
    isTopN: topN.has(r.author_key),
    avatar: {
      avatarType: r.avatar_type,
      assetId: r.asset_id,
      ...(r.cosmetic_id ? { cosmeticId: r.cosmetic_id } : {}),
    },
    message: r.message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const body = JSON.stringify({ messages, count: messages.length });
  const toCache = new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "max-age=30, stale-while-revalidate=60" },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache.clone()));
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json", "X-Shoutout-Cache": "miss" },
  });
}

// === PUT (compose / edit) ===

interface PutBody {
  avatar?: unknown;
  message?: unknown;
}

async function handlePut(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  app: string,
  cfg: AppConfig,
): Promise<Response> {
  let sub: string;
  try {
    sub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  const now = Date.now();
  if (await isBanned(env, app, sub, now)) {
    return jsonResponse({ error: "banned" }, 403, headers);
  }

  // Nickname gate (doubles as established-account gate: a brand-new account has
  // no leaderboard_<app> row, so it cannot post until it has set a nickname).
  const nickname = await nicknameFor(env, cfg, sub);
  if (!nickname) {
    return jsonResponse({ error: "nickname_required" }, 422, headers);
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400, headers);
  }

  const avatar = parseAvatar(body.avatar, cfg);
  if (!avatar) return jsonResponse({ error: "invalid_avatar" }, 400, headers);
  if (typeof body.message !== "string") return jsonResponse({ error: "invalid_message" }, 400, headers);

  const original = body.message.trim();
  if (original.length === 0) return jsonResponse({ error: "empty_message" }, 400, headers);
  if (CONTROL_CHARS.test(original) || BIDI_OVERRIDE.test(original)) {
    return jsonResponse({ error: "invalid_chars" }, 400, headers);
  }
  // Line + length limits (≤ 2 lines, ≤ 40 graphemes ignoring line breaks).
  if (original.split("\n").length > MESSAGE_MAX_LINES) {
    return jsonResponse({ error: "too_many_lines" }, 400, headers);
  }
  if (graphemeLen(original.replace(/\n/g, "")) > MESSAGE_MAX_GRAPHEMES) {
    return jsonResponse({ error: "too_long" }, 400, headers);
  }

  const normalized = normalizeForMatch(original);
  if (isBlocked(normalized)) return jsonResponse({ error: "blocked_content" }, 422, headers);
  if (hasPII(normalized)) return jsonResponse({ error: "pii_detected" }, 422, headers);

  const avatarJson = JSON.stringify(avatar);
  const hash = contentHash(`${avatar.avatarType}|${avatar.assetId}|${avatar.cosmeticId ?? ""}|${normalized}`);

  const existing = await env.LEADERBOARD_DB
    .prepare(
      `SELECT content_hash, created_at, last_write_at, writes_day, writes_today, deleted, hidden
       FROM ${cfg.table} WHERE author_key = ?`,
    )
    .bind(sub)
    .first<{
      content_hash: string;
      created_at: number;
      last_write_at: number;
      writes_day: string;
      writes_today: number;
      deleted: number;
      hidden: number;
    }>();

  const isActiveExisting = existing && existing.deleted === 0;

  // No-op: identical content on an active row → no D1 write (saves quota / acts as If-Match).
  if (isActiveExisting && existing!.content_hash === hash) {
    return jsonResponse({ ok: true, noop: true }, 200, headers);
  }
  // Cooldown (only against an active row).
  if (isActiveExisting && now - existing!.last_write_at < EDIT_COOLDOWN_MS) {
    return jsonResponse(
      { error: "cooldown", retryAfterMs: EDIT_COOLDOWN_MS - (now - existing!.last_write_at) },
      429,
      headers,
    );
  }
  // Daily write cap.
  const today = utcDay(now);
  const writesToday = existing && existing.writes_day === today ? existing.writes_today : 0;
  if (writesToday >= DAILY_WRITE_CAP) {
    return jsonResponse({ error: "daily_cap" }, 429, headers);
  }

  const createdAt = isActiveExisting ? existing!.created_at : now;
  // Preserve a moderation hide across edits (owner must explicitly unhide).
  const hidden = existing ? existing.hidden : 0;

  await env.LEADERBOARD_DB
    .prepare(
      `INSERT INTO ${cfg.table}
         (author_key, avatar_type, asset_id, cosmetic_id, message, message_normalized,
          content_hash, created_at, updated_at, last_write_at, writes_day, writes_today, deleted, hidden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(author_key) DO UPDATE SET
         avatar_type        = excluded.avatar_type,
         asset_id           = excluded.asset_id,
         cosmetic_id        = excluded.cosmetic_id,
         message            = excluded.message,
         message_normalized = excluded.message_normalized,
         content_hash       = excluded.content_hash,
         created_at         = excluded.created_at,
         updated_at         = excluded.updated_at,
         last_write_at      = excluded.last_write_at,
         writes_day         = excluded.writes_day,
         writes_today       = excluded.writes_today,
         deleted            = 0,
         hidden             = excluded.hidden`,
    )
    .bind(
      sub,
      avatar.avatarType,
      avatar.assetId,
      avatar.cosmeticId ?? null,
      original,
      normalized,
      hash,
      createdAt,
      now,
      now,
      today,
      writesToday + 1,
      hidden,
    )
    .run();

  await writeAudit(
    env,
    app,
    sub,
    isActiveExisting ? "edit" : "create",
    { original, normalized, avatar: avatarJson },
    now,
  );

  const topN = await topNSet(env, cfg);
  return jsonResponse(
    {
      ok: true,
      message: {
        id: sub,
        authorKey: sub,
        nickname,
        isTopN: topN.has(sub),
        avatar,
        message: original,
        createdAt,
        updatedAt: now,
      },
    },
    200,
    headers,
  );
}

// === DELETE (soft) ===

async function handleDelete(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  app: string,
  cfg: AppConfig,
): Promise<Response> {
  let sub: string;
  try {
    sub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }
  const now = Date.now();
  const res = await env.LEADERBOARD_DB
    .prepare(`UPDATE ${cfg.table} SET deleted = 1, updated_at = ? WHERE author_key = ? AND deleted = 0`)
    .bind(now, sub)
    .run();
  if ((res.meta?.changes ?? 0) > 0) {
    await writeAudit(env, app, sub, "delete", {}, now);
  }
  return jsonResponse({ ok: true }, 200, headers);
}

// === POST report ===

interface ReportBody {
  targetAuthorKey?: unknown;
}

async function handleReport(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  app: string,
  cfg: AppConfig,
): Promise<Response> {
  let reporter: string;
  try {
    reporter = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }
  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400, headers);
  }
  const target = body.targetAuthorKey;
  if (typeof target !== "string" || target.length === 0 || target.length > 128) {
    return jsonResponse({ error: "invalid_target" }, 400, headers);
  }

  const now = Date.now();
  // Unique (app, target, reporter) blocks a single reporter inflating the count.
  await env.LEADERBOARD_DB
    .prepare(
      `INSERT OR IGNORE INTO shoutout_reports (app_id, target_author_key, reporter_key, ts)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(app, target, reporter, now)
    .run();

  const countRow = await env.LEADERBOARD_DB
    .prepare("SELECT COUNT(*) AS c FROM shoutout_reports WHERE app_id = ? AND target_author_key = ?")
    .bind(app, target)
    .first<{ c: number }>();
  const distinct = countRow?.c ?? 0;

  let hidden = false;
  if (distinct >= REPORT_HIDE_THRESHOLD) {
    const res = await env.LEADERBOARD_DB
      .prepare(`UPDATE ${cfg.table} SET hidden = 1 WHERE author_key = ? AND hidden = 0`)
      .bind(target)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      hidden = true;
      await writeAudit(env, app, target, "hide", { reason: `auto-report-threshold(${distinct})` }, now);
    } else {
      hidden = true; // already hidden
    }
  }

  return jsonResponse({ ok: true, hidden }, 200, headers);
}

// === Owner back-office ===

function isOwner(env: Env, sub: string): boolean {
  const list = (env.SHOUTOUT_OWNER_SUBS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(sub);
}

async function handleAdminList(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  _app: string,
  cfg: AppConfig,
): Promise<Response> {
  let sub: string;
  try {
    sub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }
  if (!isOwner(env, sub)) return jsonResponse({ error: "forbidden" }, 403, headers);

  const rows = await env.LEADERBOARD_DB
    .prepare(
      `SELECT author_key, asset_id, message, message_normalized, created_at, updated_at, deleted, hidden
       FROM ${cfg.table}
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
    .all();
  return jsonResponse({ rows: rows.results ?? [] }, 200, headers);
}

interface AdminActionBody {
  action?: unknown;
  targetAuthorKey?: unknown;
  reason?: unknown;
  untilTs?: unknown;
}

async function handleAdminAction(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  app: string,
): Promise<Response> {
  let sub: string;
  try {
    sub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }
  if (!isOwner(env, sub)) return jsonResponse({ error: "forbidden" }, 403, headers);

  const cfg = APP_CONFIG[app];
  if (!cfg) return jsonResponse({ error: "unknown_app" }, 404, headers);

  let body: AdminActionBody;
  try {
    body = (await request.json()) as AdminActionBody;
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400, headers);
  }
  const action = body.action;
  const target = body.targetAuthorKey;
  if (typeof target !== "string" || target.length === 0) {
    return jsonResponse({ error: "invalid_target" }, 400, headers);
  }
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  const now = Date.now();

  switch (action) {
    case "delete":
      await env.LEADERBOARD_DB.prepare(`UPDATE ${cfg.table} SET deleted = 1, updated_at = ? WHERE author_key = ?`).bind(now, target).run();
      await writeAudit(env, app, target, "admin_delete", { reason }, now);
      break;
    case "hide":
      await env.LEADERBOARD_DB.prepare(`UPDATE ${cfg.table} SET hidden = 1 WHERE author_key = ?`).bind(target).run();
      await writeAudit(env, app, target, "hide", { reason }, now);
      break;
    case "unhide":
      await env.LEADERBOARD_DB.prepare(`UPDATE ${cfg.table} SET hidden = 0 WHERE author_key = ?`).bind(target).run();
      await writeAudit(env, app, target, "unhide", { reason }, now);
      break;
    case "ban": {
      const untilTs = typeof body.untilTs === "number" ? body.untilTs : null;
      await env.LEADERBOARD_DB
        .prepare(
          `INSERT INTO shoutout_bans (app_id, author_key, until_ts, reason, ts)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(app_id, author_key) DO UPDATE SET until_ts = excluded.until_ts, reason = excluded.reason, ts = excluded.ts`,
        )
        .bind(app, target, untilTs, reason ?? null, now)
        .run();
      // Ban also hides the current message.
      await env.LEADERBOARD_DB.prepare(`UPDATE ${cfg.table} SET hidden = 1 WHERE author_key = ?`).bind(target).run();
      await writeAudit(env, app, target, "ban", { reason }, now);
      break;
    }
    case "unban":
      await env.LEADERBOARD_DB.prepare("DELETE FROM shoutout_bans WHERE app_id = ? AND author_key = ?").bind(app, target).run();
      await writeAudit(env, app, target, "unban", { reason }, now);
      break;
    default:
      return jsonResponse({ error: "invalid_action" }, 400, headers);
  }
  return jsonResponse({ ok: true }, 200, headers);
}
