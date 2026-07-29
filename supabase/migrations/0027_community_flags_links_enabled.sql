-- =====================================================================
-- 0027  a central switch for rendering bare URLs as links
-- =====================================================================
-- Change `render-bare-urls-as-links` (study-rpg-2nd) makes a bare http(s)
-- URL in a note body clickable. This is the switch that governs it.
--
-- Unlike `public_read`, `submissions_enabled` and `voting_enabled`, this one
-- gates RENDERING, not a write. That gives it a property the others lack:
-- **its off state is exactly the behaviour that shipped before links
-- existed** — every URL renders as plain text, as it does today. So the
-- feature can reach production with the switch off and change nothing a
-- reader can observe, and be turned on as a separate act once the
-- already-published notes have been read.
--
-- It is also the whole of the incident response. `community-notes` requires
-- that report thresholds conceal a note and never restrict an account
-- ("a new account costs two clicks"), so there is no account-level answer to
-- link abuse. One UPDATE here is it.
--
-- DEFAULT FALSE, so the existing row is off on arrival and the deploy that
-- follows is dark.
--
-- ORDER MATTERS: the client selects flag columns by name, and a column the
-- database does not have takes the WHOLE notes surface down rather than just
-- this feature. Apply this BEFORE deploying the bundle that selects it.
-- =====================================================================

ALTER TABLE public.community_flags
  ADD COLUMN IF NOT EXISTS links_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.community_flags.links_enabled IS
  'Render bare http(s) URLs in note bodies as links. Off = plain text, which is the pre-change behaviour. Owner-only kill switch for link abuse.';
