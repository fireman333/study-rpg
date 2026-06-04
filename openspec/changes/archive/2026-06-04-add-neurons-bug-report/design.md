## Context

二階 (`medexam2-hospital-tw`) shipped the M4.5 in-app bug-report pipeline (proposal motivation in `proposal.md`); its architecture is captured in `docs/BUG_REPORTING.md`. The canonical data path is:

```
Player → [BugReportModal] → services/bug-report.ts → supabase.from('bug_reports').insert(...)
              ↓ AutoContext snapshot (route / Dexie counters / console-error ring buffer / sync diagnostics)
```

Constraints specific to this neurons port:

- The **二階 implementation files are NOT present in this worktree** (`apps/medexam2-hospital-tw/src/services/bug-report.ts` etc. were verified absent via grep). neurons must be (re)built from the `docs/BUG_REPORTING.md` description + the shared `@study-rpg/core` types, NOT by importing 二階 code.
- The shared Supabase `bug_reports` table (`supabase/migrations/0004`) has a closed `app` CHECK (`'medexam-tw' | 'medexam2-hospital-tw'`) and a medexam-flavored `category` CHECK. Both must be extended before neurons rows can INSERT.
- neurons already has the prerequisites: `lib/auth/{AuthContext,client}.ts` (Supabase auth) and a HelpMenu placeholder section (`HelpMenu.tsx:180`).
- A **parallel session owns `add-neurons-first-pull`** in the same working tree (uncommitted). first-pull bumps R2 `SCHEMA_VERSION` to 15 and edits maze/sync files; this change touches none of those.

## Goals / Non-Goals

**Goals:**
- A force-signed-in HelpMenu bug-report form for neurons with neurons-flavored categories.
- An inline 🐞 entry in `QuizModal` that attaches the current `question_id`.
- Auto-context snapshot built from neurons' own Dexie shape + a new console-error ring buffer + sync diagnostics, each field per-submit opt-out.
- Zero IndexedDB / R2 schema change — Supabase-only, so it cannot collide with first-pull or any in-flight schema bump.
- A single canonical category set across client UI, `@study-rpg/core` types, and the DB CHECK enum.

**Non-Goals:**
- No owner-facing triage dashboard / read pipeline (still dashboard SQL today, same as 二階; a future `/bug-reports` skill is out of scope).
- No editing/updating submitted reports (rows stay immutable, INSERT + SELECT only).
- No shared `_shared` bug-report runtime helper — per-app duplication is accepted (per `docs/BUG_REPORTING.md`, lift only if a 4th writer appears).
- No change to the generic `bug-reporting` capability spec or medexam behavior.

## Decisions

### D1 — New independent `neurons-bug-report` capability, not a modification of `bug-reporting`

neurons keeps an independent capability spec (same precedent as `neurons-achievements` vs the 二階 `achievement-system`). The generic `bug-reporting` spec stays medexam-scoped. **Why:** the neurons category enum, Dexie snapshot shape, and inline-quiz target mapping all differ; widening the shared spec to cover three apps would entangle medexam and neurons requirements with no benefit. Alternative (modify `bug-reporting` to be multi-app) rejected — more coupling, harder to reason about per-app behavior.

### D2 — Extend the shared `bug_reports` table, do NOT create a `bug_reports_neurons` table

Migration `0017` adds `'neurons-tw'` to the `app` CHECK and unions the neurons categories into the `category` CHECK. **Why:** the owner triages all apps from one table; RLS (`auth.uid() = user_id`), indexes, and the `sync_metadata` column (`0010`) are reused as-is. The `app` column is the discriminator (client-set literal, not user-controllable). Alternative (separate neurons table) rejected — fragments triage, duplicates RLS/indexes, needs a new read path.

### D3 — Category enum is canonical in three places, kept in lockstep

The 12 neurons categories live as a single source in `@study-rpg/core/src/lib/bug-report-types.ts` (used by the form UI for labels/emoji) and are mirrored verbatim in the `0017` `category` CHECK. **Why:** `coding_principles` §6 (schema canonical form) — a mismatch between UI value and DB CHECK silently rejects the INSERT (Postgres 23514). The migration's CHECK list and the TS const MUST be byte-identical kebab-case. Severities reuse the existing 4 unchanged.

### D4 — Inline QuizModal 🐞 maps a small target picker → category + `question_id`

Mirror 二階's `0007` pattern: the inline sheet offers a few target radios (e.g.「題目內容錯誤」/「答案或詳解有誤」/「圖片問題」/「其他」) that map to neurons categories (`numbers-wrong` / `corpus` / `visual-glitch` / `other`) and always stamp `question_id` (the `0007` column already exists on the table). **Why:** question-scoped reports are the highest-signal corpus feedback; reusing the existing `question_id` column means no extra migration for the inline path. Alternative (free-form only) rejected — loses the structured question linkage.

### D5 — Snapshot is per-app, built from neurons Dexie; console buffer is net-new

`services/bug-report.ts` reads neurons' own Dexie (`lib/db.ts`) for the `game_state` snapshot (variant counts / mastery / maze meta / streak — final field set chosen at apply time to be compact and PII-free). `services/console-error-buffer.ts` is a fresh module installing `window.error` + `unhandledrejection` listeners into a size-5 ring (neurons has no equivalent today). `sync_metadata` reuses the engine's existing diagnostic getter if exposed; otherwise assembled from `globalThis.__sync?.getStatus?.()`-equivalent fields. **Why:** per-app split is the documented pattern; a shared helper would couple Dexie shapes across apps.

### D6 — Force sign-in, no anonymous path

The modal renders a sign-in CTA when `useAuth().user` is null (mirror 二階). **Why:** RLS requires `auth.uid()`; anonymous submits cannot satisfy the INSERT policy, and tying reports to a user enables optional follow-up.

## Risks / Trade-offs

- **CHECK constraint drift between TS const and migration** → Mitigation: D3 single-source discipline; a one-line note in the migration header pointing at `bug-report-types.ts`; manual cross-check in the apply task before owner runs `0017`.
- **Migration not applied before client ships** → INSERTs fail with 23514 for `app='neurons-tw'`. Mitigation: migration is an explicit owner task gated in tasks.md; until applied, the form surfaces the Supabase error (no silent swallow per `coding_principles` §5). Client can ship behind the existing HelpMenu placeholder until owner confirms `0017` applied.
- **PII in `game_state` / console errors** → Mitigation: snapshot is opt-out per field; keep `game_state` to numeric counters + enum states only (no free text); console buffer stores message + stack only. Document the captured fields in the modal's disclosure text.
- **Shared working tree with first-pull (uncommitted)** → accidental cross-commit. Mitigation: explicit per-file `git add` + `git diff --cached --name-status` gate at commit (per `multi_agent_git_safety`); this change's files (new services/components + HelpMenu + QuizModal + core types + migration `0017` + openspec change dir) are disjoint from first-pull's (maze/sync/first-pull service).

## Migration Plan

1. Ship client code + `@study-rpg/core` type extension + migration file `0017` (not yet applied).
2. Owner applies `0017` via Supabase dashboard SQL Editor (additive CHECK extension — no data migration, instant).
3. Sanity: signed-in neurons user submits one report from HelpMenu + one inline from QuizModal → confirm rows land with `app='neurons-tw'` + correct `category` + `question_id` (inline) via dashboard SQL.
4. Rollback: the CHECK extension is additive and harmless; if the client must be pulled, revert the HelpMenu section to the GitHub-Issues placeholder. The `0017` extension can stay applied (no medexam impact).

## Open Questions

- Exact compact field set for the `game_state` snapshot (resolved at apply time from neurons `db.ts`; keep PII-free + numeric/enum only).
- Whether `sync_metadata` is read from an existing engine getter or assembled ad-hoc (apply-time, depends on what `lib/sync/engine.ts` exposes).
