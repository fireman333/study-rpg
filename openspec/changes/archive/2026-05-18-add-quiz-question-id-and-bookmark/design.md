## Context

二階 (`apps/medexam2-hospital-tw`) `QuizModal` currently renders only the stem, options, correctness feedback and explanation. Player dogfood produced two needs:

1. **Identifiability** — after a wrong answer there is no way to reference the question outside the app. Players want to copy "106-2-醫學三-內科-Q10" and paste into Threads / Slack / discussion with peers.
2. **Curated review list** — players want to star questions they want to revisit (tricky differentials, often-missed pitfalls, items they plan to expand into RemNote later). They explicitly prefer offline note-taking in their own editor over in-app rich-text.

Cloud-sync (M4) is already shipped with a DI'd engine, LWW Postgres RPC, opt-in Google OAuth, and 8 mirrored tables. The hospital app exposes a `HOSPITAL_ADAPTERS` array consumed by `useSync.ts`. The pattern for adding a 9th mirrored table is well-trodden (`hospital_question_history` was the most recent addition).

`add-medexam2-question-images` change is mid-flight in a parallel worktree (`~/coding-scratch/study-rpg-m2-images/`) and modifies the same `QuizModal.tsx`. This change therefore stops at **propose only**; apply is deferred to a future session after the image change merges into `track-m2`.

## Goals / Non-Goals

**Goals:**

- Show every question's identifier inside `QuizModal` so players can copy it verbatim.
- Let players ⭐ / un-⭐ any question with a single click during a quiz.
- Provide `/bookmarks` page that shows enough content per bookmark that the user can read the question + answer + explanation without leaving the page or re-opening the quiz UI.
- Persist bookmarks locally first (IDB), mirror to Supabase opt-in via existing M4 engine (no new auth surface, no new modals).
- Provide a "download bookmarks as Markdown" path so users can edit notes in their own editor (Obsidian / VS Code / RemNote).
- Stay additive — no destructive DB migrations, no breaking API change to engine.

**Non-Goals:**

- ❌ In-app note editing on bookmarks (replaced by offline export workflow).
- ❌ Tags / categories / folders on bookmarks (defer; if needed, follow-up change).
- ❌ A quiz-mode filter like "only-bookmarks practice" (changes QuizRunner logic; out of scope).
- ❌ Bookmark stats on dashboard (e.g. "you have 23 bookmarks") (defer).
- ❌ Bookmark sync for 一階 (`medexam-tw`) (different DB / different content pack — if wanted later, a sibling change ports the pattern).
- ❌ Apply / verify / archive in this session — propose only.

## Decisions

### 1. Question ID format → **raw `question.id` verbatim**

**Pick**: A — display the original string `106-2-醫學三-內科-Q10` exactly as it appears in `question.id`.

**Rationale**:

- Copy-pasteable in one click — players can drop it into Threads / discussion without re-formatting.
- Developer-friendly — same string used in logs, RemNote, peer chat, and bug reports collapses to one canonical identifier.
- Zero formatting helper required, zero locale / pluralization edge cases (no "第 X 題" wrapping).
- Trade-off: slightly less readable than "106 年第 2 次 醫學三 內科 第 10 題". User explicitly preferred the raw form.

**Alternative considered**: format-on-display (B) and hybrid format+hover-to-copy (C) were both rejected because the raw string is already short (~20 chars) and bilingual readers tolerate the dash-separated form fine.

**Implementation**: pass `question.id` directly into a small `<span className="quiz-modal__question-meta-id">` — no helper, no transform.

### 2. Storage schema → **IDB-first, no `note` column, 4 fields total**

Final `BookmarkRow` shape (in `apps/medexam2-hospital-tw/src/db/schema.ts`):

```typescript
export interface BookmarkRow {
  questionId: string   // PK — same format as question.id (e.g. "106-2-醫學三-內科-Q10")
  addedAt: number      // Date.now() at first bookmark creation; stable across edits
  _updatedAt?: number  // stamped by sync engine hook; used for LWW
}
```

Dexie schema additive migration:

```typescript
// v7: question-bookmarks — single new store, additive.
this.version(7).stores({
  // ... all v6 stores unchanged
  bookmarks: '&questionId, addedAt',
})
```

**Rationale for no `note` column**:

- User decision: notes are written offline in user's preferred editor (Obsidian / VS Code) after exporting the bookmark list as Markdown.
- Avoids in-app textarea + character-cap + debounced auto-save complexity.
- Avoids growing the LWW conflict surface (notes mid-edit on two devices = lost typing).
- Avoids Supabase TEXT column growth (free-tier storage budget is the longest-pole constraint for M4 sync).

**Rationale for `addedAt` separate from `_updatedAt`**:

- `addedAt` is immutable display sort key (most recent bookmark on top of `/bookmarks`).
- `_updatedAt` is the LWW timestamp managed by the sync engine hook (`apps/medexam2-hospital-tw/src/lib/sync/engine.ts:85`). Without an `updatedAt` distinct from `addedAt`, an un-bookmark + re-bookmark cycle on device A would lose to a stale local row on device B.

### 3. Supabase schema → **new table + RPC update via additive migrations 0004 + 0005**

The handoff suggested filenames `0005` / `0006` but the actual `supabase/migrations/` directory currently contains only `0001` – `0003`, so the next slots are **0004 and 0005**.

**`supabase/migrations/0004_question_bookmarks.sql`** — table + RLS:

```sql
CREATE TABLE public.question_bookmarks (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT        NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX question_bookmarks_user_added_idx
  ON public.question_bookmarks(user_id, added_at DESC);

ALTER TABLE public.question_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_select_own" ON public.question_bookmarks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bookmarks_insert_own" ON public.question_bookmarks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookmarks_update_own" ON public.question_bookmarks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookmarks_delete_own" ON public.question_bookmarks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

**Rationale for no `note` column on Postgres side either**: mirrors the IDB schema decision; keeps the table append-mostly (cheap free-tier storage).

**`supabase/migrations/0005_upsert_lww_bookmarks.sql`** — extend the RPC:

```sql
-- CREATE OR REPLACE FUNCTION public.upsert_lww(...)
-- Re-runs the whole body from 0003, with two diffs:
--   1. Whitelist appends 'question_bookmarks'.
--   2. New ELSIF branch dispatches inserts.
CREATE OR REPLACE FUNCTION public.upsert_lww(table_name TEXT, rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid             UUID := auth.uid();
  written_count   INTEGER := 0;
  row_json        JSONB;
  row_updated_at  TIMESTAMPTZ;
  row_app_version TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'upsert_lww: not authenticated';
  END IF;

  IF table_name NOT IN (
    'player_state', 'srs_cards', 'item_instances', 'mentor_backlog',
    'hospital_state', 'hospital_doctors', 'hospital_mastery',
    'hospital_question_history', 'question_bookmarks'
  ) THEN
    RAISE EXCEPTION 'upsert_lww: unknown table %', table_name;
  END IF;

  FOR row_json IN SELECT * FROM jsonb_array_elements(rows) LOOP
    IF (row_json->>'user_id')::UUID <> uid THEN
      RAISE EXCEPTION 'upsert_lww: user_id mismatch';
    END IF;
    row_updated_at  := (row_json->>'updated_at')::TIMESTAMPTZ;
    row_app_version := row_json->>'app_version';

    -- ... (8 existing ELSIF branches verbatim from 0003) ...

    ELSIF table_name = 'question_bookmarks' THEN
      INSERT INTO public.question_bookmarks (
        user_id, question_id, added_at, updated_at, app_version
      )
      VALUES (
        uid,
        row_json->>'question_id',
        (row_json->>'added_at')::TIMESTAMPTZ,
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET added_at    = EXCLUDED.added_at,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.question_bookmarks.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;
    END IF;
  END LOOP;

  RETURN written_count;
END;
$$;
```

**Rationale for new file vs ALTER 0003**:

- Migration history stays append-only (git diff for archaeologists shows clear "RPC v2 = 0005").
- Reversible — if we ever need to roll back the bookmarks feature, `git revert` removes 0004 + 0005 cleanly; no in-place edit to undo.
- `CREATE OR REPLACE FUNCTION` is the canonical Postgres pattern for RPC versioning, idempotent on re-apply.
- Drawback: copies ~100 LOC of the 0003 body into 0005. Accepted — RPCs are small enough that duplication beats lossy ALTER.

### 4. Sync adapter → **9th member of `HOSPITAL_ADAPTERS`**

`BOOKMARK_ADAPTER` follows the same `TableAdapter` interface used by the other 8 cloud tables:

```typescript
// apps/medexam2-hospital-tw/src/lib/sync/tables.ts (append)
export const BOOKMARK_ADAPTER: TableAdapter = {
  postgresTable: 'question_bookmarks',
  shape: 'collection',
  dexieTable: 'bookmarks',
  snapshotDirty: async (db, dirtyPks, userId, updatedAt, appVersion) => {
    const rows = await (db as HospitalDB).bookmarks
      .where('questionId').anyOf([...dirtyPks]).toArray()
    return rows.map(r => ({
      user_id:     userId,
      question_id: r.questionId,
      added_at:    new Date(r.addedAt).toISOString(),
      updated_at:  updatedAt,
      app_version: appVersion,
    }))
  },
  snapshotAll: async (db, userId, updatedAt, appVersion) => {
    const rows = await (db as HospitalDB).bookmarks.toArray()
    return rows.map(r => ({
      user_id:     userId,
      question_id: r.questionId,
      added_at:    new Date(r.addedAt).toISOString(),
      updated_at:  updatedAt,
      app_version: appVersion,
    }))
  },
  applyToLocal: async (db, cloudRow, opts) => {
    const hdb = db as HospitalDB
    const local = await hdb.bookmarks.get(cloudRow.question_id as string)
    const localMs = local?._updatedAt
    if (!opts?.force && !cloudIsNewer(cloudRow.updated_at, localMs)) return false
    await hdb.bookmarks.put({
      questionId: cloudRow.question_id as string,
      addedAt:    Date.parse(cloudRow.added_at as string),
      _updatedAt: Date.parse(cloudRow.updated_at),
    })
    return true
  },
}

// Wire into useSync.ts HOSPITAL_ADAPTERS array
export const HOSPITAL_ADAPTERS = [
  HOSPITAL_STATE_ADAPTER,
  DOCTORS_ADAPTER,
  MASTERY_ADAPTER,
  QUESTION_HISTORY_ADAPTER,
  MONOTONIC_COUNTERS_ADAPTER,   // (existing v6 additions)
  TRAINING_HISTORY_ADAPTER,
  EVENT_LOG_ADAPTER,
  FATE_CARD_HISTORY_ADAPTER,
  RETIREMENT_LOG_ADAPTER,
  BOOKMARK_ADAPTER,             // ← new
]
```

**Pattern detail**: deletion of a bookmark is handled by writing a tombstone via `snapshotDirty` after marking the row dirty — but for the MVP we use the simpler "delete locally + immediately push the absence" approach used elsewhere (e.g., `affinity` rows). If sync race conditions emerge in dogfood we revisit with a `deletedAt` soft-delete column.

### 5. UI placement

**QuizModal** — minimal, single-row meta strip directly above the question stem:

```
+----------------------------------------------------------+
| 106-2-醫學三-內科-Q10                              ⭐    |
| 一位 65 歲男性, 糖尿病史 10 年, 來院主訴…              |
| (A) ...                                                  |
| (B) ...                                                  |
+----------------------------------------------------------+
```

- ID `<span>` uses `font-family: monospace, "Cubic 11"` for the dash-separated identifier feel.
- ⭐ button is a `<button>` with role=switch, `aria-pressed`, no label text (icon only). Filled glyph when bookmarked, outline glyph otherwise.
- Mobile: same row, ⭐ stays right-aligned, ID may truncate with `text-overflow: ellipsis`.

**`/bookmarks` page** — full-content list, no excerpt truncation:

```
+----------------------------------------------------------+
| 📚 收藏題目 (N)                       [⬇ 匯出 Markdown]   |
+----------------------------------------------------------+
| 106-2-醫學三-內科-Q10                                ⭐  |
| ────────────────────────────────────────────────         |
| 一位 65 歲男性…                                          |
| (A) ...                                                  |
| (B) ...                                                  |
| ✅ 正解：(B)                                              |
| 詳解：本題考的是…                                         |
|                                              [移除收藏]   |
+----------------------------------------------------------+
| 108-1-醫學四-外科-Q23                                ⭐  |
| ...                                                      |
+----------------------------------------------------------+
```

- Sort: `addedAt DESC` (most recent first).
- Lookup: bookmark row stores only `questionId`. Page hydrates each by `useQuestions().get(questionId)` against the loaded `questions.json`. Missing IDs (e.g., question removed from corpus in a future content rebuild) render an inline "題目已不在題庫" stub + a "移除收藏" button.
- Header nav: add a 📚 link to the hospital home page header alongside the existing nav items.
- Empty state copy: 「還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。」

**Markdown export format** (downloaded as `bookmarks-YYYY-MM-DD.md`):

```markdown
# 收藏題目 (5)
匯出時間：2026-05-18 10:42

---

## 106-2-醫學三-內科-Q10

一位 65 歲男性, 糖尿病史 10 年, 來院主訴…

- (A) ...
- (B) ...
- (C) ...
- (D) ...

**正解：** (B)

**詳解：** 本題考的是…

---

## 108-1-醫學四-外科-Q23
...
```

Uses `Blob` + `URL.createObjectURL` + an off-DOM `<a download>` click. No new dependency.

### 6. Merge order vs `add-medexam2-question-images`

This change and `add-medexam2-question-images` both edit `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`. Image change adds `<img>` element + fallback copy inside the stem area; this change adds a meta row **above** the stem and a ⭐ button.

**Strategy → A: image change ships first, then this change rebases on top.**

1. `add-medexam2-question-images` completes apply / verify / archive in its own worktree.
2. Merge into `track-m2`.
3. This worktree `git fetch && git rebase track-m2`.
4. Final `QuizModal` structure becomes:
   ```
   <quiz-modal__question-meta>          ← new (this change)
     {question.id}  <bookmark-toggle/>  ← new (this change)
   </quiz-modal__question-meta>
   <quiz-modal__stem>{stem}</quiz-modal__stem>
   {hasImage ? <img.../> : null}        ← from image change
   <quiz-modal__options>...</quiz-modal__options>
   ```
5. Apply this change's tasks in the rebased worktree.

**Rationale for image-first**:

- Image change has more invasive layout changes (image sizing, fallback paths, alt text). Stabilizing layout first reduces rebase risk on the simpler meta row.
- This change's UI surface is small (one row + one button) — easy to slot in after.
- Image change is closer to ready (per dogfood-fixes branch); blocking it on bookmarks would delay both.

### 7. Telemetry / observability

None added. Existing `eventLog` table already captures user interactions during quiz; bookmark toggles do not need separate telemetry for MVP. If dogfood shows misuse we can wire `logEvent('bookmark_toggled', { questionId, on })` in a follow-up.

## Risks / Trade-offs

- **Risk**: corpus rebuild renames `question.id` between releases → orphan bookmarks pointing to non-existent questions.
  - **Mitigation**: `BookmarksPage` renders an inline stub + remove button for missing IDs; never throws. Content pack contract already documents that IDs are stable (year+sitting+paper+subject+number); any future renumbering would be a deliberate breaking change requiring its own migration.
- **Risk**: un-bookmark + re-bookmark race on two devices loses the second action (LWW picks one).
  - **Mitigation**: rare enough in single-user dogfood; if it surfaces we add soft-delete (`deletedAt`) and treat re-add as `updatedAt` bump.
- **Risk**: Markdown export grows large if user bookmarks 1000+ questions.
  - **Mitigation**: dogfood ceiling is realistically <100. If hit, paginated export ("only this subject") is a one-knob follow-up.
- **Risk**: Adding 9th adapter widens cloud-sync push payload for users who never bookmark anything.
  - **Mitigation**: `snapshotAll` only emits rows that exist; empty `bookmarks` table sends zero rows. No payload cost for non-users.
- **Risk**: 0005 RPC migration copies 100 LOC from 0003 → schema drift if 0003 is later edited and 0005 isn't.
  - **Mitigation**: convention — any future change to `upsert_lww` always opens a new `0NNN_upsert_lww_*.sql`, never edits an existing one. Document in `docs/CLOUD_SYNC.md` migration section.
- **Trade-off**: No `note` field means power users who want fast inline annotation are forced into the export-edit-offline workflow. Accepted per user preference — they prefer their own editor.
- **Trade-off**: Bundling Feature 1 + Feature 2 means a single rollback removes both. Accepted — they share `QuizModal` and a single dogfood iteration is the right granularity.

## Migration Plan

1. **Pre-flight (separate session, not in this propose):** wait for `add-medexam2-question-images` to merge into `track-m2`.
2. **Rebase**: `cd ~/coding-scratch/study-rpg-m2-quiz-ux && git fetch origin && git rebase track-m2`.
3. **Schema migrations**:
   - Local Dexie auto-upgrades v6 → v7 on first hospital app load (additive store add). No data loss possible.
   - Supabase: apply `0004_question_bookmarks.sql` then `0005_upsert_lww_bookmarks.sql` via Supabase dashboard SQL editor (same way 0001–0003 were applied).
4. **Code**: follow `tasks.md` stages in order.
5. **Verify**: Chrome MCP smoke covering bookmark toggle, list view rendering, export download, full-tier sync round-trip (un-auth → auth → cross-device pull). See tasks.md Stage 6.
6. **Archive**: `/opsx:archive` only after all smoke green; commit template `spec(archive): merge add-quiz-question-id-and-bookmark — quiz UX 2 features`.
7. **Roll back**: if dogfood reveals fundamental issue, `git revert <merge-commit>` removes app code; manually drop `question_bookmarks` table + revert `upsert_lww` body by re-applying 0003. Dexie v7 store can stay (additive, harmless) or be pruned via a v8 noop store removal in a follow-up.

## Open Questions

- None blocking propose. Stage 0 in tasks.md picks up rebase logistics when the apply session opens.
