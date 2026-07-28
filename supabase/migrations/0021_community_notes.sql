-- =====================================================================
-- 0021_community_notes.sql
-- Community notes on questions — the project's first public UGC surface,
-- first cross-user SELECT, and first ongoing moderation obligation.
--
-- Implements §1 (tables/constraints), §2 (authorization) and §3 (triggers and
-- owner operations) of the `study-rpg-2nd` openspec change
-- `add-question-community-notes`. The spec that governs every clause here is
-- `openspec/specs/community-notes/spec.md` in that repo; the rationale for
-- each shape is its `design.md` decisions D1–D19, referenced inline below.
--
-- Apply by pasting into the Supabase dashboard SQL editor. There is no CI and
-- no down-migration: the rollback is the feature flag, seeded disabled below
-- (design D13/D15). Dropping tables that already hold player content is not a
-- rollback.
--
-- BEFORE APPLYING TO PRODUCTION: apply to a throwaway Supabase project first
-- and run `scripts/verify-community-rls.mjs` against it with an anon key and a
-- non-owner JWT. That script is the acceptance body for this migration, not an
-- optional extra — a `service_role` credential bypasses RLS and would pass
-- whether or not the boundary exists (design D12).
-- ---------------------------------------------------------------------
-- FIVE THINGS A LATER EDIT MUST NOT UNDO. Each was a live defect found by
-- review or by execution against PostgreSQL 17 on 2026-07-28.
--
--  1. `status` and `visibility` are SEPARATE COLUMNS (D1). PostgreSQL enforces
--     RLS `WITH CHECK` *after* `BEFORE` triggers fire, so a trigger-set
--     `status` is what the policy tests and every insert would reject itself.
--     Merging them back breaks inserts outright.
--  2. The reports `BEFORE INSERT` trigger takes the note row `FOR UPDATE`.
--     Without it three simultaneous reporters each count only themselves, the
--     concealment threshold never fires, and the note stays visible.
--  3. Every function is revoked from `anon`, `authenticated` and
--     `service_role` BY NAME. `REVOKE ... FROM PUBLIC` does not touch the
--     named grants Supabase's `ALTER DEFAULT PRIVILEGES` hands out — measured:
--     10 of 11 functions were reachable by `anon` before this was fixed.
--  4. A direct write to a moderation state RAISES. An earlier version coerced
--     it back to the old value, so an owner `UPDATE` reported success and
--     changed nothing — a silent-error violation the spec now tests for.
--  5. Table bounds are a real GFM parse, not a "line starts with |" heuristic,
--     which missed every table written without outer pipes.
-- =====================================================================

BEGIN;

-- =====================================================================
-- §1  TABLES AND CONSTRAINTS
-- =====================================================================

-- ── 1.2 feature flags ────────────────────────────────────────────────
-- Seeded disabled. This is the rollback (D13) and the off-ramp (D15).
CREATE TABLE IF NOT EXISTS public.community_flags (
  feature              TEXT PRIMARY KEY,
  public_read          BOOLEAN     NOT NULL DEFAULT FALSE,
  submissions_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.community_flags (feature, public_read, submissions_enabled)
VALUES ('community_notes', FALSE, FALSE)
ON CONFLICT (feature) DO NOTHING;

-- ── 1.3 community profiles (pseudonymous display names) ──────────────
-- The only thing ever shown next to a note. No account identifier, no
-- provider identity, no contact field. `nickname_visibility` is the owner's
-- concealment lever (D17) — there is no automatic path to 'concealed'.
CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname            TEXT        NOT NULL,
  nickname_visibility TEXT        NOT NULL DEFAULT 'visible'
                        CHECK (nickname_visibility IN ('visible', 'concealed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_profiles_nickname_len
    CHECK (char_length(nickname) BETWEEN 2 AND 24),
  CONSTRAINT community_profiles_nickname_clean
    CHECK (nickname = btrim(nickname) AND nickname !~ '[[:cntrl:]]')
);

-- Two players must not share one public attribution.
CREATE UNIQUE INDEX IF NOT EXISTS community_profiles_nickname_ci_uniq
  ON public.community_profiles (lower(nickname));

-- ── 1.4 notes ────────────────────────────────────────────────────────
-- status      = owner review state. Not client-writable at all.
-- retracted_at = the author's one-way withdrawal (D18).
-- visibility  = whether it reaches the public read model. Never client-written.
--
-- status and visibility are separate columns because PostgreSQL enforces RLS
-- WITH CHECK *after* BEFORE triggers fire, so a trigger-set status is what the
-- policy would test and every insert would reject itself. See design D1.
-- DO NOT MERGE THESE COLUMNS.
CREATE TABLE IF NOT EXISTS public.community_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SET NULL, not CASCADE: the note survives, the identity does not (D7).
  author_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- RESTRICT: a mistaken delete must be loud, not silently take a thread (D7).
  parent_id            UUID REFERENCES public.community_notes(id) ON DELETE RESTRICT,

  -- Domain admits 'handout' from day one so v2 changes a policy, not a
  -- constraint on a populated table. v1 writes are pinned to 'question' by
  -- the INSERT policy in 2.4.
  anchor_type          TEXT NOT NULL CHECK (anchor_type IN ('question', 'handout')),
  anchor_id            TEXT NOT NULL CHECK (char_length(anchor_id) BETWEEN 1 AND 128),

  -- Content bindings captured at submit time, never author-writable. Exposed
  -- on the public view so the client can filter stale notes (D16).
  source_fingerprint   TEXT NOT NULL CHECK (char_length(source_fingerprint) <= 128),
  content_hash         TEXT NOT NULL CHECK (char_length(content_hash) <= 128),

  body                 TEXT NOT NULL,

  -- The only pre-publication safeguard under post-moderation. The CHECK makes
  -- a row without it unrepresentable, not merely policy-rejected.
  license_ack          BOOLEAN NOT NULL DEFAULT FALSE
                         CONSTRAINT community_notes_license_ack CHECK (license_ack),

  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'reviewed')),
  retracted_at         TIMESTAMPTZ,
  visibility           TEXT NOT NULL DEFAULT 'withheld'
                         CHECK (visibility IN ('visible', 'withheld', 'quarantined',
                                               'retracted', 'removed')),

  current_revision_no  INT  NOT NULL DEFAULT 1 CHECK (current_revision_no >= 1),
  edit_count           INT  NOT NULL DEFAULT 0 CHECK (edit_count >= 0),

  takedown_reason      TEXT CHECK (takedown_reason IN
                         ('phi', 'third-party-copyright', 'abuse', 'other')),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at            TIMESTAMPTZ,

  CONSTRAINT community_notes_body_len CHECK (char_length(body) <= 2000),
  CONSTRAINT community_notes_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
  -- retraction and visibility cannot disagree
  CONSTRAINT community_notes_retraction_coherent
    CHECK ((retracted_at IS NULL) OR (visibility IN ('retracted', 'removed')))
);

-- ── 1.5 revisions (append-only audit trail) ──────────────────────────
-- So "what did this say when it was reported" is answerable and an author
-- cannot edit the evidence away (D3). RESTRICT: never removed implicitly.
CREATE TABLE IF NOT EXISTS public.community_note_revisions (
  note_id      UUID NOT NULL REFERENCES public.community_notes(id) ON DELETE RESTRICT,
  revision_no  INT  NOT NULL CHECK (revision_no >= 1),
  body         TEXT NOT NULL,
  editor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, revision_no)
);

-- ── 1.6 note reports ─────────────────────────────────────────────────
-- revision_no is stamped server-side (3.8). The composite FK is what makes
-- "this report belongs to this note" structural rather than checked in
-- application code (D4). CASCADE on reporter: a report is a claim by a
-- person; with the person gone the claim goes (D7).
CREATE TABLE IF NOT EXISTS public.community_note_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID NOT NULL,
  -- DEFAULT 0 only so the column may be omitted; the BEFORE INSERT trigger
  -- overwrites it before any constraint is evaluated. A client-supplied value
  -- is ignored, which is what the spec requires (not rejected).
  revision_no  INT  NOT NULL DEFAULT 0,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN (
                 'phi',                     -- conceals on the first report
                 'third-party-copyright',   -- conceals on the first report
                 'wrong-medical-content',
                 'abusive',
                 'spam',
                 'off-topic',
                 'other'
               )),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  FOREIGN KEY (note_id, revision_no)
    REFERENCES public.community_note_revisions(note_id, revision_no) ON DELETE RESTRICT
);

-- One unresolved report per reporter per revision, so one account cannot
-- cross the three-reporter threshold by itself (D4).
CREATE UNIQUE INDEX IF NOT EXISTS community_note_reports_open_uniq
  ON public.community_note_reports (note_id, revision_no, reporter_id)
  WHERE resolved_at IS NULL;

-- ── 1.7 owner review runs ────────────────────────────────────────────
-- The one number the owner cannot honestly self-report 30 days later (D15).
-- Written only as a side effect of opening the queue (3.13).
CREATE TABLE IF NOT EXISTS public.community_review_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  item_count  INT  NOT NULL CHECK (item_count >= 0)
);

-- ── 1.9 profile reports ──────────────────────────────────────────────
-- A display name is the least-protected public write path in this design —
-- no quota, no trust window, no revision — and it appears beside every note
-- its author wrote. nickname_snapshot is the evidence a note body's revision
-- history provides; it is stamped server-side (3.11). Filing a report NEVER
-- conceals: concealment is an owner act (D17).
CREATE TABLE IF NOT EXISTS public.community_profile_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname_snapshot TEXT NOT NULL DEFAULT '',
  reporter_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL CHECK (reason IN (
                      'phi', 'impersonation', 'abusive', 'spam', 'other')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS community_profile_reports_open_uniq
  ON public.community_profile_reports (profile_user_id, reporter_id)
  WHERE resolved_at IS NULL;

-- ── 1.8 indexes for the public read path and the owner queue ─────────
CREATE INDEX IF NOT EXISTS community_notes_public_read_idx
  ON public.community_notes (anchor_type, anchor_id, visibility, created_at, id);

CREATE INDEX IF NOT EXISTS community_note_reports_open_idx
  ON public.community_note_reports (note_id) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS community_profile_reports_open_idx
  ON public.community_profile_reports (profile_user_id) WHERE resolved_at IS NULL;

-- Supports the rolling-quota count and the lifetime trust-window count.
CREATE INDEX IF NOT EXISTS community_notes_author_created_idx
  ON public.community_notes (author_id, created_at DESC);

-- =====================================================================
-- §2  AUTHORIZATION
-- =====================================================================

-- ── 2.1 RLS on everything; no ambient privilege anywhere ─────────────
-- Deliberately unlike `bug-reporting`, whose anonymous SELECT returns zero
-- rows without error. Here direct base-table access must be PERMISSION
-- DENIED, because these tables hold other players' content — the boundary is
-- a withheld privilege, not a row filter (D9). A future "consistency" pass
-- that removes these REVOKEs is removing a protection.
ALTER TABLE public.community_flags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_revisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_profile_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_review_runs     ENABLE ROW LEVEL SECURITY;

-- service_role is revoked too, and that is the point: Supabase's default
-- privileges hand it ALL on every new table, so leaving it would let anything
-- holding the service key write these tables directly and bypass the closed
-- verb list in D19 entirely — most concretely, insert its own
-- `community_review_runs` row, which turns D15's "a review is recorded only by
-- opening the queue" from a database guarantee back into a convention.
-- The owner's operations are SECURITY DEFINER and run as the table owner, so
-- they are unaffected; so is the dashboard, which connects as `postgres`.
REVOKE ALL ON TABLE public.community_flags,
                    public.community_profiles,
                    public.community_notes,
                    public.community_note_revisions,
                    public.community_note_reports,
                    public.community_profile_reports,
                    public.community_review_runs
  FROM PUBLIC, anon, authenticated, service_role;

-- ── helper: is submission centrally enabled? ─────────────────────────
-- A function rather than a policy subquery so the INSERT policy does not
-- depend on the client role holding SELECT on the flags table.
CREATE OR REPLACE FUNCTION public.community_submissions_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT submissions_enabled FROM public.community_flags
      WHERE feature = 'community_notes'), FALSE);
$$;

-- ── 2.2 column-scoped INSERT ─────────────────────────────────────────
-- status, retracted_at, visibility, the counters and the timestamps are not
-- grantable: the client cannot even name them, so the column defaults apply
-- and the policy literal below is a second, independent lock.
GRANT INSERT (author_id, parent_id, anchor_type, anchor_id,
              source_fingerprint, content_hash, body, license_ack)
  ON public.community_notes TO authenticated;

-- ── 2.3 column-scoped UPDATE ─────────────────────────────────────────
-- The author may rewrite the body and may retract. Nothing else — not
-- status, not visibility, not the anchor, not the bindings, not created_at.
GRANT UPDATE (body, retracted_at) ON public.community_notes TO authenticated;

-- Author reads their own notes (2.5). author_id and license_ack are not in
-- the grant; a policy referencing author_id internally does not require the
-- caller to hold column privilege on it.
GRANT SELECT (id, parent_id, anchor_type, anchor_id, source_fingerprint,
              content_hash, body, status, retracted_at, visibility,
              current_revision_no, edit_count, takedown_reason,
              created_at, edited_at)
  ON public.community_notes TO authenticated;

-- ── 2.4 INSERT policy — the structural guarantee ─────────────────────
-- The `status = 'pending'` literal is load-bearing (D1): it is what stands
-- between a client and self-promotion. Do not relax it to permit a published
-- state and do not move it into a trigger. The `anchor_type` literal is what
-- keeps the reserved 'handout' value unwritable until v2.
CREATE POLICY notes_insert_own ON public.community_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND status = 'pending'
    AND anchor_type = 'question'
    AND license_ack = TRUE
    AND public.community_submissions_enabled()
  );

-- ── 2.5 SELECT policy — author sees own, regardless of visibility ────
-- The only client SELECT policy on the base table. Everyone else reads
-- through the view in 2.9.
CREATE POLICY notes_select_own ON public.community_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- ── 2.6 UPDATE policy — own rows only; triggers do the rest ──────────
CREATE POLICY notes_update_own ON public.community_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- No DELETE policy on any table: notes are never physically deleted.

-- ── 2.7 profiles (self only), reports (own only) ─────────────────────
GRANT SELECT (user_id, nickname, nickname_visibility, created_at)
  ON public.community_profiles TO authenticated;
GRANT INSERT (user_id, nickname) ON public.community_profiles TO authenticated;
GRANT UPDATE (nickname)          ON public.community_profiles TO authenticated;

CREATE POLICY profiles_select_own ON public.community_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY profiles_insert_own ON public.community_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_update_own ON public.community_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- revision_no is granted so a client-supplied value is *ignored* by the
-- trigger rather than rejected by the grant — the spec says ignored.
GRANT INSERT (note_id, revision_no, reporter_id, reason)
  ON public.community_note_reports TO authenticated;

CREATE POLICY reports_insert_own ON public.community_note_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- nickname_snapshot is NOT granted: it is evidence, stamped by 3.11.
GRANT INSERT (profile_user_id, reporter_id, reason)
  ON public.community_profile_reports TO authenticated;

CREATE POLICY profile_reports_insert_own ON public.community_profile_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- No SELECT policy on either report table: a reporter cannot read back even
-- their own report. Reports, reporter identities and report contents never
-- appear in any client read.

-- ── 2.8 flags readable; review runs and revisions reachable by nobody ─
GRANT SELECT ON public.community_flags TO anon, authenticated;
CREATE POLICY flags_read_all ON public.community_flags
  FOR SELECT TO anon, authenticated USING (TRUE);

-- community_note_revisions and community_review_runs: RLS enabled, zero
-- grants, zero policies. Unreachable by any client principal by construction.

-- ── 2.9 the public read model ────────────────────────────────────────
-- security_invoker = false (definer): the view runs as its owner, so the
-- REVOKEs above stay absolute for clients while the view still resolves.
-- "The public projection contains no account identifier" is a fact about this
-- column list, not a claim about every future policy edit (D9).
-- LEFT JOIN + fallback, never an inner join: an inner join would silently
-- unpublish a note the moment its author deleted their account.
-- source_fingerprint and content_hash are exposed on purpose: the client
-- compares them against the content pack it is rendering from (D16).
CREATE OR REPLACE VIEW public.community_notes_public
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  n.id,
  n.parent_id,
  n.anchor_type,
  n.anchor_id,
  n.source_fingerprint,
  n.content_hash,
  n.body,
  CASE
    WHEN p.nickname IS NULL                     THEN '匿名同學'
    WHEN p.nickname_visibility <> 'visible'     THEN '匿名同學'
    ELSE p.nickname
  END                               AS nickname,
  n.created_at,
  (n.edit_count > 0)                AS is_edited
FROM public.community_notes n
LEFT JOIN public.community_profiles p ON p.user_id = n.author_id
WHERE n.visibility = 'visible'
  AND EXISTS (
    SELECT 1 FROM public.community_flags f
     WHERE f.feature = 'community_notes' AND f.public_read
  );

GRANT SELECT ON public.community_notes_public TO anon, authenticated;

-- ── 2.11 the view inherits write privileges from ALTER DEFAULT ───────
-- PRIVILEGES too. It is not auto-updatable (it has a join), so writes would
-- error — but an ungranted privilege is better than a privilege that happens
-- to be unusable.
REVOKE INSERT, UPDATE, DELETE ON public.community_notes_public
  FROM PUBLIC, anon, authenticated, service_role;

-- =====================================================================
-- §3  TRIGGERS AND OWNER OPERATIONS
-- =====================================================================

-- ── moderation bypass marker ─────────────────────────────────────────
-- Set transaction-locally by the concealment trigger and by the owner
-- operations so their writes skip the author-facing guards — in particular so
-- a takedown does not snapshot the content it is redacting (3.10). Nothing
-- outside those functions sets it: PostgREST exposes no way for a client to
-- issue SET or reach pg_catalog.set_config.
CREATE OR REPLACE FUNCTION public.community_bypass_active()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('community.bypass', TRUE), 'off') = 'on';
$$;

-- ── body canonicalisation (3.4) ──────────────────────────────────────
-- Normalise CR/CRLF to LF, then strip C0/C1 and bidi format controls. LF and
-- TAB are preserved deliberately: markdown needs them.
CREATE OR REPLACE FUNCTION public.community_canonicalise_body(p_body TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_strip TEXT;
  v_out   TEXT;
BEGIN
  -- Built with chr() rather than escape sequences so the character set is
  -- unambiguous in a file that gets pasted through a browser SQL editor.
  -- C0 minus TAB (9) and LF (10); DEL; C1.
  SELECT string_agg(chr(c), '') INTO v_strip
    FROM generate_series(1, 31) AS c
   WHERE c NOT IN (9, 10);
  v_strip := v_strip || chr(127)
             || (SELECT string_agg(chr(c), '') FROM generate_series(128, 159) AS c);
  -- Bidi format controls: LRM RLM LRE RLE PDF LRO RLO, LRI RLI FSI PDI, BOM.
  v_strip := v_strip
             || chr(8206) || chr(8207)
             || chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238)
             || chr(8294) || chr(8295) || chr(8296) || chr(8297)
             || chr(65279);

  v_out := replace(p_body, chr(13) || chr(10), chr(10));   -- CRLF -> LF
  v_out := replace(v_out, chr(13), chr(10));               -- lone CR -> LF
  RETURN translate(v_out, v_strip, '');                    -- '' => delete
END;
$fn$;

-- ── GFM table parsing (3.4 / community-note-markdown) ────────────────
-- v1 used a "line starts with |" heuristic, which missed every table written
-- without outer pipes — GFM accepts those and this capability renders them.
-- chr(2) is a safe placeholder for an escaped pipe: canonicalisation has
-- already removed every C0 control from a body before these run.

CREATE OR REPLACE FUNCTION public.community_md_cell_count(p_line TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v TEXT;
BEGIN
  v := btrim(replace(COALESCE(p_line, ''), '\|', chr(2)));
  IF v = '' THEN RETURN 0; END IF;
  IF left(v, 1)  = '|' THEN v := substr(v, 2); END IF;
  IF right(v, 1) = '|' THEN v := left(v, length(v) - 1); END IF;
  RETURN COALESCE(array_length(string_to_array(v, '|'), 1), 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_md_has_pipe(p_line TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  SELECT position('|' IN replace(COALESCE(p_line, ''), '\|', chr(2))) > 0;
$fn$;

-- An alignment delimiter row: every cell is dashes with optional colons.
CREATE OR REPLACE FUNCTION public.community_md_is_delimiter(p_line TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v TEXT; v_cells TEXT[]; v_cell TEXT;
BEGIN
  IF NOT public.community_md_has_pipe(p_line) THEN
    RETURN FALSE;
  END IF;
  v := btrim(replace(p_line, '\|', chr(2)));
  IF left(v, 1)  = '|' THEN v := substr(v, 2); END IF;
  IF right(v, 1) = '|' THEN v := left(v, length(v) - 1); END IF;
  v_cells := string_to_array(v, '|');
  IF v_cells IS NULL OR array_length(v_cells, 1) IS NULL THEN
    RETURN FALSE;
  END IF;
  FOREACH v_cell IN ARRAY v_cells LOOP
    IF btrim(v_cell) !~ '^:?-+:?$' THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$fn$;

-- 20 rows and 8 columns per table. The header line counts as one of the 20
-- rows; the alignment delimiter does not (owner decision, 2026-07-28).
-- A line sequence GFM would not render as a table produces no table and is
-- therefore not bounded.
CREATE OR REPLACE FUNCTION public.community_table_bounds_ok(
  p_body TEXT, p_max_rows INT DEFAULT 20, p_max_cols INT DEFAULT 8)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_lines TEXT[];
  v_n     INT;
  i       INT := 1;
  j       INT;
  v_rows  INT;
  v_cols  INT;
  v_c     INT;
BEGIN
  v_lines := string_to_array(COALESCE(p_body, ''), chr(10));
  v_n := COALESCE(array_length(v_lines, 1), 0);

  WHILE i <= v_n LOOP
    IF i + 1 <= v_n
       AND public.community_md_has_pipe(v_lines[i])
       AND public.community_md_is_delimiter(v_lines[i + 1])
       AND NOT public.community_md_is_delimiter(v_lines[i]) THEN

      v_rows := 1;                                              -- the header
      v_cols := public.community_md_cell_count(v_lines[i]);
      v_c    := public.community_md_cell_count(v_lines[i + 1]);
      IF v_c > v_cols THEN v_cols := v_c; END IF;

      j := i + 2;
      WHILE j <= v_n
            AND btrim(v_lines[j]) <> ''
            AND public.community_md_has_pipe(v_lines[j]) LOOP
        v_rows := v_rows + 1;
        v_c := public.community_md_cell_count(v_lines[j]);
        IF v_c > v_cols THEN v_cols := v_c; END IF;
        j := j + 1;
      END LOOP;

      IF v_rows > p_max_rows OR v_cols > p_max_cols THEN
        RETURN FALSE;
      END IF;
      i := j;
    ELSE
      i := i + 1;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$fn$;

-- ── shared body validation ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_validate_body(p_body TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v TEXT;
BEGIN
  v := public.community_canonicalise_body(p_body);
  IF char_length(btrim(v)) = 0 THEN
    RAISE EXCEPTION 'community_notes: body is empty' USING ERRCODE = '23514';
  END IF;
  IF char_length(v) > 2000 THEN
    RAISE EXCEPTION 'community_notes: body exceeds 2000 characters'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.community_table_bounds_ok(v) THEN
    RAISE EXCEPTION 'community_notes: a table exceeds 20 rows or 8 columns'
      USING ERRCODE = '23514';
  END IF;
  RETURN v;
END;
$fn$;

-- ── 3.1–3.4  BEFORE INSERT on notes ──────────────────────────────────
-- One function, four sections: Postgres fires same-timing triggers in name
-- order, so four triggers would make correctness depend on naming, and the
-- advisory lock would be taken in a different trigger from the count it
-- protects. SECURITY DEFINER is required, not optional: `authenticated` holds
-- no SELECT on this table beyond its own rows, so the quota count and the
-- lifetime count would fail on privilege otherwise.
CREATE OR REPLACE FUNCTION public.community_notes_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_recent   INT;
  v_lifetime INT;
  v_parent   public.community_notes%ROWTYPE;
BEGIN
  IF NEW.author_id IS NULL THEN
    RAISE EXCEPTION 'community_notes: author_id is required' USING ERRCODE = '23502';
  END IF;

  -- 3.4 canonicalise and bound the body -------------------------------
  NEW.body := public.community_validate_body(NEW.body);

  -- 3.3 reply guards ---------------------------------------------------
  -- parent_id reaches PostgREST the moment the column exists, so the depth
  -- limit and anchor inheritance must exist with it, UI or no UI (D8).
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.community_notes
      WHERE id = NEW.parent_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'community_notes: parent not found' USING ERRCODE = '23503';
    END IF;
    IF v_parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'community_notes: replies to replies are not permitted'
        USING ERRCODE = '23514';
    END IF;
    -- assigned from the parent, never trusted from the client
    NEW.anchor_type        := v_parent.anchor_type;
    NEW.anchor_id          := v_parent.anchor_id;
    NEW.source_fingerprint := v_parent.source_fingerprint;
    NEW.content_hash       := v_parent.content_hash;
  END IF;

  -- 3.1 rolling 24 h quota, serialised per author ----------------------
  -- The lock is what makes count-then-insert atomic; a counting subquery in
  -- the policy would let two concurrent inserts both pass (D11).
  PERFORM pg_advisory_xact_lock(
    hashtext('community_notes:' || NEW.author_id::TEXT)::BIGINT);

  SELECT count(*) INTO v_recent FROM public.community_notes
    WHERE author_id = NEW.author_id
      AND created_at > now() - INTERVAL '24 hours';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'community_notes: 24-hour submission quota reached'
      USING ERRCODE = '53400';
  END IF;

  -- 3.2 visibility — and never status ----------------------------------
  -- Lifetime count, so retracting cannot reset the trust window.
  SELECT count(*) INTO v_lifetime FROM public.community_notes
    WHERE author_id = NEW.author_id;
  NEW.visibility := CASE WHEN v_lifetime < 3 THEN 'withheld' ELSE 'visible' END;
  -- Retreat to review-before-publish is this one line:
  --   NEW.visibility := 'withheld';
  -- No policy change, no client change, no data migration (D1).

  -- system-owned columns, whatever the client sent
  NEW.status              := 'pending';
  NEW.retracted_at        := NULL;
  NEW.current_revision_no := 1;
  NEW.edit_count          := 0;
  NEW.edited_at           := NULL;
  NEW.takedown_reason     := NULL;
  NEW.created_at          := now();

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER community_notes_before_insert
  BEFORE INSERT ON public.community_notes
  FOR EACH ROW EXECUTE FUNCTION public.community_notes_before_insert();

-- ── 3.5  AFTER INSERT on notes → revision 1 ──────────────────────────
CREATE OR REPLACE FUNCTION public.community_notes_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  INSERT INTO public.community_note_revisions (note_id, revision_no, body, editor_id)
  VALUES (NEW.id, 1, NEW.body, NEW.author_id);
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER community_notes_after_insert
  AFTER INSERT ON public.community_notes
  FOR EACH ROW EXECUTE FUNCTION public.community_notes_after_insert();

-- ── 3.6 / 3.7  BEFORE UPDATE on notes ────────────────────────────────
-- Body edits and author retraction, and nothing else. A write that is not one
-- of those two is REFUSED — v1 silently coerced it back to the old value, so
-- an owner UPDATE reported success and changed nothing (D19).
CREATE OR REPLACE FUNCTION public.community_notes_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_open_reports INT;
BEGIN
  -- Owner operations (§3.10, §3.12) and the concealment trigger set the
  -- bypass; their writes skip every author guard, including the revision
  -- snapshot, so a takedown does not capture what it is redacting.
  IF public.community_bypass_active() THEN
    RETURN NEW;
  END IF;

  -- Account deletion arrives HERE, as an UPDATE. `author_id` is ON DELETE SET NULL, and
  -- PostgreSQL implements that by updating this table — which the identity guard below
  -- rejects, so a player who had ever written a note could not delete their account at
  -- all. `delete_my_account()` (migration 0002) is a shipped, player-facing path, and
  -- the spec requires deletion to complete in the presence of notes. Dissociation is
  -- exactly what design D7 asks for, so permit that ONE transition with every other
  -- column pinned, ahead of the retracted/removed guards — a retracted note must be
  -- dissociable too. No client can reach it: `authenticated` holds UPDATE on
  -- (body, retracted_at) only, and cannot name `author_id` at all.
  IF OLD.author_id IS NOT NULL AND NEW.author_id IS NULL
     AND NEW.id                  IS NOT DISTINCT FROM OLD.id
     AND NEW.parent_id           IS NOT DISTINCT FROM OLD.parent_id
     AND NEW.anchor_type         IS NOT DISTINCT FROM OLD.anchor_type
     AND NEW.anchor_id           IS NOT DISTINCT FROM OLD.anchor_id
     AND NEW.source_fingerprint  IS NOT DISTINCT FROM OLD.source_fingerprint
     AND NEW.content_hash        IS NOT DISTINCT FROM OLD.content_hash
     AND NEW.body                IS NOT DISTINCT FROM OLD.body
     AND NEW.license_ack         IS NOT DISTINCT FROM OLD.license_ack
     AND NEW.status              IS NOT DISTINCT FROM OLD.status
     AND NEW.retracted_at        IS NOT DISTINCT FROM OLD.retracted_at
     AND NEW.visibility          IS NOT DISTINCT FROM OLD.visibility
     AND NEW.current_revision_no IS NOT DISTINCT FROM OLD.current_revision_no
     AND NEW.edit_count          IS NOT DISTINCT FROM OLD.edit_count
     AND NEW.takedown_reason     IS NOT DISTINCT FROM OLD.takedown_reason
     AND NEW.created_at          IS NOT DISTINCT FROM OLD.created_at
     AND NEW.edited_at           IS NOT DISTINCT FROM OLD.edited_at THEN
    RETURN NEW;
  END IF;

  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'community_notes: a retracted note is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.visibility = 'removed' THEN
    RAISE EXCEPTION 'community_notes: a removed note is immutable'
      USING ERRCODE = '23514';
  END IF;

  -- identity, anchor and binding drift (3.6) --------------------------
  IF NEW.id                 IS DISTINCT FROM OLD.id
  OR NEW.author_id          IS DISTINCT FROM OLD.author_id
  OR NEW.parent_id          IS DISTINCT FROM OLD.parent_id
  OR NEW.anchor_type        IS DISTINCT FROM OLD.anchor_type
  OR NEW.anchor_id          IS DISTINCT FROM OLD.anchor_id
  OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint
  OR NEW.content_hash       IS DISTINCT FROM OLD.content_hash
  OR NEW.license_ack        IS DISTINCT FROM OLD.license_ack
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community_notes: identity and bindings are immutable'
      USING ERRCODE = '23514';
  END IF;

  -- moderation state is owner-only, and refusing beats discarding ------
  IF NEW.status          IS DISTINCT FROM OLD.status
  OR NEW.visibility      IS DISTINCT FROM OLD.visibility
  OR NEW.takedown_reason IS DISTINCT FROM OLD.takedown_reason THEN
    RAISE EXCEPTION
      'community_notes: moderation state is set only by an owner operation'
      USING ERRCODE = '42501';
  END IF;

  -- counters are derived, never supplied
  NEW.current_revision_no := OLD.current_revision_no;
  NEW.edit_count          := OLD.edit_count;
  NEW.edited_at           := OLD.edited_at;

  -- 3.7 retraction: one-way, author only -------------------------------
  IF NEW.retracted_at IS DISTINCT FROM OLD.retracted_at THEN
    IF NEW.retracted_at IS NULL THEN
      RAISE EXCEPTION 'community_notes: retraction cannot be undone'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.author_id IS NULL OR OLD.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'community_notes: only the author may retract'
        USING ERRCODE = '42501';
    END IF;
    NEW.retracted_at := now();          -- server-stamped, not client-chosen
    NEW.visibility   := 'retracted';
  END IF;

  -- 3.6 body edit ------------------------------------------------------
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD.author_id IS NULL OR OLD.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'community_notes: only the author may edit'
        USING ERRCODE = '42501';
    END IF;

    NEW.body := public.community_validate_body(NEW.body);

    NEW.current_revision_no := OLD.current_revision_no + 1;
    NEW.edit_count          := OLD.edit_count + 1;
    NEW.edited_at           := now();

    INSERT INTO public.community_note_revisions
      (note_id, revision_no, body, editor_id)
    VALUES (OLD.id, NEW.current_revision_no, NEW.body, auth.uid());

    -- An edit never restores a concealed note, and editing under an
    -- unresolved report conceals — so an adjudicator is never comparing a
    -- report against content that has since changed.
    IF NEW.visibility = 'visible' THEN
      SELECT count(*) INTO v_open_reports FROM public.community_note_reports
        WHERE note_id = OLD.id AND resolved_at IS NULL;
      IF v_open_reports > 0 THEN
        NEW.visibility := 'quarantined';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER community_notes_before_update
  BEFORE UPDATE ON public.community_notes
  FOR EACH ROW EXECUTE FUNCTION public.community_notes_before_update();

-- Revisions are append-only for everyone; only a takedown redaction may
-- rewrite them, and it goes through the bypass.
CREATE OR REPLACE FUNCTION public.community_revisions_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  -- Only an UPDATE may be bypassed, and only for takedown redaction. A DELETE
  -- is refused unconditionally: returning OLD from a BEFORE DELETE trigger
  -- would ALLOW the delete, which would silently destroy the audit trail.
  IF TG_OP = 'UPDATE' AND public.community_bypass_active() THEN
    RETURN NEW;
  END IF;
  -- The other half of the account-deletion path: `editor_id` is ON DELETE SET NULL, so
  -- deleting an account reaches the audit trail as an UPDATE too. Without this the trail
  -- would make account deletion impossible for anyone who had ever edited a note. Only
  -- the nulling of the editor is permitted; the body and the revision's identity stay
  -- frozen, which is the property this trigger exists to hold.
  IF TG_OP = 'UPDATE'
     AND OLD.editor_id IS NOT NULL AND NEW.editor_id IS NULL
     AND NEW.note_id     IS NOT DISTINCT FROM OLD.note_id
     AND NEW.revision_no IS NOT DISTINCT FROM OLD.revision_no
     AND NEW.body        IS NOT DISTINCT FROM OLD.body
     AND NEW.created_at  IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'community_note_revisions: revisions are append-only'
    USING ERRCODE = '42501';
END;
$fn$;

CREATE TRIGGER community_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.community_note_revisions
  FOR EACH ROW EXECUTE FUNCTION public.community_revisions_immutable();

-- ── 3.8  BEFORE INSERT on reports → lock, then stamp the revision ────
-- The FOR UPDATE is load-bearing. Without it, three simultaneous reporters
-- each see only their own uncommitted row, the AFTER INSERT threshold in 3.9
-- never fires, and the note stays visible. Reproduced on PostgreSQL 17.
CREATE OR REPLACE FUNCTION public.community_reports_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_rev INT;
BEGIN
  SELECT current_revision_no INTO v_rev
    FROM public.community_notes WHERE id = NEW.note_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_reports: note not found' USING ERRCODE = '23503';
  END IF;
  -- Any client-supplied value is discarded, not validated (D4).
  NEW.revision_no := v_rev;
  NEW.created_at  := now();
  NEW.resolved_at := NULL;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER community_reports_before_insert
  BEFORE INSERT ON public.community_note_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_reports_before_insert();

-- ── 3.9  AFTER INSERT on reports → conceal the NOTE, never the account ─
-- A new account costs two Google clicks; automating suspension on report
-- volume hands the power to silence a player to whoever coordinates best
-- (D6). Nothing here touches any account state.
CREATE OR REPLACE FUNCTION public.community_reports_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_reporters INT;
  v_conceal   BOOLEAN := FALSE;
BEGIN
  IF NEW.reason IN ('phi', 'third-party-copyright') THEN
    -- asymmetric on purpose: for these two, an hour up costs more than a
    -- wrong takedown
    v_conceal := TRUE;
  ELSE
    SELECT count(DISTINCT reporter_id) INTO v_reporters
      FROM public.community_note_reports
      WHERE note_id = NEW.note_id AND resolved_at IS NULL;
    v_conceal := v_reporters >= 3;
  END IF;

  IF v_conceal THEN
    PERFORM set_config('community.bypass', 'on', TRUE);
    UPDATE public.community_notes
       SET visibility = 'quarantined'
     WHERE id = NEW.note_id
       AND visibility IN ('visible', 'withheld');
    PERFORM set_config('community.bypass', 'off', TRUE);
  END IF;

  RETURN NULL;
END;
$fn$;

CREATE TRIGGER community_reports_after_insert
  AFTER INSERT ON public.community_note_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_reports_after_insert();

-- ── 3.11  BEFORE INSERT on profile reports → stamp the name ──────────
-- The snapshot is the evidence a note body's revision history provides.
-- Filing a report does NOT conceal: that is an owner act (D17).
CREATE OR REPLACE FUNCTION public.community_profile_reports_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_nickname TEXT;
BEGIN
  SELECT nickname INTO v_nickname
    FROM public.community_profiles WHERE user_id = NEW.profile_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_profile_reports: no display name to report'
      USING ERRCODE = '23503';
  END IF;
  NEW.nickname_snapshot := v_nickname;   -- client value discarded
  NEW.created_at        := now();
  NEW.resolved_at       := NULL;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER community_profile_reports_before_insert
  BEFORE INSERT ON public.community_profile_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_profile_reports_before_insert();

-- ── display-name reporting, from a client that cannot name a profile ─
-- A player can SEE a display name but, by construction, not the account behind it: the
-- public projection has no account identifier and that is the point (D9). So the client
-- names the NOTE it is looking at and the server resolves the author. The report still
-- lands on the profile with the nickname stamped as evidence by 3.11, no identity crosses
-- the boundary, and the per-reporter unique index still de-duplicates.
--
-- This is the ONE non-owner function granted to `authenticated` besides the flag reader.
-- It is SECURITY DEFINER because `community_profile_reports` is REVOKEd from every client
-- role; it is not a moderation verb and it conceals nothing — filing it only puts the name
-- in the owner's queue (D17).
CREATE OR REPLACE FUNCTION public.community_report_display_name(p_note_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_author   UUID;
  v_reporter UUID := auth.uid();
BEGIN
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'community_report_display_name: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Only a publicly visible note can be the handle: anything else would let a caller
  -- probe for the existence of withheld or concealed content by its id.
  SELECT author_id INTO v_author FROM public.community_notes
    WHERE id = p_note_id AND visibility = 'visible';
  IF NOT FOUND OR v_author IS NULL THEN
    RAISE EXCEPTION 'community_report_display_name: no visible note % with an author', p_note_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_author = v_reporter THEN
    RAISE EXCEPTION 'community_report_display_name: cannot report your own display name'
      USING ERRCODE = '23514';
  END IF;

  -- The reason domain, the nickname stamp and the duplicate check are all enforced by the
  -- table and its trigger, not re-implemented here.
  INSERT INTO public.community_profile_reports (profile_user_id, reporter_id, reason)
  VALUES (v_author, v_reporter, p_reason);
END;
$fn$;

-- ── 3.10 / 3.12  owner operations ────────────────────────────────────
-- A closed verb list rather than a general write path: greppable, each verb's
-- denial separately assertable, and a bug in an owner script cannot silently
-- bypass every guard at once (D19). Each raises on an unknown target.

CREATE OR REPLACE FUNCTION public.community_note_publish(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  PERFORM set_config('community.bypass', 'on', TRUE);
  UPDATE public.community_notes
     SET visibility = 'visible', status = 'reviewed'
   WHERE id = p_note_id AND visibility = 'withheld';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_publish: no withheld note %', p_note_id
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('community.bypass', 'off', TRUE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_note_mark_reviewed(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  PERFORM set_config('community.bypass', 'on', TRUE);
  UPDATE public.community_notes SET status = 'reviewed' WHERE id = p_note_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_mark_reviewed: no note %', p_note_id
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('community.bypass', 'off', TRUE);
END;
$fn$;

-- Restoring requires the reports to have been dealt with first, so the spec's
-- "resolves the reports and restores it" is structural rather than a habit.
CREATE OR REPLACE FUNCTION public.community_note_restore(p_note_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_open INT;
BEGIN
  -- Lock the note BEFORE counting. The reports trigger takes the same row
  -- FOR UPDATE, so this serialises restore against concurrent reporting.
  -- Counting first would let a report land between the count and the update,
  -- leaving a publicly visible note carrying an unresolved report.
  PERFORM 1 FROM public.community_notes
    WHERE id = p_note_id AND visibility = 'quarantined'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_restore: no quarantined note %', p_note_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_open FROM public.community_note_reports
    WHERE note_id = p_note_id AND resolved_at IS NULL;
  IF v_open > 0 THEN
    RAISE EXCEPTION
      'community_note_restore: % unresolved report(s) remain on %', v_open, p_note_id
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('community.bypass', 'on', TRUE);
  UPDATE public.community_notes
     SET visibility = 'visible', status = 'reviewed'
   WHERE id = p_note_id;
  PERFORM set_config('community.bypass', 'off', TRUE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_report_resolve(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.community_note_reports
     SET resolved_at = now()
   WHERE id = p_report_id AND resolved_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_report_resolve: no unresolved report %', p_report_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_profile_report_resolve(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.community_profile_reports
     SET resolved_at = now()
   WHERE id = p_report_id AND resolved_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_profile_report_resolve: no unresolved report %',
      p_report_id USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_profile_conceal(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.community_profiles
     SET nickname_visibility = 'concealed' WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_profile_conceal: no profile %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.community_profile_restore(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.community_profiles
     SET nickname_visibility = 'visible' WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_profile_restore: no profile %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$fn$;

-- 3.10 takedown — redacts the live body AND every revision body, and creates
-- no revision: redaction must not itself capture the content being redacted.
CREATE OR REPLACE FUNCTION public.community_note_takedown(
  p_note_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  -- NULL NOT IN (...) evaluates to NULL, not TRUE, so the NULL test must be
  -- explicit — v1 accepted a NULL reason and redacted with an empty one.
  IF p_reason IS NULL
     OR p_reason NOT IN ('phi', 'third-party-copyright', 'abuse', 'other') THEN
    RAISE EXCEPTION 'community_note_takedown: unknown reason %', p_reason
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('community.bypass', 'on', TRUE);

  UPDATE public.community_notes
     SET body            = '[內容已依檢舉移除]',
         visibility      = 'removed',
         takedown_reason = p_reason
   WHERE id = p_note_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_takedown: no note %', p_note_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.community_note_revisions
     SET body = '[內容已依檢舉移除]'
   WHERE note_id = p_note_id;

  PERFORM set_config('community.bypass', 'off', TRUE);
END;
$fn$;

-- ── 3.13  the review queue, which records itself ─────────────────────
-- Recording is a side effect of listing, so a review cannot be conducted
-- without being recorded and cannot be recorded without being conducted
-- (D15). Stale notes are NOT listed here: the database holds no copy of the
-- corpus, so staleness is derived by the owner's local tooling (D16).
-- `item_id` is always the id to hand to the operation that clears the item:
--   note-report      -> community_report_resolve(item_id)
--   profile-report   -> community_profile_report_resolve(item_id)
--   withheld-note    -> community_note_publish(item_id)
--   quarantined-note -> community_note_restore(item_id)
-- Reports are listed for a note of ANY visibility, not only quarantined ones:
-- one or two reports do not conceal, and a report filed against a note the
-- author later retracted still has to be closed.
CREATE OR REPLACE FUNCTION public.community_review_queue_items()
RETURNS TABLE (
  item_kind    TEXT,
  item_id      UUID,
  subject_id   UUID,
  content      TEXT,
  detail       TEXT,
  open_reports INT,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  -- every unresolved note report, with the body AS IT STOOD at the reported
  -- revision — not the current body, which the author may since have edited
  SELECT 'note-report'::TEXT, r.id, n.id, rev.body,
         r.reason || ' · note ' || n.visibility,
         (SELECT count(*)::INT FROM public.community_note_reports r2
           WHERE r2.note_id = n.id AND r2.resolved_at IS NULL),
         r.created_at
    FROM public.community_note_reports r
    JOIN public.community_notes n ON n.id = r.note_id
    JOIN public.community_note_revisions rev
      ON rev.note_id = r.note_id AND rev.revision_no = r.revision_no
   WHERE r.resolved_at IS NULL
  UNION ALL
  -- every unresolved display-name report, against the name as reported
  SELECT 'profile-report'::TEXT, pr.id, pr.profile_user_id, pr.nickname_snapshot,
         pr.reason, 1::INT, pr.created_at
    FROM public.community_profile_reports pr
   WHERE pr.resolved_at IS NULL
  UNION ALL
  -- new authors waiting on the trust window
  SELECT 'withheld-note'::TEXT, n.id, n.author_id, n.body,
         NULL::TEXT, 0::INT, n.created_at
    FROM public.community_notes n
   WHERE n.visibility = 'withheld'
  UNION ALL
  -- concealed notes whose reports are all closed: nothing blocks a restore,
  -- so they are waiting on a decision rather than on adjudication
  SELECT 'quarantined-note'::TEXT, n.id, n.author_id, n.body,
         NULL::TEXT, 0::INT, n.created_at
    FROM public.community_notes n
   WHERE n.visibility = 'quarantined'
     AND NOT EXISTS (SELECT 1 FROM public.community_note_reports r
                      WHERE r.note_id = n.id AND r.resolved_at IS NULL)
   ORDER BY 7;
$fn$;

-- One evaluation, not two. Calling the items function twice would put the
-- count and the returned rows in different READ COMMITTED snapshots, so
-- `item_count` could disagree with what the owner actually saw — and that
-- number is the whole evidentiary point of D15.
CREATE OR REPLACE FUNCTION public.community_review_queue()
RETURNS TABLE (
  item_kind    TEXT,
  item_id      UUID,
  subject_id   UUID,
  content      TEXT,
  detail       TEXT,
  open_reports INT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  RETURN QUERY
  WITH items AS MATERIALIZED (
    SELECT * FROM public.community_review_queue_items()
  ),
  recorded AS (
    INSERT INTO public.community_review_runs (actor_id, item_count)
    SELECT auth.uid(), count(*)::INT FROM items
    RETURNING id
  )
  SELECT i.* FROM items i CROSS JOIN recorded;
END;
$fn$;

-- =====================================================================
-- 2.10  FUNCTION PRIVILEGES — must come after every CREATE FUNCTION
-- =====================================================================
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions in
-- `public` to anon, authenticated and service_role BY NAME. `REVOKE ... FROM
-- PUBLIC` does not touch a named grant, so each role must be revoked
-- explicitly. Measured on draft v1, which revoked only from PUBLIC: 10 of 11
-- functions were reachable by anon.
--
-- Functions are listed one by one on purpose. `REVOKE ALL ON ALL FUNCTIONS IN
-- SCHEMA public` would also strip functions belonging to other migrations.
DO $priv$
DECLARE
  v_fn TEXT;
  v_fns TEXT[] := ARRAY[
    'public.community_bypass_active()',
    'public.community_canonicalise_body(text)',
    'public.community_md_cell_count(text)',
    'public.community_md_has_pipe(text)',
    'public.community_md_is_delimiter(text)',
    'public.community_table_bounds_ok(text,int,int)',
    'public.community_validate_body(text)',
    'public.community_submissions_enabled()',
    'public.community_notes_before_insert()',
    'public.community_notes_after_insert()',
    'public.community_notes_before_update()',
    'public.community_revisions_immutable()',
    'public.community_reports_before_insert()',
    'public.community_reports_after_insert()',
    'public.community_profile_reports_before_insert()',
    'public.community_report_display_name(uuid,text)',
    'public.community_note_publish(uuid)',
    'public.community_note_mark_reviewed(uuid)',
    'public.community_note_restore(uuid)',
    'public.community_report_resolve(uuid)',
    'public.community_profile_report_resolve(uuid)',
    'public.community_profile_conceal(uuid)',
    'public.community_profile_restore(uuid)',
    'public.community_note_takedown(uuid,text)',
    'public.community_review_queue_items()',
    'public.community_review_queue()'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_fn);
  END LOOP;
END
$priv$;

-- The only two functions a player may execute. The first is called by the INSERT policy.
-- The second is the display-name report path, which exists because a client cannot name a
-- profile: it takes a note id and resolves the author server-side. Neither changes any
-- moderation state; adding a third here needs the same scrutiny as widening a policy.
GRANT EXECUTE ON FUNCTION public.community_submissions_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_report_display_name(UUID, TEXT) TO authenticated;

-- The owner's verb list.
GRANT EXECUTE ON FUNCTION public.community_note_publish(UUID)             TO service_role;
GRANT EXECUTE ON FUNCTION public.community_note_mark_reviewed(UUID)       TO service_role;
GRANT EXECUTE ON FUNCTION public.community_note_restore(UUID)             TO service_role;
GRANT EXECUTE ON FUNCTION public.community_report_resolve(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION public.community_profile_report_resolve(UUID)   TO service_role;
GRANT EXECUTE ON FUNCTION public.community_profile_conceal(UUID)          TO service_role;
GRANT EXECUTE ON FUNCTION public.community_profile_restore(UUID)          TO service_role;
GRANT EXECUTE ON FUNCTION public.community_note_takedown(UUID, TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.community_review_queue()                 TO service_role;

COMMIT;

-- =====================================================================
-- Not in this file (later tasks):
--   §4  scripts/verify-community-rls.mjs — the acceptance body. Runs with an
--       anon key and a non-owner JWT and MUST refuse to run if a service_role
--       credential is present: a credential that bypasses RLS passes whether
--       or not the boundary exists (D12).
--   §5–6 client renderer, notes drawer, and the client-side staleness filter
--       that is the other half of D16.
--   §7  rollout: throwaway Supabase project first, then production with both
--       flags off, verify, deploy, owner-only exercise, then enable and start
--       the 30-day clock.
-- =====================================================================
