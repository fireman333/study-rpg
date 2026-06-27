## 1. Fingerprint manifest + official-link map (committed build artifacts)

- [x] 1.1 `bookletId` = `<year>-<session>-醫學[一二]` — derivable from question meta AND from filename; `canonicalFile` = the provenance `file`. Verified: 44 manifest canonicalFiles == 44 provenance files exactly
- [x] 1.2 `build-booklet-links.mjs` → `booklet-drive-links.json` (46 booklets, incl. 115-1; normalizes `/file/d/<ID>/view`, `uc?export=view&id=<ID>`, and the 104-1醫二 `resourcekey`). Auditable source `booklet-drive-links.source.txt`
- [x] 1.3 `build-fingerprint-manifest.ts` (tsx + bundled pdfjs legacy Node) over the 44 local PDFs → `fingerprint-manifest.json` (44 entries; 43 text-fingerprintable, 1 size-only = 113-2醫學二 empty text layer). Filename→bookletId handles all real variants (`113-2_醫學一總檔.pdf` etc.)
- [x] 1.4 Shared `src/platform/fingerprint.ts` (`normText` + `samplePages` + `computeFingerprint` + `matchFingerprint`) used by BOTH build + runtime (engine parity); 11 unit tests (incl. strong/weak/low-confidence/none)
- [x] 1.5 Committed artifacts in `packages/content-neurons-tw/provenance/`; `build-provenance-map.mjs` copies them into gitignored `public/provenance/` at build (verified all 3 present)

## 2. Content-fingerprint resolver (desktop)

- [x] 2.1 Rust `list_pdf_files_with_stat` (name + size + mtime via `PdfFileStat`); registered; `cargo check` green
- [x] 2.2 `fingerprint-runtime.ts` — bundled-pdfjs + SubtleCrypto `fingerprintBytes` (copies buffer so caller's bytes survive for the blob)
- [x] 2.3 `fpCache.ts` — device-local per-file fingerprint cache keyed by `{name,size,mtime}` (localStorage, never synced)
- [x] 2.4 `tauriBackend.ts` `openExplanation` rewritten: provenance file → booklet (via `bookletForFile`) → fast-path canonical-name then full fingerprint scan → strong/weak open, low-confidence flagged, none → guided-download `notFound`. Filename match kept only as a no-manifest last resort
- [x] 2.5 `manifest.ts` — `loadFingerprintManifest` / `loadBookletLinks` / `bookletForFile` (lazy + cached, call-time fetch default)
- [x] 2.6 14 tests green (`fingerprint.test.ts` 11 + `tauri-resolver.test.ts` 3: arbitrary-named file resolves by fingerprint, missing→file-not-found w/ bookletId+driveUrl, unmapped short-circuits). Full suite 712 pass; web path untouched (`OpenResult` extended additively)

## 3. Guided-download UI (desktop-only)

- [x] 3.1 `LocalPdfButton` guided card on file-not-found: booklet id + 📥 official Drive link (Tauri `opener` plugin → system browser) + 🔄「掃描資料夾」(retry = re-fingerprint). Low-confidence opens get a「依頁數比對」note. `openExternalUrl` added to the platform surface (desktop opener / web `window.open`)
- [x] 3.2 `BookletDownloadList` (all 46 official links) in a desktop-aware HelpMenu「原始詳解 PDF」section + reused in the onboarding banner
- [x] 3.3 Licensing copy in both: credit「陽明國考考古題小組」+「從官方 Google Drive 下載到你的資料夾」/「App 不提供 PDF、只連到官方來源」

## 4. Onboarding banner (desktop-only)

- [x] 4.1 `DesktopPdfOnboardingBanner` (mounted in App): shows when `isDesktop()` AND `getStatus() !== 'ready'`; step 1 download (expandable official-link list), step 2 📂 grant folder; dismissible (localStorage); returns null on web / once granted
- [x] 4.2 Gating via the `!isDesktop() || dismissed || status !== ready → null` guard (no RTL in this repo's test setup → behavior covered by the guard + owner desktop smoke 7.3)

## 5. Desktop bug-report category + migration

- [x] 5.1 `desktop-app` added to `NEURONS_BUG_REPORT_CATEGORIES` (core) + `CATEGORY_LABELS`; form filters it out unless `isDesktop()`
- [x] 5.2 Auto-context gains `platform` (`tauri-desktop · <ua>`) on desktop only, with its own opt-out (filtered off the web opt-out list); core `BugReportAutoContext.platform`
- [x] 5.3 `supabase/migrations/0018_neurons_desktop_bug_category.sql` — DROP + recreate `bug_reports_category_check` = 0017 union ∪ `desktop-app` (additive; app CHECK / RLS / columns untouched)
- [x] 5.4 Migration `0018` **APPLIED to prod 2026-06-27** via Supabase dashboard SQL editor (owner; safest path vs `db push` history-replay — CLI was linked + authed but needed the owner's DB password). Lockstep test green (core list == migration `0018` CHECK incl. `desktop-app`)

## 6. App icon (desktop + web)

- [x] 6.1 Regenerated `src-tauri/icons/` from the cute pixel-neuron source via `cargo tauri icon`; pruned mobile dirs; committed `icon-source-1024.png`
- [x] 6.2 Web favicon `public/favicon.png` + `<link rel="icon">` in `index.html` (both committable, not gitignored)

## 7. Verify

- [x] 7.1 typecheck clean · **712 vitest** · `cargo test` 4/4 (guard tests pass with opener + stat additions)
- [x] 7.2 Web no-regression: bundle **0** `@tauri-apps/*` tokens; base `/` (and `/neurons/` favicon rewrites correctly); favicon emitted + referenced; desktop features `isDesktop()`-inert on web
- [ ] 7.3 Desktop end-to-end (**OWNER**): rename a downloaded booklet to a random name → still resolves by fingerprint; missing booklet → guided prompt + official link opens + rescan resolves; onboarding banner shows pre-grant / hides post-grant; desktop bug-report category appears + platform context attaches
- [ ] 7.4 Fingerprint validation (**OWNER PDFs**): confirm all 44 booklets resolve; 113-2醫學二 is the size-only low-confidence one (verify its confirm-note path)
- [x] 7.5 **PdfDocumentView WKWebView scroll fix** (blocker surfaced in owner 7.3 dry-run): the old `scrollIntoView`+re-pin loop produced a scroll-through + white-page flash on open and an intermittent 1–2-page miss in WKWebView (no scroll anchoring). Rewrote `PdfDocumentView` to a **target-anchored window** — open mounts only the target + pages below it (never above), so the landing is a single deterministic `scrollTop` write with nothing above to reflow (kills scroll-through, flashing, and the intermittent miss); continuous scroll compensates `scrollTop` for above-the-fold height deltas via a `ResizeObserver` (manual `overflow-anchor` substitute, `overflow-anchor:none` so Blink doesn't double-compensate); window capped at 16 mounted pages; re-anchors on `[url, initialPage]` (fixes opening a 2nd question in the SAME booklet, which the old reload-gated logic missed). Design sanity-checked with Codex. **Web (Blink) verified** via Chrome MCP DEV `__pdfPanel` over an 80-page served PDF: deterministic landing (pages 1/5/7/30/51/80 — `scrollTop` stable from the first frame, flush at top), repeated p51 always lands 51, smooth bidirectional scroll (topPage ±1, mounted ≤16), resize re-pins the target, console clean. 712 vitest + typecheck green. **WKWebView re-check folds into 7.3** (owner desktop smoke).
- [x] 7.6 **WKWebView blank-render follow-up** (surfaced in owner 7.3 desktop smoke — Blink never showed it): the panel opened to the correct file+page but the page area stayed blank / flashed-then-blanked. An on-screen DEV HUD (since the Tauri terminal doesn't capture the webview console) proved WebKit **ACCEPTS** the landing `scrollTop` write (read-back confirms it) then **DISCARDS it a compositing frame later, resetting `scrollTop` to 0** — so the viewport sat over the unmounted placeholders above the target, and the reset's scroll event grew the window away from it. Codex-consulted. Fix: the landing **re-asserts** the target offset every frame until it HOLDS for 3 consecutive frames against a fully laid-out container (instead of trusting one read-back), with `onScroll` growth + RO compensation frozen the whole settle; placeholder slots use explicit `height` (not just `minHeight`) so WebKit reserves space reliably. **Desktop-verified by owner in WKWebView** (lands on the correct page, no blank). Web (Blink) re-verified (stable deterministic landing, repeat opens correct). HUD instrumentation removed after diagnosis.
