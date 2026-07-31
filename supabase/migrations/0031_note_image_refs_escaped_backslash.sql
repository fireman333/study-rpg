-- 0031_note_image_refs_escaped_backslash.sql
--
-- Change `add-community-note-images` (study-rpg-2nd), §3. Found by an adversarial review of the
-- shipped migration on 2026-07-30 and confirmed against production before this was written.
--
-- THE DEFECT. `community_note_image_refs` decides whether a body may be stored by COMPARING
-- COUNTS: every `![` in the body must be part of an exact own-store match. Both functions first
-- neutralise an ESCAPED bang, `\!`, because that is literal text rather than an image construct.
-- But a body may also contain an escaped BACKSLASH, and the blind replace cannot tell the two
-- apart:
--
--     source text:  \\![beacon](https://attacker.example/pixel)
--     characters:   \  \  !  [  b  e  a  c  o  n  ]  (  h  t  t  p  s ...
--
-- The replace looks for the two-character sequence `\!`, finds it at the SECOND backslash, and
-- removes the image construct's opening from its own view. `![` count 0, own-store matches 0,
-- counts equal, body accepted. CommonMark reads the same bytes the other way: `\\` is an escaped
-- backslash producing one literal `\`, and what follows is an ordinary image with a third-party
-- destination. Confirmed on production: the function returned `{}` and did not raise.
--
-- WHY THIS IS NOT AN INCIDENT, stated so the fix is not oversold. The renderer decides every image
-- node independently and admits only the own-store form, so a body like the one above renders as
-- plain text and issues no request — verified by running the real renderer, in both switch
-- positions. What was actually breached is defence in depth: of the two layers that keep a
-- third-party image out, the outer one could be walked past, leaving the guarantee resting on a
-- single renderer. The capability's normative sentence — "A body containing an image reference in
-- any other form SHALL be refused at submission" — was simply false, and a stored body outlives
-- whichever renderer is reading it.
--
-- THE FIX. Normalise the escaped backslash FIRST, into its own placeholder, so the escaped-bang
-- replace can no longer see a backslash that was itself escaped. Left-to-right, which is how
-- CommonMark reads escapes:
--
--     \\![x](url)   -> chr(1) ![x](url)      count 1, refs 0  -> REFUSED   (was accepted)
--     \![x](url)    -> chr(2) [x](url)       count 0, refs 0  -> accepted  (a link, not an image)
--     \\\!          -> chr(1) chr(2)         count 0, refs 0  -> accepted  (literal \ then !)
--     \\![x](note-image:<uuid>)              count 1, refs 1  -> accepted  (a real own-store image)
--
-- chr(1) is safe for exactly the reason chr(2) already was: canonicalisation strips every C0
-- control before a body is stored, so neither can occur naturally.
--
-- BOTH functions are replaced, and that is not tidiness. `community_note_image_refs` counts `![`
-- on its OWN normalised copy but calls `community_note_image_display_refs` with the RAW body, so
-- the two normalisations must agree or the comparison compares different things.
--
-- Bodies are unchanged and no row is touched: this replaces two IMMUTABLE functions and nothing
-- else. Bodies already stored that would now be refused are not re-validated — there are none, and
-- a later edit would be refused on the way in.
--
-- Applied out of band with `supabase db query --linked -f`. NEVER `supabase db push`.
-- Definitions below were taken from `pg_get_functiondef()` against PRODUCTION (design D12), not
-- from 0029, and differ from the live text by the added line and its comment alone.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.community_note_image_display_refs(p_body text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_body TEXT;
  v_refs UUID[];
BEGIN
  -- An escaped BACKSLASH is consumed first, so that the escaped-bang replace below cannot
  -- mistake the second backslash of `\\` for an escape of the bang that follows it. Without
  -- this, `\\![x](https://evil)` reads to us as no image at all and to CommonMark as one.
  v_body := replace(COALESCE(p_body, ''), '\\', chr(1));
  -- An escaped bang is literal text, not an image construct. chr(2) is a safe
  -- placeholder: canonicalisation has already removed every C0 control from a
  -- stored body, so it cannot occur naturally. The same argument covers chr(1).
  v_body := replace(v_body, '\!', chr(2));

  SELECT COALESCE(array_agg(t.m[1]::UUID ORDER BY t.ord), '{}'::UUID[])
    INTO v_refs
    FROM regexp_matches(
           v_body,
           '!\[[^]]*\]\(note-image:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)',
           'g') WITH ORDINALITY AS t(m, ord);

  RETURN v_refs;
END;
$function$;

CREATE OR REPLACE FUNCTION public.community_note_image_refs(p_body text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_body   TEXT;
  v_starts INT;
  v_refs   UUID[];
BEGIN
  -- Must mirror community_note_image_display_refs exactly: this counts `![` on its own
  -- normalised copy while delegating the matching to that function with the RAW body, so a
  -- difference between the two normalisations would make the comparison meaningless.
  v_body   := replace(COALESCE(p_body, ''), '\\', chr(1));
  v_body   := replace(v_body, '\!', chr(2));
  v_starts := (length(v_body) - length(replace(v_body, '![', ''))) / 2;
  v_refs   := public.community_note_image_display_refs(p_body);

  IF v_starts <> COALESCE(array_length(v_refs, 1), 0) THEN
    RAISE EXCEPTION
      'community_note_images: an image must be an own-store reference, not a URL'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_refs;
END;
$function$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFIED BEFORE APPLYING — 14 assertions, 0 failures, run against PRODUCTION
-- inside BEGIN … ROLLBACK. Kept here rather than in a scratchpad because 0029's
-- suite was kept in one and is already gone.
--
--   refused (the defect, and its neighbours)
--     \\![beacon](https://attacker.example/pixel)
--     \\![b](//attacker.example/p.png)
--     \\![b](data:image/png;base64,…)
--     \\![b](https://api.med-study-rpg.com/note-images/<uuid>)   our own host, still a URL
--
--   accepted, and must stay accepted
--     \![x](https://example.com/a.png)          escaped bang -> a link, not an image
--     \\\!not an image                          literal backslash then literal bang
--     nothing to see here                       prose
--     ![x](note-image:<uuid>)                   one own-store reference
--     \\![x](note-image:<uuid>)                 literal backslash BEFORE a real reference
--     three own-store references                counted as three
--
--   refused before this migration and still refused
--     ![x](https://attacker.example/pixel)
--     ![a][b]                                   reference-style
--     ![x](note-image:<UPPERCASE-UUID>)
--     ![x](<note-image:<uuid>>)                 angle-bracketed destination
--
-- That last one is worth keeping. An adversarial review found that the RENDERER
-- resolves the angle-bracketed and entity-encoded forms into a working image
-- element, because it reads the parser's normalised URL rather than the source
-- text. This assertion pins the fact that such a body cannot be STORED, which is
-- what keeps that renderer gap off every published surface.
