/**
 * Hospital leaderboard — endpoints + 30-min snapshot cron.
 *
 * Endpoints (all under /leaderboard/*):
 *   POST   /leaderboard/upsert           → JWT verify → sanity bounds → D1 UPSERT (LWW)
 *   GET    /leaderboard/:filter          → read KV snapshot (no D1 hit at request time)
 *                                          filter ∈ {composite, correct, reputation, doctor, study}
 *   GET    /leaderboard/nickname-check?n=<candidate>   → JWT verify → D1 lookup
 *   GET    /leaderboard/my-rank/:filter  → JWT verify → D1 rank COUNT (exact rank
 *                                          for opted-in players outside the top-100
 *                                          snapshot — Phase 4 follow-up)
 *   POST   /leaderboard/opt-out          → JWT verify → set is_public = 0
 *   DELETE /leaderboard/me               → JWT verify → DELETE row (account deletion)
 *
 * Scheduled trigger (cron "0,30 * * * *", wired in index.ts):
 *   runLeaderboardCron(env)              → 5 D1 queries → 5 KV snapshots
 *
 * Design decisions live in:
 *   openspec/changes/add-hospital-leaderboard/design.md (D1–D7)
 *   openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
 *
 * Anti-cheat policy: full trust + UI footer disclosure (no HMAC, no replay
 * detection). Worker only enforces sanity bounds — out-of-bounds payloads
 * are dropped silently with a structured warn log, returning 200 OK so the
 * client doesn't retry-storm. Tampered scores are not a security concern at
 * this scale (< 1k players, no monetary reward, leaderboard footer literally
 * says "自填無驗證").
 */

import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

// === Constants ===

// FILTERS drives route regex / ORDER_BY map / cron loop / KV key generation.
// Order here is schema-natural (cron + KV iteration order). The UI tab strip
// uses an independent ordering (correct sits at position 2 in the UI; see
// LeaderboardPage filter list).
const FILTERS = ["composite", "reputation", "doctor", "study", "correct"] as const;
type Filter = (typeof FILTERS)[number];

const NICKNAME_MIN_CODEPOINTS = 2;
const NICKNAME_MAX_CODEPOINTS = 12;

const TIER_MIN = 1;
const TIER_MAX = 4;

/**
 * Minimum spacing between two writes of the same leaderboard row.
 *
 * Authoritative half of the client-side throttle in the 二階 app
 * (`apps/medexam2-hospital-tw/src/lib/leaderboard/throttle.ts` in the
 * `study-rpg-2nd` repo — change `throttle-leaderboard-upsert-and-cache-assets`).
 * That gate saves Worker requests; this one saves D1 written rows, and unlike
 * that one it binds clients running a stale cached bundle, which is the whole
 * reason it exists. ⚠️ The two are separate constants in separate repos with no
 * shared module. Change one, change the other.
 *
 * Measured motivation (2026-08-21): 10,310 rows written in 24h across ~10
 * active players — 10.3% of the free daily allowance — at 7.19 written rows per
 * write query, because `leaderboard_m2` carries 7 indexes. The visible ranking
 * is recomputed from KV on a 30-minute cron, so most of those writes were for a
 * reading nobody took.
 */
export const LEADERBOARD_THROTTLE_MS = 15 * 60_000;

// === Achievement badge constants (v15 add-achievement-system) ===
const BADGES_CSV_MAX_LEN = 60;
const BADGES_CSV_MAX_ENTRIES = 6;
const BADGES_CSV_PATTERN = /^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$/;
const SUBJECT_MASTERY_MIN = 0;
const SUBJECT_MASTERY_MAX = 14;

/**
 * The leaderboard upsert, as one statement.
 *
 * Exported so its test drives THIS string against a real SQLite rather than a
 * copy of it. The load-bearing claim of the throttle is that a suppressed
 * upsert writes zero rows — table and index alike — and a test that retypes the
 * predicate proves that about the retyped version, not about what ships.
 *
 * Placeholders are positional: 1-12 are the VALUES, 13 is the minimum gap in ms
 * (0 for a forced push, which collapses the predicate back to plain LWW).
 *
 * ⚠️ If that 13th parameter is ever left unbound it arrives as NULL, the
 * predicate evaluates to NULL rather than true, and EVERY subsequent update is
 * suppressed forever — a total leaderboard freeze, which is a failure this
 * project has already lived through once from a different cause. `minGapMs` is
 * computed from a ternary over a constant so it cannot be undefined; the test
 * pins the NULL behaviour so the consequence stays on record.
 */
export const LEADERBOARD_UPSERT_SQL = `INSERT INTO leaderboard_m2
         (user_id, nickname, nickname_lower, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at, badges_csv, subject_mastery_count, total_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         nickname              = excluded.nickname,
         nickname_lower        = excluded.nickname_lower,
         hospital_tier         = excluded.hospital_tier,
         reputation            = excluded.reputation,
         doctor_count          = excluded.doctor_count,
         total_study_min       = excluded.total_study_min,
         is_public             = excluded.is_public,
         updated_at            = excluded.updated_at,
         badges_csv            = CASE
                                   WHEN excluded.badges_csv = '' AND leaderboard_m2.badges_csv != ''
                                   THEN leaderboard_m2.badges_csv
                                   ELSE excluded.badges_csv
                                 END,
         subject_mastery_count = CASE
                                   WHEN excluded.subject_mastery_count = 0 AND leaderboard_m2.subject_mastery_count > 0
                                   THEN leaderboard_m2.subject_mastery_count
                                   ELSE excluded.subject_mastery_count
                                 END,
         total_correct         = CASE
                                   WHEN excluded.total_correct = 0 AND leaderboard_m2.total_correct > 0
                                   THEN leaderboard_m2.total_correct
                                   ELSE excluded.total_correct
                                 END
       -- Throttle + LWW in one predicate. The placeholder is bound to 0 for a
       -- forced push, collapsing this back to the plain LWW comparison it has
       -- always been.
       -- Positional: the 12 VALUES placeholders are 1-12, this is 13.
       WHERE leaderboard_m2.updated_at + ? < excluded.updated_at`;

// === Types ===

interface LeaderboardRowInternal {
  user_id: string;
  nickname: string;
  hospital_tier: number;
  reputation: number;
  doctor_count: number;
  total_study_min: number;
  updated_at: number;
  // Achievement system (v15). Optional in interface for back-compat with
  // pre-0002 snapshots; readers fall back to '' / 0 when undefined.
  badges_csv?: string;
  subject_mastery_count?: number;
  // 5th filter (add-hospital-leaderboard-correct-count-filter, 0005). Optional
  // for back-compat with pre-0005 KV snapshots; readers fall back to 0.
  total_correct?: number;
}

interface SnapshotPayload {
  rows: LeaderboardRowInternal[];
  last_updated_at: number;
  total_count: number;
}

interface UpsertBody {
  nickname?: unknown;
  hospital_tier?: unknown;
  reputation?: unknown;
  doctor_count?: unknown;
  total_study_min?: unknown;
  is_public?: unknown;
  updated_at?: unknown;
  /**
   * Forced push — skip the throttle window (never the sanity bounds).
   *
   * Set by the client's manual and lifecycle paths: 「立即同步上傳」, the
   * migration-gate upload, conflict resolution, the manual retry, the sign-out
   * flush, account switch, and the row-staleness notice's repair button.
   *
   * ⚠️ Without honouring this, the server window silently overrides the
   * exemption the client honours, and the repair button becomes structurally
   * incapable of fixing the row it is complaining about.
   *
   * Forgeable by a modified client — on exactly the same terms as `updated_at`
   * just above, which the throttle and LWW both already trust. A client that
   * can forge one can forge the other, so this widens no accepted exposure.
   */
  force?: unknown;
  // Achievement system (v15). Both optional — pre-update clients omit; Worker
  // treats omitted as '' / 0 (additive, doesn't clobber on partial bodies).
  badges_csv?: unknown;
  subject_mastery_count?: unknown;
  // 5th filter (0005). Optional — pre-update clients omit; Worker treats
  // omitted as 0 per design D5 (forward-compat during rollout window).
  total_correct?: unknown;
}

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

function normalizeNickname(raw: string): string {
  return raw.normalize("NFKC").toLowerCase();
}

function countCodepoints(s: string): number {
  // Unicode codepoint count, matching `[...str].length` semantics on the
  // client. Note: emoji ZWJ sequences (e.g. 👨‍👩‍👧) count as MULTIPLE
  // codepoints — this is accepted P4 polish for Phase 2 follow-up.
  return [...s].length;
}

function isValidNicknameLength(raw: string): boolean {
  const cp = countCodepoints(raw);
  return cp >= NICKNAME_MIN_CODEPOINTS && cp <= NICKNAME_MAX_CODEPOINTS;
}

function snapshotKvKey(filter: Filter): string {
  return `leaderboard:m2:top100:${filter}`;
}

// Build the filter-route regex from FILTERS so the source of truth stays
// the const array; adding a 5th tab only requires editing FILTERS.
const FILTER_ROUTE_REGEX = new RegExp(`^/leaderboard/(${FILTERS.join("|")})$`);

const SNAPSHOT_COLUMNS =
  "user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, updated_at, badges_csv, subject_mastery_count, total_correct";

const ORDER_BY: Record<Filter, string> = {
  composite: "hospital_tier DESC, reputation DESC, doctor_count DESC",
  reputation: "reputation DESC",
  doctor: "doctor_count DESC",
  study: "total_study_min DESC",
  correct: "total_correct DESC",
};

// Attribute snapshot of the requesting user's own row, used to compute their
// exact rank (my-rank endpoint). Mirrors the columns ORDER_BY can reference.
interface MyRankAttrs {
  hospital_tier: number;
  reputation: number;
  doctor_count: number;
  total_study_min: number;
  total_correct: number;
}

/**
 * Build the "sorts STRICTLY BEFORE me" WHERE predicate for a filter. MUST
 * stay in lock-step with ORDER_BY above (column + direction + tie-breakers) —
 * rank = COUNT(public rows matching predicate) + 1 then matches the row's
 * position in the cron-built snapshot for that filter.
 *
 * Tie semantics: the four single-column filters carry no explicit tie-breaker
 * in ORDER_BY (tied rows appear in unspecified order in the snapshot), and
 * composite has no unique final tie-breaker either — so the COUNT yields
 * competition-style ranking (ties share the best rank), which is consistent
 * with whichever tie permutation the snapshot happens to display.
 *
 * Pure function (no D1 / no env) — exported so it can be unit-tested once the
 * worker package grows a test runner.
 */
export function buildMyRankPredicate(
  filter: Filter,
  me: MyRankAttrs,
): { where: string; binds: number[] } {
  switch (filter) {
    case "composite":
      // ORDER_BY.composite = hospital_tier DESC, reputation DESC, doctor_count DESC
      return {
        where:
          "hospital_tier > ? OR (hospital_tier = ? AND reputation > ?) OR (hospital_tier = ? AND reputation = ? AND doctor_count > ?)",
        binds: [
          me.hospital_tier,
          me.hospital_tier,
          me.reputation,
          me.hospital_tier,
          me.reputation,
          me.doctor_count,
        ],
      };
    case "reputation":
      return { where: "reputation > ?", binds: [me.reputation] };
    case "doctor":
      return { where: "doctor_count > ?", binds: [me.doctor_count] };
    case "study":
      return { where: "total_study_min > ?", binds: [me.total_study_min] };
    case "correct":
      return { where: "total_correct > ?", binds: [me.total_correct] };
  }
}

// my-rank route matches any trailing segment; the handler validates it
// against FILTERS so an unknown filter yields a 400 (not a silent 404).
const MY_RANK_ROUTE_REGEX = /^\/leaderboard\/my-rank\/([^/]+)$/;

// === Dispatcher ===

export async function handleLeaderboard(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/leaderboard/upsert" && method === "POST") {
    return handleUpsert(request, env, headers);
  }
  if (path === "/leaderboard/opt-out" && method === "POST") {
    return handleOptOut(request, env, headers);
  }
  if (path === "/leaderboard/me" && method === "DELETE") {
    return handleDeleteMe(request, env, headers);
  }
  if (path === "/leaderboard/me" && method === "GET") {
    return handleGetMe(request, env, headers);
  }
  // NOTE: handleGetMe added 2026-05-22 but Worker deploy currently blocked by
  // CF entitlements.not_available 10007 (account-level issue, unrelated).
  // Endpoint is dormant until deploy unblocks; client-side seed-on-sign-in
  // path is guarded by feature detection (404 → fall back to opt-in modal).
  if (path === "/leaderboard/nickname-check" && method === "GET") {
    return handleNicknameCheck(request, env, headers);
  }
  const myRankMatch = path.match(MY_RANK_ROUTE_REGEX);
  if (myRankMatch && method === "GET") {
    return handleMyRank(myRankMatch[1], request, env, headers);
  }
  const filterMatch = path.match(FILTER_ROUTE_REGEX);
  if (filterMatch && method === "GET") {
    return handleGetFilter(filterMatch[1] as Filter, env, headers);
  }

  return new Response("Not Found", { status: 404, headers });
}

// === Endpoint handlers ===

async function handleUpsert(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Auth (JWT sub is the ONLY source of user_id — body ignored to prevent
  // cross-tenancy forging, same pattern as presign.ts).
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400, headers);
  }

  if (typeof body.nickname !== "string" || !isValidNicknameLength(body.nickname)) {
    return jsonResponse({ error: "invalid_nickname_length" }, 400, headers);
  }

  const tier = Number(body.hospital_tier);
  const rep = Number(body.reputation);
  const doctor = Number(body.doctor_count);
  const study = Number(body.total_study_min);
  const isPublic = body.is_public === 0 ? 0 : 1;
  const updatedAt = Number(body.updated_at);
  const forced = body.force === true;
  // 0 for a forced push collapses the predicate back to plain LWW, so the
  // forced path takes the same code path rather than a parallel one.
  const minGapMs = forced ? 0 : LEADERBOARD_THROTTLE_MS;

  // Sanity bounds — out-of-bounds rows are dropped silently (warn log,
  // 200 OK) per design.md Decision D3. This avoids client retry storms
  // while still preventing JSON-injection or wild values from polluting D1.
  if (!Number.isInteger(tier) || tier < TIER_MIN || tier > TIER_MAX) {
    console.warn("[leaderboard] dropped upsert: tier oob", { user: userSub, tier });
    return jsonResponse({ ok: true, dropped: "tier_oob" }, 200, headers);
  }
  if (!Number.isFinite(rep) || rep < 0) {
    console.warn("[leaderboard] dropped upsert: reputation oob", { user: userSub, rep });
    return jsonResponse({ ok: true, dropped: "rep_oob" }, 200, headers);
  }
  // No upper bound on doctor_count: the roster grows unbounded via daily
  // recruitment gacha (no in-game cap), so a fixed ceiling silently froze
  // mature saves whose every upsert was dropped once they crossed it (a save
  // with 64 doctors sat stale for weeks under an old cap of 50). Reject only
  // non-integer / negative — matching reputation / total_study / total_correct,
  // which are likewise unbounded above.
  if (!Number.isInteger(doctor) || doctor < 0) {
    console.warn("[leaderboard] dropped upsert: doctor_count oob", { user: userSub, doctor });
    return jsonResponse({ ok: true, dropped: "doctor_oob" }, 200, headers);
  }
  if (!Number.isFinite(study) || study < 0) {
    console.warn("[leaderboard] dropped upsert: study_min oob", { user: userSub, study });
    return jsonResponse({ ok: true, dropped: "study_oob" }, 200, headers);
  }
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return jsonResponse({ error: "invalid_updated_at" }, 400, headers);
  }

  // total_correct (5th filter — add-hospital-leaderboard-correct-count-filter).
  // Optional in body for forward-compat with pre-0005 client bundles; missing
  // → treat as 0. Same drop-silently-with-200 pattern as the other sanity
  // bounds so old clients don't retry-storm during the rollout window.
  const correct = Number(body.total_correct ?? 0);
  if (!Number.isFinite(correct) || correct < 0) {
    console.warn("[leaderboard] dropped upsert: correct oob", { user: userSub, correct });
    return jsonResponse({ ok: true, dropped: "correct_oob" }, 200, headers);
  }

  // === Achievement system (v15) — badges_csv + subject_mastery_count ===
  // Both optional; default to '' / 0 when missing. Invalid values rejected
  // with 400 (NOT silently dropped — these are client-derived values, not
  // user-input, so a bad value indicates a client bug worth surfacing).
  let badgesCsv = "";
  if (body.badges_csv !== undefined) {
    if (typeof body.badges_csv !== "string") {
      return jsonResponse({ error: "invalid_badges_csv_type" }, 400, headers);
    }
    if (body.badges_csv.length > BADGES_CSV_MAX_LEN) {
      return jsonResponse({ error: "badges_csv_too_long" }, 400, headers);
    }
    if (body.badges_csv !== "" && !BADGES_CSV_PATTERN.test(body.badges_csv)) {
      return jsonResponse({ error: "invalid_badges_csv_format" }, 400, headers);
    }
    // Defensive entry-count check (the regex caps at 6 but explicit is clearer)
    if (body.badges_csv !== "" && body.badges_csv.split(",").length > BADGES_CSV_MAX_ENTRIES) {
      return jsonResponse({ error: "badges_csv_too_many_entries" }, 400, headers);
    }
    badgesCsv = body.badges_csv;
  }

  let subjectMastery = 0;
  if (body.subject_mastery_count !== undefined) {
    const sm = Number(body.subject_mastery_count);
    if (!Number.isInteger(sm) || sm < SUBJECT_MASTERY_MIN || sm > SUBJECT_MASTERY_MAX) {
      return jsonResponse({ error: "invalid_subject_mastery_count" }, 400, headers);
    }
    subjectMastery = sm;
  }

  const nickname = body.nickname;
  const nicknameLower = normalizeNickname(nickname);

  try {
    // UPSERT with LWW: only update if incoming updated_at is newer. The
    // nickname_lower UNIQUE constraint handles uniqueness — we parse the
    // SQLite error message to map it back to a typed 409. (Earlier impl
    // did a separate SELECT pre-check; that doubled D1 round-trips per push
    // for no extra safety, since this query is the gate either way.)
    // One-way ratchet on badges_csv + subject_mastery_count: an "empty"
    // incoming value (badges_csv = '' / subject_mastery_count = 0) MUST NOT
    // overwrite a non-empty current value. Protects against stale-client
    // clobber where a player on a pre-fix JS bundle keeps pushing empty
    // achievement payloads (their local Dexie achievements table is empty
    // because the broken client-side backfill never wrote it) AFTER a
    // server-side backfill (scripts/backfill-leaderboard-badges.ts) has
    // populated D1 from R2 bundle derivation. Without this ratchet the LWW
    // updated_at gate accepts the stale push and clobbers the derived
    // value, requiring repeated server-side backfill until the player
    // picks up new JS. See 2026-05-24 decision entry on Worker ratchet.
    // All other fields (nickname / tier / reputation / counts / is_public)
    // keep plain LWW — clients legitimately refresh those each cycle and
    // "empty" values aren't a defensive concept there.
    const result = await env.LEADERBOARD_DB.prepare(LEADERBOARD_UPSERT_SQL)
      .bind(
        userSub,
        nickname,
        nicknameLower,
        tier,
        rep,
        doctor,
        study,
        isPublic,
        updatedAt,
        badgesCsv,
        subjectMastery,
        correct,
        minGapMs,
      )
      .run();

    // ⚠️ Whether a write happened comes from the database's own report, not
    // from the statement having executed. A conditionally-suppressed upsert
    // runs successfully and changes nothing; reading success as a write is how
    // the client would advance `last_pushed_at` for a row we left alone.
    if (result.meta?.changes === 0) {
      // Nothing was written and no index was touched, so this costs zero
      // `rows_written` — which is the entire point of doing it in the WHERE
      // rather than by reading first and deciding in JS.
      //
      // Deliberately distinguishable from `dropped`: that means "your payload
      // was refused", this means "your row is already current". A client that
      // cannot tell them apart treats one of them wrongly, and the unmarked-200
      // default is to treat it as a landed write.
      //
      // `window_ms` is echoed, and `next_eligible_at` deliberately is not. The
      // latter would need the stored `updated_at` — a read-back to tell the
      // client something it can derive — and in the first draft it was never
      // sent at all, leaving three layers of client plumbing whose only
      // reachable branch was the null one.
      //
      // The window is the one number the client CANNOT derive: it lives in
      // another repo with no shared module between them. Echoing it makes a
      // drift between the two constants detectable at runtime rather than
      // merely documented, and closes a real hazard — a client whose window is
      // SHORTER than this one would otherwise re-arm a trailing push that is
      // throttled again, and again, without converging.
      return jsonResponse(
        { ok: true, throttled: true, window_ms: LEADERBOARD_THROTTLE_MS },
        200,
        headers,
      );
    }

    return jsonResponse({ ok: true }, 200, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE constraint failed: leaderboard_m2.nickname_lower")) {
      return jsonResponse({ error: "nickname_taken" }, 409, headers);
    }
    console.error("[leaderboard] upsert failed", { user: userSub, err: message });
    return jsonResponse({ error: "upsert_failed" }, 500, headers);
  }
}

async function handleGetFilter(
  filter: Filter,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Read from KV snapshot — cron writes it every hour. Client never hits D1
  // on read path. If cron has never run yet, return empty payload (the UI
  // surfaces "未加入排行" empty state for that case).
  const cached = await env.LEADERBOARD_KV.get<SnapshotPayload>(snapshotKvKey(filter), {
    type: "json",
  });

  if (!cached) {
    return jsonResponse(
      { rows: [], last_updated_at: null, total_count: 0 },
      200,
      headers,
    );
  }

  return jsonResponse(cached, 200, headers);
}

async function handleNicknameCheck(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // JWT-gate this endpoint to prevent unauthenticated enumeration of
  // nicknames (privacy concern — anyone could otherwise scrape via
  // dictionary attack).
  try {
    await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  const url = new URL(request.url);
  const candidate = url.searchParams.get("n");

  if (typeof candidate !== "string" || candidate.length === 0) {
    return jsonResponse({ error: "missing_n" }, 400, headers);
  }
  if (!isValidNicknameLength(candidate)) {
    return jsonResponse({ available: false, reason: "invalid_length" }, 200, headers);
  }

  const nickLower = normalizeNickname(candidate);
  const row = await env.LEADERBOARD_DB
    .prepare("SELECT 1 FROM leaderboard_m2 WHERE nickname_lower = ? LIMIT 1")
    .bind(nickLower)
    .first();

  return jsonResponse({ available: row === null }, 200, headers);
}

async function handleOptOut(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  // Row is preserved (per D5 — re-enabling opt-in restores rank history).
  // Just flip is_public to 0 and bump updated_at so the next sync's LWW
  // doesn't accidentally restore is_public = 1 from a stale client cache.
  await env.LEADERBOARD_DB
    .prepare("UPDATE leaderboard_m2 SET is_public = 0, updated_at = ? WHERE user_id = ?")
    .bind(Date.now(), userSub)
    .run();

  return jsonResponse({ ok: true }, 200, headers);
}

async function handleGetMe(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Cross-origin seed-back: a client on a new origin (e.g. post-domain-
  // migration `med-study-rpg.com`) whose IndexedDB has no `leaderboardProfile`
  // row can call this to discover whether the user already has a server-
  // side row from a prior session and rehydrate their local opted_in /
  // nickname / is_public state — avoiding a redundant opt-in modal.
  //
  // Returns 200 + { row: null } when the user has never opted in (this is
  // an expected state, not an error — clients should treat it as "show
  // opt-in modal on first visit"). Returns 200 + row when found.
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  const row = await env.LEADERBOARD_DB
    .prepare(
      "SELECT user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at, badges_csv, subject_mastery_count, total_correct FROM leaderboard_m2 WHERE user_id = ?",
    )
    .bind(userSub)
    .first<{
      user_id: string;
      nickname: string;
      hospital_tier: number;
      reputation: number;
      doctor_count: number;
      total_study_min: number;
      is_public: number;
      updated_at: number;
      badges_csv: string | null;
      subject_mastery_count: number | null;
      total_correct: number | null;
    }>();

  if (!row) {
    return jsonResponse({ row: null }, 200, headers);
  }

  return jsonResponse(
    {
      row: {
        user_id: row.user_id,
        nickname: row.nickname,
        hospital_tier: row.hospital_tier,
        reputation: row.reputation,
        doctor_count: row.doctor_count,
        total_study_min: row.total_study_min,
        is_public: row.is_public === 1,
        updated_at: row.updated_at,
        badges_csv: row.badges_csv ?? "",
        subject_mastery_count: row.subject_mastery_count ?? 0,
        total_correct: row.total_correct ?? 0,
      },
    },
    200,
    headers,
  );
}

async function handleMyRank(
  rawFilter: string,
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Exact-rank lookup for opted-in players who fall outside the top-100 KV
  // snapshot. Without this, the client's my-rank chip rendered nothing once
  // other players pushed the user past #100 — prod reports read as "我的
  // 排名不見了". This is the Phase 4 Worker follow-up that closes that gap.
  //
  // JWT-gated (same pattern as handleGetMe) — rank is derived from the
  // requester's OWN row, so the verified `sub` claim is the only identity
  // input; the URL never carries a user id.
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  if (!(FILTERS as readonly string[]).includes(rawFilter)) {
    return jsonResponse({ error: "unknown_filter" }, 400, headers);
  }
  const filter = rawFilter as Filter;

  try {
    const [me, totalRow] = await Promise.all([
      env.LEADERBOARD_DB
        .prepare(
          "SELECT hospital_tier, reputation, doctor_count, total_study_min, total_correct, is_public FROM leaderboard_m2 WHERE user_id = ?",
        )
        .bind(userSub)
        .first<MyRankAttrs & { is_public: number }>(),
      env.LEADERBOARD_DB
        .prepare("SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE is_public = 1")
        .first<{ c: number }>(),
    ]);

    const total = totalRow?.c ?? 0;

    // No row (never opted in) or is_public = 0 (opted out) → not on the
    // board. 200, not an error — the client renders a "hidden / not joined"
    // chip for this state.
    if (!me || me.is_public !== 1) {
      return jsonResponse(
        { in_leaderboard: false, rank: null, total },
        200,
        headers,
      );
    }

    // rank = rows that sort strictly before me (per this filter's ORDER BY,
    // replicated exactly by buildMyRankPredicate) + 1. Cheap even as the
    // table grows — the per-column partial indexes cover the COUNT.
    const { where, binds } = buildMyRankPredicate(filter, me);
    const aheadRow = await env.LEADERBOARD_DB
      .prepare(
        `SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE is_public = 1 AND (${where})`,
      )
      .bind(...binds)
      .first<{ c: number }>();

    const rank = (aheadRow?.c ?? 0) + 1;
    return jsonResponse({ in_leaderboard: true, rank, total, filter }, 200, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[leaderboard] my-rank failed", { user: userSub, filter, err: message });
    return jsonResponse({ error: "my_rank_failed" }, 500, headers);
  }
}

async function handleDeleteMe(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  // Hard delete — invoked from the existing delete-account flow. Frees up
  // the nickname for reuse (case-insensitive UNIQUE constraint).
  const result = await env.LEADERBOARD_DB
    .prepare("DELETE FROM leaderboard_m2 WHERE user_id = ?")
    .bind(userSub)
    .run();

  return jsonResponse(
    { ok: true, deleted: result.meta?.changes ?? 0 },
    200,
    headers,
  );
}

// === Scheduled cron ===

export async function runLeaderboardCron(env: Env): Promise<void> {
  // 5 D1 queries → 5 KV snapshots, all parallel. Each snapshot is the
  // top-100 rows for the corresponding filter; client GETs read these
  // directly. Partial indexes (WHERE is_public = 1) make these queries
  // cheap even as the table grows — index seek + LIMIT 100 ≈ < 5 ms each
  // at < 1k rows. Parallelising COUNT + 5 SELECTs cuts wall time ~3×.
  const buildQuery = (filter: Filter) =>
    `SELECT ${SNAPSHOT_COLUMNS}
     FROM leaderboard_m2
     WHERE is_public = 1
     ORDER BY ${ORDER_BY[filter]}
     LIMIT 100`;

  const [totalRow, ...queryResults] = await Promise.all([
    env.LEADERBOARD_DB
      .prepare("SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE is_public = 1")
      .first<{ c: number }>(),
    ...FILTERS.map((filter) =>
      env.LEADERBOARD_DB
        .prepare(buildQuery(filter))
        .all<LeaderboardRowInternal>(),
    ),
  ]);

  const totalCount = totalRow?.c ?? 0;
  const now = Date.now();

  await Promise.all(
    FILTERS.map((filter, i) => {
      const payload: SnapshotPayload = {
        rows: queryResults[i]?.results ?? [],
        last_updated_at: now,
        total_count: totalCount,
      };
      return env.LEADERBOARD_KV.put(snapshotKvKey(filter), JSON.stringify(payload));
    }),
  );

  // Single structured log line — easy to grep in Cloudflare Workers Logs
  // dashboard. If cron starts failing this line goes missing → owner notices
  // via UI "上次更新" timestamp drift.
  console.log("[leaderboard cron] computed snapshots", {
    total_count: totalCount,
    at: now,
  });
}
