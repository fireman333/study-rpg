/**
 * Nightly reclamation of abandoned note-image uploads (change
 * `sweep-abandoned-note-image-uploads`, study-rpg-2nd; migration 0032).
 *
 * `community_note_images_claim_expired` shipped in 0029 and never ran, because 0030 took the
 * service_role key out of this Worker and nothing else could reach it. Every abandoned upload has
 * been retained since. This is the caller it was written for.
 *
 * **Rotating, stopping or manually running this: `NOTE_IMAGE_SWEEPER_RUNBOOK.md`, next to this
 * file.** It also records which dashboard button is the wrong one.
 *
 * **The credential here is NOT a service_role key, and that is the point.** 0030's opening says a
 * service key "bypasses RLS on the entire project"; 0001 leaves eight player tables guarded by RLS
 * alone, so such a key reads and writes every player's save. 0032 creates `note_image_sweeper`
 * holding EXECUTE on two functions and no privilege on any table.
 *
 * **Why a direct connection rather than PostgREST.** PostgREST takes its role from a JWT, and this
 * project rotated to asymmetric ECC (P-256) signing keys two months ago — the legacy HS256 shared
 * secret survives only to verify tokens that have not yet expired, and the dashboard says to revoke
 * it once they have. A minted HS256 token would work today and stop working the day that key is
 * revoked, with nothing recording the connection. So the sweeper is a `LOGIN` role reached through
 * the pooler instead: no dependency on a signing scheme that is on its way out.
 *
 * **Two phases, and the order is the invariant.**
 *
 *   1. `claim_expired` deletes rows and writes a tombstone for each, in one transaction, then
 *      returns those identities plus any tombstone an earlier run left unconfirmed.
 *   2. We delete the bytes.
 *   3. `confirm_reclaimed` drops the tombstones — **only for identities whose delete succeeded.**
 *
 * ⚠️ Step 3 must never run ahead of step 2. The database cannot check it: whether an object still
 * exists in R2 is not observable from Postgres, so confirming an identity whose bytes remain
 * forgets those bytes permanently. An interrupted run is safe precisely because the tombstone
 * outlives it — bytes may be deleted twice, which R2 treats as a no-op, but a record is released
 * only after its bytes are gone.
 */

import postgres from "postgres";
import { noteImageKey } from "./note-images";
import type { Env } from "./index";

/**
 * How much one nightly run may reclaim.
 *
 * The account is on **Workers Paid**, confirmed 2026-07-31 against the plan comparison: 10,000
 * subrequests per invocation, 5 minutes of CPU, 250 cron triggers. So the platform is not what
 * bounds this run — 500 objects costs ~540 subrequests, about 5% of the ceiling.
 *
 * **The cap is therefore ours, and it is about blast radius rather than quota.** A sweep that can
 * delete 10,000 objects in one unattended pass is a worse thing to be wrong about than one that
 * takes a second night to finish. Real accumulation is a handful of abandoned uploads a week, so
 * 500 is already far beyond any plausible backlog.
 *
 * ⚠️ On the FREE plan the subrequest ceiling is 50, which these numbers would blow in the first
 * batch. If this Worker is ever moved to a free account, recompute rather than assume.
 */
const SUBREQUEST_CEILING = 10_000;
/** Objects per batch — one `claim`, then this many R2 deletes, then one `confirm`. */
const BATCH = 25;
/** Batches per run. 20 × 25 = 500 objects, 20 × 27 = 540 subrequests. */
const MAX_BATCHES = 20;

// A guard rather than a computation: if someone raises BATCH or MAX_BATCHES without checking, this
// is where it fails loudly instead of halfway through a run.
const PER_BATCH_SUBREQUESTS = BATCH + 2;
if (MAX_BATCHES * PER_BATCH_SUBREQUESTS > SUBREQUEST_CEILING) {
  throw new Error(
    `note-image-sweep: ${MAX_BATCHES} batches x ${PER_BATCH_SUBREQUESTS} exceeds the ` +
      `${SUBREQUEST_CEILING} subrequest ceiling`,
  );
}

/**
 * A ceiling on the whole run, enforced here rather than trusted to the driver.
 *
 * ⚠️ postgres.js's own `connect_timeout` did NOT fire against a connection that never established:
 * an invocation sat past 120s with nothing logged. A cron that can hang is worse than one that
 * fails, because it produces no evidence either way — so this races every run and reports the phase
 * it was in when the clock ran out.
 *
 * Explained (2026-08-01): each TLS-rejected attempt closes its socket within ~300 ms, and the cf
 * build's `closed()` cancels the connect timer and — with the startup query still pending —
 * silently calls `reconnect()` (postgres/cf/src/connection.js:447,452). The 10 s timer is re-armed
 * per attempt and never elapses within one, so the driver retries forever and rejects nothing.
 * This deadline stays even with the Hyperdrive transport: it is the only guard postgres.js itself
 * does not provide.
 */
const RUN_DEADLINE_MS = 45_000;

/** Deadlock victim. Postgres aborts one side of a cycle; retrying is the documented response. */
const SQLSTATE_DEADLOCK = "40P01";
/** Our own `SET LOCAL lock_timeout` firing — a clean end of run, not a failure. */
const SQLSTATE_LOCK_TIMEOUT = "55P03";
const DEADLOCK_RETRIES = 2;

export interface SweepTally {
  batches: number;
  claimed: number;
  deleted: number;
  deleteFailures: number;
  confirmed: number;
  stopped: string;
}

/**
 * The two calls this cron is allowed to make, and nothing else. Narrow on purpose: it is the seam
 * the tests drive, and it keeps the transport swappable without the reclamation logic noticing.
 */
export interface SweepDb {
  claim(limit: number): Promise<string[]>;
  confirm(ids: string[]): Promise<number>;
  close(): Promise<void>;
}

export class SweepConfigError extends Error {}

function sqlstateOf(err: unknown): string {
  return typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
    ? (err as { code: string }).code
    : "";
}

/**
 * Which connection string the sweep uses, and why the order matters.
 *
 * The Hyperdrive binding wins whenever it exists, because the direct secret CANNOT work from a
 * Worker: Supavisor presents a certificate chained to the private "Supabase Root 2021 CA", and
 * workerd's `startTls()` validates against public WebPKI roots with no API to add a CA or relax
 * verification (`connect()` takes only `secureTransport`/`allowHalfOpen`; postgres.js's
 * `rejectUnauthorized: false` is silently ignored by its cf polyfill). The handshake is aborted
 * ~1 RTT after the upgrade — verified 2026-08-01 with a raw `cloudflare:sockets` probe from both
 * remote and local workerd against ports 6543 AND 5432, while the identical STARTTLS upgrade to a
 * public-CA endpoint succeeded, and openssl from the same egress IP completed the handshake. So:
 * platform rejects the cert; no driver option can change that; Hyperdrive (which always speaks TLS
 * to the origin and holds the CA question on Cloudflare's side) is the supported transport.
 *
 * The direct secret is kept as fallback so nothing regresses while the binding does not exist yet,
 * and so a future platform fix could be tested by simply removing the binding.
 */
export function sweepConnectionString(env: Env): { url: string; viaHyperdrive: boolean } {
  const viaHyperdrive = env.NOTE_IMAGE_SWEEPER_HYPERDRIVE?.connectionString;
  if (viaHyperdrive) return { url: viaHyperdrive, viaHyperdrive: true };
  const direct = env.NOTE_IMAGE_SWEEPER_DATABASE_URL;
  if (!direct) {
    throw new SweepConfigError(
      "neither NOTE_IMAGE_SWEEPER_HYPERDRIVE nor NOTE_IMAGE_SWEEPER_DATABASE_URL is set; " +
        "the sweep is unreachable",
    );
  }
  return { url: direct, viaHyperdrive: false };
}

/**
 * A pooled connection as `note_image_sweeper`. One binding (or secret) carries role, password,
 * host and port, so nothing here has to know the pooler's region.
 *
 * `prepare: false` is required, not stylistic: the direct connection string points at Supavisor in
 * transaction mode, where a named prepared statement does not survive to its own execution. It is
 * harmless via Hyperdrive, so it stays unconditional.
 */
export function openSweepDb(env: Env): SweepDb {
  const { url, viaHyperdrive } = sweepConnectionString(env);

  // `ssl: 'require'` is set here rather than left to `?sslmode=` in the secret, because postgres.js
  // defaults `ssl` to false and the pooler expects TLS — a default that would otherwise depend on
  // whoever pasted the connection string remembering a query parameter.
  //
  // Via Hyperdrive the option is OMITTED, and that is not a weakening: the connectionString points
  // at Hyperdrive's in-infrastructure endpoint (unreachable from the internet), and Hyperdrive
  // itself always uses TLS to the origin database — it does not support plaintext origin
  // connections at all. Sending SSLRequest on the internal hop would only break the handshake.
  const sql = postgres(url, {
    prepare: false,
    ...(viaHyperdrive ? {} : { ssl: "require" as const }),
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return {
    async claim(limit: number): Promise<string[]> {
      const rows = await sql<{ id: string }[]>`
        SELECT t.id FROM public.community_note_images_claim_expired(${limit}) AS t(id)
      `;
      return rows.map(r => r.id);
    },
    async confirm(ids: string[]): Promise<number> {
      const rows = await sql<{ removed: number }[]>`
        SELECT public.community_note_images_confirm_reclaimed(${ids}::uuid[]) AS removed
      `;
      return rows[0]?.removed ?? 0;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}

class SweepDeadlineError extends Error {}

/** Rejects after `ms`. The handle is returned so the timer can be cleared — an armed timer would
 *  otherwise keep the invocation alive after the work is already done. */
function deadline(ms: number): { promise: Promise<never>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new SweepDeadlineError(`run exceeded ${ms}ms`)), ms);
  });
  return { promise, cancel: () => clearTimeout(handle) };
}

async function claimWithRetry(db: SweepDb, limit: number): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.claim(limit);
    } catch (err) {
      if (sqlstateOf(err) !== SQLSTATE_DEADLOCK || attempt >= DEADLOCK_RETRIES) throw err;
      // The submission that won the cycle has committed by now; a short pause is enough.
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

/**
 * Reclaim what is due. Returns a tally; never throws for an ordinary failure, because a cron that
 * throws tells the log less than one that reports what it managed.
 *
 * `openDb` is injectable so the tests can drive the two calls without standing up Postgres.
 */
export async function runNoteImageSweepCron(
  env: Env,
  openDb: (env: Env) => SweepDb = openSweepDb,
): Promise<SweepTally> {
  const tally: SweepTally = {
    batches: 0,
    claimed: 0,
    deleted: 0,
    deleteFailures: 0,
    confirmed: 0,
    stopped: "drained",
  };

  // Named so a run that dies without reaching any other log still says where it was.
  let phase = "opening";

  let db: SweepDb;
  try {
    db = openDb(env);
  } catch (err) {
    tally.stopped = "error";
    console.error("[note-image-sweep] run aborted", { phase, err: String(err), ...tally });
    return tally;
  }

  const limit = deadline(RUN_DEADLINE_MS);
  try {
    await Promise.race([limit.promise, (async (): Promise<void> => {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      phase = `claim#${batch + 1}`;
      let ids: string[];
      try {
        ids = await claimWithRetry(db, BATCH);
      } catch (err) {
        if (sqlstateOf(err) === SQLSTATE_LOCK_TIMEOUT) {
          // Someone holds a lock we would have waited behind. The candidates keep.
          tally.stopped = "lock-timeout";
          break;
        }
        throw err;
      }

      tally.batches += 1;
      tally.claimed += ids.length;
      if (ids.length === 0) break;

      // Deleted one at a time so a single failure costs one object rather than the batch. An id
      // whose delete fails is NOT confirmed, so its tombstone survives and the next run retries it.
      phase = `delete#${batch + 1}`;
      const deletedIds: string[] = [];
      for (const id of ids) {
        try {
          await env.R2_PRIMARY.delete(noteImageKey(id));
          deletedIds.push(id);
          tally.deleted += 1;
        } catch (err) {
          tally.deleteFailures += 1;
          console.error("[note-image-sweep] r2 delete failed; tombstone kept for retry", {
            imageId: id,
            err: String(err),
          });
        }
      }

      if (deletedIds.length > 0) {
        phase = `confirm#${batch + 1}`;
        tally.confirmed += await db.confirm(deletedIds);
      }

      // A short batch means the queue is empty; anything else is a full batch and there may be more.
      if (ids.length < BATCH) break;
      if (batch === MAX_BATCHES - 1) tally.stopped = "budget";
    }
    })()]);
  } catch (err) {
    const timedOut = err instanceof SweepDeadlineError;
    tally.stopped = timedOut ? "deadline" : "error";
    console.error("[note-image-sweep] run aborted", {
      phase,
      err: sqlstateOf(err) ? `${sqlstateOf(err)} ${String(err)}` : String(err),
      ...tally,
    });
    return tally;
  } finally {
    limit.cancel();
    // Returning the connection matters more than reporting a failure to return it. Raced against
    // its own deadline: a connection that never established will not close either, and waiting on
    // that would reintroduce exactly the hang this run just escaped.
    const closing = deadline(5_000);
    await Promise.race([db.close(), closing.promise]).catch(err => {
      console.error("[note-image-sweep] closing the connection failed", { err: String(err) });
    });
    closing.cancel();
  }

  // Emitted for every run, including one that reclaimed nothing: a sweep that has silently stopped
  // and a sweep with nothing to do are otherwise the same absence.
  console.log("[note-image-sweep] run complete", tally);
  return tally;
}
