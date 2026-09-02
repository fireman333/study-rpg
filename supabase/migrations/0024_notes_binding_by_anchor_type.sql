-- 0024 — content bindings become conditional on anchor type
--
-- OpenSpec change: study-rpg-2nd `generalize-community-notes-anchor` (design D1, D5).
--
-- `source_fingerprint` / `content_hash` exist so a CLIENT can hide a note whose anchored
-- content has changed underneath it. That is right for questions, which are frozen exam
-- items: a fingerprint that moves means the question genuinely changed. It is wrong for
-- handouts, whose prose the content pipeline regenerates as a matter of routine — the same
-- rule would withhold every note on a chapter at each rebuild, with no signal to the reader
-- and nothing the author could do about it.
--
-- So the two columns become required for `question` and forbidden for `handout`, enforced
-- here rather than by convention. Absence is NULL, never a sentinel: a sentinel is a real
-- string, so a comparison that forgot to branch on anchor type would type-check, compare
-- unequal, and silently withhold notes. NULL admits a client typing that rejects the
-- comparison outright.
--
-- This migration does NOT open handout notes. `notes_insert_own` keeps its
-- `anchor_type = 'question'` literal; that is the feature switch and it ships with the
-- surface that displays and moderates what it admits.
--
-- ── ORDERING IS LOAD-BEARING ────────────────────────────────────────────────
-- The CHECK is added BEFORE the NOT NULLs are dropped, not after. Dropping first would
-- leave a window in which an ordinary authenticated client could write a `question` row
-- with null bindings — `notes_insert_own` checks neither column and `GRANT INSERT` covers
-- both — and that row would then make VALIDATE fail against real data. Adding the CHECK
-- while NOT NULL still stands is compatible; the handout branch is merely unsatisfiable
-- until the columns become nullable.
--
-- The whole thing runs in ONE transaction, which closes the window completely rather than
-- merely making it small. The usual reason to split VALIDATE into its own transaction is to
-- avoid holding ACCESS EXCLUSIVE during a long scan; this table holds 2 rows, so that
-- concern does not apply here and atomicity is worth more.
--
-- Applied OUT OF BAND (`supabase db query -f`), like 0020–0023.
-- ⚠️ `supabase db push` MUST NOT be run: migration history stopped at 0019, so a push
-- replays 0021 (7 tables / 25 functions).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

BEGIN;

ALTER TABLE public.community_notes
  ADD CONSTRAINT community_notes_binding_by_anchor_type CHECK (
    (anchor_type = 'question'
       AND source_fingerprint IS NOT NULL
       AND content_hash       IS NOT NULL)
    OR
    (anchor_type = 'handout'
       AND source_fingerprint IS NULL
       AND content_hash       IS NULL)
  ) NOT VALID;

ALTER TABLE public.community_notes
  VALIDATE CONSTRAINT community_notes_binding_by_anchor_type;

ALTER TABLE public.community_notes
  ALTER COLUMN source_fingerprint DROP NOT NULL,
  ALTER COLUMN content_hash       DROP NOT NULL;

COMMENT ON CONSTRAINT community_notes_binding_by_anchor_type ON public.community_notes IS
  'Content bindings are required for a question anchor and forbidden for a handout anchor. '
  'NULL means "this anchor type has no comparable content", not "unknown" — handout prose is '
  'regenerated routinely, so comparing its hash would withhold a whole chapter at each rebuild.';

COMMIT;
