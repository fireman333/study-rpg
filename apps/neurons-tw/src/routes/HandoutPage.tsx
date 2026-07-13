/**
 * HandoutPage — /cram/handout 「考前講義(beta)」(add-neurons-anatomy-handout;
 * enhance-neurons-anatomy-handout).
 *
 * A full-screen, vertically scrollable, TEACHING-style study handout — deeper and more
 * beginner-friendly than the cram-tab discriminator sheets or the 5-min speed review.
 * Meant to be read over the last week before an exam. Ships 解剖學 (chapter-keyed) + 組織學
 * (region-keyed) today; the loader returns a subjects[] array so more families add with zero code change.
 *
 * Same full-screen-scene discipline as SpeedReviewPage: createPortal to <body> to escape the
 * AnimatedRoutes Framer transform; the route is registered OUTSIDE AnimatedRoutes (with an
 * in-layer placeholder) so in-app nav + direct URL + F5 all render.
 *
 * enhancements (enhance-neurons-anatomy-handout):
 *  - docs-style chapter nav: left sidebar (≥1024px) / drawer (≤1023px) with IntersectionObserver
 *    scroll-spy (root = internal scroll container) and emoji-stripped labels
 *  - per-chapter「測驗本章」CTA opening the existing QuizModal (practice mode) over that chapter's pool
 *  - one-click PDF via window.print() + @media print CSS
 *  - reading progress bar, per-subject last-read restore (localStorage), #region / ?section deep-links
 *  - a11y: focus in/out, Esc to close, drawer focus-trap, semantic nav
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { ContentPack, Question } from '@study-rpg/core'
import { useHandout, orderSubjectsByExamPaper } from '../lib/handout'
import type { HandoutSubject } from '../lib/handout'
import { useCram } from '../lib/cram'
import { deriveRegions, deriveToc, resolveLeafTarget, findLeafAnchorId } from '../lib/handout-regions'
import type { HandoutTocEntry } from '../lib/handout-regions'
import { QuizModal } from '../components/QuizModal'
import { EmojiIcon } from '../components/EmojiIcon'

const lastReadKey = (subjectId: string) => `handout:${subjectId}:scrollTop`

/** Read a #region / ?section=region deep-link target from the current URL (once, on entry). */
function readDeepLinkSection(): string | null {
  if (typeof window === 'undefined') return null
  const fromQuery = new URLSearchParams(window.location.search).get('section')
  const fromHash = window.location.hash ? window.location.hash.slice(1) : ''
  return fromQuery || fromHash || null
}

/** Read a ?leaf=<leafId> unit-correspondence deep-link target (once, on entry; precedes ?section=). */
function readDeepLinkLeaf(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('leaf') || null
}

export function HandoutPage({ pack }: { pack: ContentPack }): JSX.Element | null {
  const navigate = useNavigate()
  const data = useHandout()
  const cram = useCram()
  const [mounted, setMounted] = useState(false)
  // Read `?subject=` SYNCHRONOUSLY on first render (add-neurons-handout-rescue-deeplink): the
  // deep-link is consume-once and regions derive from `active` on the very first render, so a
  // cross-subject deep-link must pick its subject before that — a useEffect would derive
  // subjects[0] first and silently mis-land on the default subject's last-read position.
  const [subjectId, setSubjectId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('subject'),
  )
  // Whether we arrived from a rescue war-map chip — surfaces a 「← 回救急」 return control that
  // closes the diagnose → read → re-test loop back to that subject's 戰情圖 (URL-transient, zero state).
  const [fromRescue] = useState(() =>
    typeof window === 'undefined' ? false : new URLSearchParams(window.location.search).get('from') === 'rescue',
  )
  const [tocOpen, setTocOpen] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [quizPool, setQuizPool] = useState<Question[] | null>(null)
  // A `?leaf=` deep-link whose leaf has neither a topic anchor nor a region in this subject (cross-
  // subject leak / 送分 / disputed) → surface an inline note + escape hatch; NEVER scroll to region 0.
  const [leafUnavailable, setLeafUnavailable] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const prevFocusRef = useRef<Element | null>(null)
  const deepLinkConsumedRef = useRef(false)
  // The id a deep-link landed on, so the reverse-link injection (which adds nodes ABOVE a deep target
  // and would shift it out of view) can re-correct the scroll ONCE after it runs. Cleared on use.
  const landedTargetRef = useRef<string | null>(null)

  // Capture the pre-open focus so we can restore it when the scene unmounts.
  useEffect(() => {
    prevFocusRef.current = document.activeElement
    setMounted(true)
    return () => {
      ;(prevFocusRef.current as HTMLElement | null)?.focus?.()
    }
  }, [])

  // Order the subject picker by exam-paper sequence (醫學一 then 醫學二) — see orderSubjectsByExamPaper.
  const subjects: HandoutSubject[] = useMemo(() => orderSubjectsByExamPaper(data?.subjects ?? []), [data?.subjects])
  const active: HandoutSubject | null =
    subjects.find((s) => s.subjectId === subjectId) ?? subjects[0] ?? null

  // Parse the authored HTML into region blocks ONCE per subject (expensive part is the DOMParser).
  const regions = useMemo(() => deriveRegions(active?.html ?? ''), [active?.html])
  const toc = useMemo(() => deriveToc(regions), [regions])

  // qid → Question, mirroring CramPage's practice-pool resolution.
  const questionById = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of pack.questions) m.set(q.id, q)
    return m
  }, [pack.questions])
  const quizByRegion = useMemo(
    () => new Map((active?.chapterQuizzes ?? []).map((q) => [q.regionId, q])),
    [active?.chapterQuizzes],
  )
  // Signpost: a member region whose chapter's 測驗 CTA lives at a LATER region points forward to it,
  // so every content chapter's end has an affordance without duplicating the shared question pool.
  const signpostByRegion = useMemo(() => {
    const m = new Map<string, { targetRegionId: string; label: string }>()
    for (const cq of active?.chapterQuizzes ?? []) {
      for (const rid of cq.memberRegionIds) {
        if (rid !== cq.regionId) m.set(rid, { targetRegionId: cq.regionId, label: cq.label })
      }
    }
    return m
  }, [active?.chapterQuizzes])

  // The active subject's leafIds that have a matching 押題 in cram — drives the reverse「本單元猜題」
  // affordance (講義 topic → 押題). null while cram is still loading; a leaf with no 押題 gets no link
  // (no dead link, per neurons-unit-correspondence). Subject-scoped: same-name leaves stay in-subject.
  // leafId → 押題 zh label for the active subject (Map, not Set: the zh distinguishes each unit's
  // reverse-link on a multi-value topic).
  const cramPushLeaves = useMemo<Map<string, string> | null>(() => {
    if (!cram || !active) return null
    for (const book of cram.books) {
      const subj = book.subjects.find((s) => s.subjectId === active.subjectId)
      if (subj) return new Map(subj.push.map((p) => [p.leafId, p.zh]))
    }
    return new Map<string, string>()
  }, [cram, active?.subjectId])

  const close = useCallback(() => navigate('/cram'), [navigate])

  const jumpTo = useCallback((id: string, smooth = true) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    setActiveSectionId(id)
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`)
  }, [])

  const openChapterQuiz = useCallback(
    (regionId: string) => {
      const cq = quizByRegion.get(regionId)
      if (!cq) return
      const pool = (cq.sourceQuestionIds ?? [])
        .map((id) => questionById.get(id))
        .filter((q): q is Question => q != null)
      if (pool.length > 0) {
        setTocOpen(false)
        setQuizPool(pool)
      } else {
        // Degenerate safety net (a corpus rename dropping every qid) — hand off to the bank.
        navigate('/bank')
      }
    },
    [quizByRegion, questionById, navigate],
  )

  // Focus the close control on open (docs-dialog focus management).
  useEffect(() => {
    if (mounted && active) closeBtnRef.current?.focus()
  }, [mounted, active?.subjectId])

  // Restore last-read position (or honor a deep-link) once regions have rendered for a subject.
  useEffect(() => {
    if (!active || regions.length === 0) return
    const root = scrollRef.current
    if (!root) return

    // Instant jump (not smooth) + transient landing cue; runs in the layout-ready useEffect so it
    // needs no rAF (which would be throttled if hidden). Zero state (CSS `:target` is unreliable
    // under replaceState). Returns false when the target id is not in the DOM.
    const landOn = (id: string): boolean => {
      const el = document.getElementById(id)
      if (!el) return false
      jumpTo(id, false)
      landedTargetRef.current = id // let the reverse-link injection re-correct after it shifts layout
      el.classList.add('hdt-region--landed')
      window.setTimeout(() => el.classList.remove('hdt-region--landed'), 2000)
      return true
    }

    if (!deepLinkConsumedRef.current) {
      deepLinkConsumedRef.current = true
      // `?leaf=` takes precedence over `?section=` / `#hash`. Two-segment (subject, leaf) resolution
      // (neurons-unit-correspondence): primary topic anchor → region fallback → inline unavailable.
      const leaf = readDeepLinkLeaf()
      if (leaf) {
        // Subject-scoped: query only THIS subject's rendered container (`root`), never global
        // `document` — a `leafId` is not unique across subjects, so a residual other-subject topic
        // in the DOM must not resolve here.
        const res = resolveLeafTarget(leaf, active.chapterQuizzes, (l) => findLeafAnchorId(l, root))
        if (res.kind === 'anchor' && landOn(res.anchorId)) return
        if (res.kind === 'region' && landOn(res.regionId)) return
        // unavailable (or an anchor/region that vanished from the DOM) → inline note + escape hatch.
        // NEVER fall back to region 0 / subject 0.
        setLeafUnavailable(true)
        root.scrollTo({ top: 0 })
        return
      }
      const section = readDeepLinkSection()
      if (section && landOn(section)) return
    }

    const saved = Number(localStorage.getItem(lastReadKey(active.subjectId)) || 0)
    root.scrollTo({ top: Number.isFinite(saved) ? saved : 0 })
    // `mounted` MUST be a dep: the scroll container (scrollRef) only renders once `mounted` is true
    // (portal). On a client-side nav from a rescue chip the handout bundle is already module-cached,
    // so `active` + `regions` are ready on the FIRST (mounted=false) render — the effect runs once
    // with a null root, bails BEFORE consuming the deep-link, and without `mounted` in deps never
    // re-runs → the deep-link silently lands on top. (Full-page loads dodged this only because the
    // bundle arrives via async fetch AFTER mount, so regions.length flips 0→N post-mount.)
  }, [active?.subjectId, regions.length, jumpTo, mounted])

  // Reverse link「本單元猜題」(neurons-unit-correspondence): after the subject's teaching HTML is in
  // the DOM (dangerouslySetInnerHTML) and cram has loaded, imperatively append a cram deep-link button
  // to each TAGGED topic whose leaf has a matching 押題. Re-runs on subject switch (React replaces the
  // region innerHTML, wiping injected nodes); idempotent within a subject via the existing-node guard.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !active || regions.length === 0 || !cramPushLeaves) return
    const topics = root.querySelectorAll<HTMLElement>('.hdt-topic[data-leaf-ids]')
    let injectedAny = false
    topics.forEach((topic) => {
      if (topic.querySelector('.hdt-cram-link')) return // already injected for this render
      const leaves = (topic.getAttribute('data-leaf-ids') || '').split(/\s+/).filter(Boolean)
      const pushLeaves = leaves.filter((l) => cramPushLeaves.has(l))
      if (pushLeaves.length === 0) return // no matching 押題 → no dead link
      // Multi-value topic: one reverse-link PER 押題-bearing leaf, each pointing at its own unit —
      // a `find()`-first would send every leaf's deep-link to the first unit (wrong unit on shared
      // topics). Single-value topics keep the plain label; multi-value ones name each unit's zh.
      const multi = pushLeaves.length > 1
      for (const leaf of pushLeaves) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'hdt-cram-link'
        btn.dataset.cramSubject = active.subjectId
        btn.dataset.cramLeaf = leaf
        btn.textContent = multi ? `🎯 ${cramPushLeaves.get(leaf)}猜題 →` : '🎯 本單元猜題 →'
        topic.appendChild(btn)
        injectedAny = true
      }
    })
    // Injecting nodes above a deep deep-link target shifts it; re-scroll ONCE to keep the landing
    // accurate (guarded so it only fires right after arrival, before the user scrolls away).
    if (injectedAny && landedTargetRef.current) {
      document.getElementById(landedTargetRef.current)?.scrollIntoView({ behavior: 'auto', block: 'start' })
      landedTargetRef.current = null
    }
    // `mounted` dep for the same reason as the deep-link effect: on a cached-bundle client-side nav
    // the scroll container isn't attached on the first render, so re-run once it mounts.
  }, [active?.subjectId, regions.length, cramPushLeaves, mounted])

  // Cancel the one-shot post-injection re-scroll the moment the user genuinely interacts (wheel /
  // touch / key) — programmatic `scrollIntoView`/`scrollTo` never fire these, so the landing
  // correction can't fight a reader who has already scrolled away while cram.json loaded.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const cancelReScroll = () => {
      landedTargetRef.current = null
    }
    root.addEventListener('wheel', cancelReScroll, { passive: true })
    root.addEventListener('touchstart', cancelReScroll, { passive: true })
    root.addEventListener('keydown', cancelReScroll)
    return () => {
      root.removeEventListener('wheel', cancelReScroll)
      root.removeEventListener('touchstart', cancelReScroll)
      root.removeEventListener('keydown', cancelReScroll)
    }
  }, [mounted])

  // Delegated click for the injected reverse-link buttons (they live inside dangerouslySetInnerHTML,
  // so they can't be React onClick). Reads the target from data-* so it needs no `active` closure.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.('.hdt-cram-link') as HTMLElement | null
      if (!btn) return
      const subj = btn.dataset.cramSubject
      const leaf = btn.dataset.cramLeaf
      if (!subj || !leaf) return
      navigate(`/cram?subject=${encodeURIComponent(subj)}&push=${encodeURIComponent(leaf)}`)
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
    // `mounted` gates the portal (and thus scrollRef): without it the effect would run only on the
    // pre-mount render when scrollRef is null and never re-attach (navigate is a stable ref).
  }, [navigate, mounted])

  // Reading progress + debounced last-read persistence (device-local only; never synced).
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !active) return
    let saveTimer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      const max = root.scrollHeight - root.clientHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0)
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(lastReadKey(active.subjectId), String(Math.round(root.scrollTop)))
        } catch {
          /* private-mode / quota — position restore is best-effort, safe to drop */
        }
      }, 400)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      root.removeEventListener('scroll', onScroll)
      clearTimeout(saveTimer)
    }
  }, [active?.subjectId, regions.length])

  // Scroll-spy: active chapter driven by IntersectionObserver rooted on the INTERNAL scroll
  // container (the window does not scroll here). Rebuilt when the doc/toc/subject changes.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || toc.length === 0) return
    const sections = toc
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) setActiveSectionId(visible[0].target.id)
      },
      { root, threshold: [0, 0.1, 0.25], rootMargin: '-12% 0px -70% 0px' },
    )
    sections.forEach((s) => observer.observe(s))
    setActiveSectionId((cur) => cur ?? sections[0]?.id ?? null)
    return () => observer.disconnect()
  }, [toc, active?.subjectId])

  // Esc: close drawer first, else close the scene. (QuizModal owns its own Esc when open.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || quizPool) return
      if (tocOpen) {
        setTocOpen(false)
      } else {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tocOpen, quizPool, close])

  // Drawer focus-trap: focus into the drawer on open, cycle Tab within it.
  useEffect(() => {
    if (!tocOpen) return
    const panel = drawerRef.current
    if (!panel) return
    const focusables = () =>
      [...panel.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      )
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    panel.addEventListener('keydown', onKey)
    return () => panel.removeEventListener('keydown', onKey)
  }, [tocOpen])

  if (!mounted) return null

  return createPortal(
    <div className="hdt-scene" style={sceneStyle} role="dialog" aria-modal="true" aria-label="考前講義">
      <style>{SCENE_CSS}</style>

      {/* ── Header: title · subject · nav toggle · print · close ── */}
      <header style={headerStyle} className="hdt-header">
        <span style={titleStyle} className="hdt-title">📖 考前講義</span>
        <span style={betaChipStyle} className="hdt-beta">beta</span>
        {active && <span style={subjectChipStyle} className="hdt-subject">{active.subjectId}</span>}
        {fromRescue && active && (
          <button
            type="button"
            style={chromeBtnStyle}
            aria-label="回救急"
            // Full navigation via BASE_URL, NOT react-router navigate('/?…'): under a basename
            // (prod `/neurons`) navigate resolves the root to "/neurons?…" (no trailing slash),
            // which fails to match the "/" route → blank page. BASE_URL keeps the slash
            // ("/neurons/?…" · "/?…" on localhost), the form verified to boot + consume ?rescue=.
            onClick={() => {
              window.location.assign(`${import.meta.env.BASE_URL}?rescue=${encodeURIComponent(active.subjectId)}`)
            }}
          >
            ← <span className="hdt-chrome-label">回救急</span>
          </button>
        )}
        {toc.length > 0 && (
          <button
            type="button"
            className="hdt-toc-toggle"
            style={chromeBtnStyle}
            onClick={() => setTocOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={tocOpen}
          >
            ☰ 章節
          </button>
        )}
        <button type="button" className="hdt-print-btn" style={chromeBtnStyle} onClick={() => window.print()} aria-label="下載 PDF">
          ⬇ <span className="hdt-chrome-label">下載PDF</span>
        </button>
        <button ref={closeBtnRef} style={closeBtnStyle} onClick={close} aria-label="關閉講義">
          ✕
        </button>
      </header>

      {/* Reading progress (screen only; hidden in print). */}
      <div className="hdt-progress" aria-hidden="true">
        <div className="hdt-progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {/* ── Subject picker (only shows when >1 subject exists; future-proof) ── */}
      {subjects.length > 1 && (
        <div style={subjectRowStyle} className="neurons-chip-row neurons-chip-row--scroll">
          {subjects.map((s) => (
            <button
              key={s.subjectId}
              type="button"
              aria-pressed={s.subjectId === active?.subjectId}
              style={{ ...subjectBtnStyle, ...(s.subjectId === active?.subjectId ? subjectBtnActiveStyle : null) }}
              // Manually switching subject clears a stale unavailable note (it belongs to the deep-
              // linked leaf, not the newly-picked subject). Kept off a subjectId effect so it can't
              // clobber the deep-link effect's set on first mount (same-commit ordering).
              onClick={() => {
                setSubjectId(s.subjectId)
                setLeafUnavailable(false)
              }}
            >
              {s.subjectId}
            </button>
          ))}
        </div>
      )}

      {/* ── Layout: left sidebar TOC (desktop) + internal scroll container ── */}
      <div className="hdt-layout">
        {toc.length > 0 && (
          <aside className="hdt-sidebar">
            <nav aria-label="章節導覽">
              <TocList toc={toc} activeId={activeSectionId} onJump={jumpTo} />
            </nav>
          </aside>
        )}

        <div ref={scrollRef} className="hdt-scroll">
          {!data ? (
            <p style={loadingStyle}>載入講義中…</p>
          ) : !active ? (
            <p style={loadingStyle}>目前尚無講義內容。</p>
          ) : (
            <div className="hdt-content" style={contentWrapStyle}>
              <div style={introNoteStyle}>
                這是<b>教學型考前講義</b>：第一次唸也看得懂，依各科組織／系統分區整理高頻重點，適合考前一週系統複習。
                依歷屆出現頻率收斂 —— 頻率高 ≠ 今年一定考。
              </div>
              {leafUnavailable && (
                <div className="hdt-leaf-unavailable" role="status">
                  <span>這個單元暫無對應的講義段落，可改讀整科講義。</span>
                  <button
                    type="button"
                    className="hdt-leaf-unavailable__cta"
                    onClick={() => {
                      setLeafUnavailable(false)
                      scrollRef.current?.scrollTo({ top: 0 })
                    }}
                  >
                    開啟該科講義
                  </button>
                </div>
              )}
              {/* Authored, build-trusted teaching HTML split into region blocks so a per-chapter
                  quiz CTA can be React-rendered after each mapped chapter (no input; cram trust model). */}
              {regions.map((r) => (
                <div key={r.id} className="hdt-region-block">
                  <div dangerouslySetInnerHTML={{ __html: r.html }} />
                  {quizByRegion.has(r.id) ? (
                    <button type="button" className="hdt-quiz-cta" onClick={() => openChapterQuiz(r.id)}>
                      <EmojiIcon char="📝" size={13} decorative /> {quizByRegion.get(r.id)!.memberRegionIds.length === 1 ? '測驗本區' : '測驗本章'}
                    </button>
                  ) : signpostByRegion.has(r.id) ? (
                    <button
                      type="button"
                      className="hdt-quiz-signpost"
                      onClick={() => jumpTo(signpostByRegion.get(r.id)!.targetRegionId)}
                    >
                      本節題目併入下方「{signpostByRegion.get(r.id)!.label}」整章測驗 →
                    </button>
                  ) : null}
                </div>
              ))}
              <footer style={creditStyle}>
                內容依歷屆考題（考選部）與陽明國考考古題小組詳解（CC-BY-NC）整理彙編；教學脈絡為輔助說明。
              </footer>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile FAB (opens the same drawer as the header toggle) ── */}
      {toc.length > 0 && (
        <button
          type="button"
          className="hdt-fab"
          onClick={() => setTocOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={tocOpen}
          aria-label="章節導覽"
        >
          ☰ 章節
        </button>
      )}

      {/* ── TOC drawer (tablet + phone) ── */}
      {tocOpen && (
        <div className="hdt-drawer" role="dialog" aria-modal="true" aria-label="章節導覽">
          <div className="hdt-drawer__backdrop" onClick={() => setTocOpen(false)} />
          <div className="hdt-drawer__panel" ref={drawerRef}>
            <div className="hdt-drawer__head">
              <span>章節</span>
              <button type="button" style={closeBtnStyle} onClick={() => setTocOpen(false)} aria-label="關閉章節導覽">
                ✕
              </button>
            </div>
            <nav aria-label="章節導覽">
              <TocList
                toc={toc}
                activeId={activeSectionId}
                onJump={(id) => {
                  jumpTo(id)
                  setTocOpen(false)
                }}
              />
            </nav>
          </div>
        </div>
      )}

      {/* Chapter practice quiz — existing QuizModal in practice mode (no progression). */}
      {quizPool && <QuizModal pool={quizPool} practice creditCramRescue onClose={() => setQuizPool(null)} />}
    </div>,
    document.body,
  )
}

/** Chapter nav list — shared by the desktop sidebar and the tablet/phone drawer. Hoisted to module
 *  scope so scroll-spy `activeId` changes reconcile the <li>s instead of remounting the whole tree. */
function TocList({
  toc,
  activeId,
  onJump,
}: {
  toc: HandoutTocEntry[]
  activeId: string | null
  onJump: (id: string) => void
}): JSX.Element {
  return (
    <ul className="hdt-toc-list">
      {toc.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            className="hdt-toc-item"
            aria-current={t.id === activeId ? 'true' : undefined}
            onClick={() => onJump(t.id)}
          >
            {t.title}
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── scene chrome (warm pixel-tan base, matching SpeedReviewPage; green handout accents) ──
const GREEN = '#6a8c3f' // 解剖學 anchor color
const GREEN_DK = '#4c6a2b'

const sceneStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  right: 'var(--pdf-panel-width, 0px)',
  background: '#f3ecd8',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.7rem 1rem',
  borderBottom: `2px solid ${GREEN}`,
  background: '#eef2e2',
}
const titleStyle: React.CSSProperties = { fontFamily: 'var(--font-pixel-cjk)', fontWeight: 700, color: GREEN_DK, fontSize: '1rem' }
const betaChipStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: '#fff',
  background: GREEN,
  borderRadius: 999,
  padding: '0.08rem 0.45rem',
}
const subjectChipStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: GREEN_DK,
  border: `1px solid ${GREEN}`,
  borderRadius: 6,
  padding: '0.1rem 0.5rem',
}
const chromeBtnStyle: React.CSSProperties = {
  background: '#fbfdf6',
  border: `1px solid ${GREEN}`,
  color: GREEN_DK,
  borderRadius: 6,
  padding: '0.2rem 0.6rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-pixel-cjk)',
  whiteSpace: 'nowrap',
}
const closeBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  color: GREEN_DK,
  cursor: 'pointer',
  lineHeight: 1,
}
// Layout lives in `.neurons-chip-row` so the ≤768px scroll-rail wins (up to 11
// subject buttons → one scrollable nav row instead of wrapping to ~3 rows).
const subjectRowStyle: React.CSSProperties = {
  gap: '0.4rem',
  padding: '0.5rem 1rem 0',
}
const subjectBtnStyle: React.CSSProperties = {
  border: `1px solid ${GREEN}`,
  background: '#fbfdf6',
  color: GREEN_DK,
  borderRadius: 6,
  padding: '0.25rem 0.7rem',
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-pixel-cjk)',
}
const subjectBtnActiveStyle: React.CSSProperties = { background: GREEN, color: '#fff' }
const contentWrapStyle: React.CSSProperties = {
  maxWidth: 780,
  margin: '0 auto',
  padding: '1rem 1.1rem 4rem',
}
const introNoteStyle: React.CSSProperties = {
  fontSize: '0.84rem',
  color: '#5a4a2f',
  background: '#eef2e2',
  border: `1px solid ${GREEN}`,
  borderRadius: 8,
  padding: '0.6rem 0.8rem',
  marginBottom: '1.2rem',
  lineHeight: 1.6,
  fontFamily: 'var(--font-legible)',
}
const creditStyle: React.CSSProperties = {
  marginTop: '2rem',
  fontSize: '0.74rem',
  color: '#a08a5e',
  lineHeight: 1.6,
  fontFamily: 'var(--font-legible)',
  borderTop: '1px dashed #d8c8a0',
  paddingTop: '0.8rem',
}
const loadingStyle: React.CSSProperties = { margin: '2rem auto', textAlign: 'center', color: '#8c7a55' }

// ── CSS for layout / nav / print + the authored teaching HTML (scoped under .hdt-scene) ──
const SCENE_CSS = `
/* Body reading text = legible (Noto Sans TC), aligned with the quiz/詳解 exam text. Headings below
   override back to the pixel font. (The authored content lives in .hdt-content, not an <article>.) */
.hdt-content { font-family: var(--font-legible); color: #33301f; line-height: 1.75; font-size: 0.95rem; }

/* progress bar */
.hdt-progress { height: 3px; background: #e0d7bf; flex: 0 0 auto; }
.hdt-progress__bar { height: 100%; background: ${GREEN}; transition: width 0.1s linear; }

/* two-column layout — min-height:0 is required so nested flex children can shrink & scroll */
.hdt-layout { flex: 1; min-height: 0; display: flex; }
.hdt-sidebar {
  flex: 0 0 248px; overflow-y: auto; border-right: 1px solid #d8c8a0; background: #f7f3e4;
  padding: 0.75rem 0.7rem;
}
.hdt-scroll { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* TOC list (shared by sidebar + drawer) */
.hdt-toc-list { list-style: none; margin: 0; padding: 0; }
.hdt-toc-item {
  width: 100%; display: block; text-align: left; border: 0; border-radius: 6px; background: transparent;
  color: ${GREEN_DK}; padding: 0.42rem 0.55rem; font: 0.86rem/1.35 var(--font-legible); cursor: pointer;
}
.hdt-toc-item:hover { background: #ecf0dd; }
.hdt-toc-item[aria-current='true'] { background: #e3ead2; color: #2f4618; font-weight: 700; }

/* mobile/tablet-only chrome */
.hdt-toc-toggle { display: none; }
.hdt-fab { display: none; }

/* region blocks + quiz CTA */
.hdt-region-block { margin: 0; }
.hdt-quiz-cta {
  display: inline-flex; align-items: center; gap: 0.3rem; margin: 0.2rem 0 2.4rem;
  border: 1px solid ${GREEN}; background: ${GREEN}; color: #fff; border-radius: 8px;
  padding: 0.5rem 1.1rem; font: 700 0.9rem/1 var(--font-legible); cursor: pointer;
}
.hdt-quiz-cta:hover { background: ${GREEN_DK}; }
.hdt-quiz-signpost {
  display: inline-block; margin: 0.2rem 0 2.4rem; border: 0; background: transparent;
  color: #8a7a55; font: 0.82rem/1.4 var(--font-legible); cursor: pointer; text-align: left;
  padding: 0.3rem 0; border-bottom: 1px dashed #cbbd93;
}
.hdt-quiz-signpost:hover { color: ${GREEN_DK}; border-bottom-color: ${GREEN}; }

.hdt-scene .hdt-region { scroll-margin-top: 8px; margin: 0 0 2.2rem; }
/* Transient deep-link landing cue (add-neurons-handout-rescue-deeplink): a brief highlight that
   fades on its own; removed after 2s in JS. Reduced-motion users still get the (static) fade. */
.hdt-scene .hdt-region--landed { animation: hdt-land 2s ease-out; border-radius: 8px; }
@keyframes hdt-land { from { background: rgba(216, 195, 154, 0.55); } to { background: transparent; } }
@media print { .hdt-scene .hdt-region--landed { animation: none; background: transparent; } }
.hdt-scene .hdt-region-block:first-child .hdt-region__head { margin-top: 0; }
.hdt-scene .hdt-region__head {
  font-family: var(--font-pixel-cjk); font-size: 1.15rem; color: #fff; background: ${GREEN};
  border-radius: 8px; padding: 0.5rem 0.8rem; margin: 1.6rem 0 0.9rem; font-weight: 700;
}
.hdt-scene .hdt-intro {
  background: #f7f3e4; border-left: 4px solid ${GREEN}; border-radius: 0 6px 6px 0;
  padding: 0.55rem 0.8rem; margin: 0 0 1rem; color: #4a4028; font-size: 0.9rem;
}
.hdt-scene .hdt-topic { margin: 0 0 1.3rem; scroll-margin-top: 8px; }
.hdt-scene .hdt-topic > h3 { font-family: var(--font-pixel-cjk); font-size: 1rem; color: ${GREEN_DK}; margin: 1.1rem 0 0.35rem; font-weight: 700; }
/* Reverse link「本單元猜題」(neurons-unit-correspondence) — a subtle text-button appended at the end
   of a topic that has a matching 押題; injected imperatively (lives inside dangerouslySetInnerHTML). */
.hdt-scene .hdt-cram-link {
  display: inline-block; margin: 0.1rem 0 0.4rem; border: 0; background: transparent;
  color: ${GREEN_DK}; font: 700 0.8rem/1.4 var(--font-legible); cursor: pointer;
  padding: 0.15rem 0; border-bottom: 1px dashed ${GREEN};
}
.hdt-scene .hdt-cram-link:hover { color: ${GREEN}; border-bottom-style: solid; }
/* Inline unavailable note + escape hatch for a ?leaf= with no anchor/region (never region 0). */
.hdt-scene .hdt-leaf-unavailable {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  background: #fbf4dd; border: 1px solid #d9b64e; border-radius: 8px;
  padding: 0.55rem 0.8rem; margin: 0 0 1.2rem; color: #6b5d3a; font-size: 0.86rem;
  font-family: var(--font-legible); line-height: 1.6;
}
.hdt-scene .hdt-leaf-unavailable__cta {
  border: 1px solid ${GREEN}; background: ${GREEN}; color: #fff; border-radius: 6px;
  padding: 0.3rem 0.7rem; font: 700 0.8rem/1 var(--font-legible); cursor: pointer; white-space: nowrap;
}
.hdt-scene .hdt-leaf-unavailable__cta:hover { background: ${GREEN_DK}; }
.hdt-scene .hdt-teach { margin: 0 0 0.5rem; color: #453d29; }
.hdt-scene h3.hdt-h { font-family: var(--font-pixel-cjk); font-size: 0.98rem; color: ${GREEN_DK}; margin: 1.2rem 0 0.45rem; font-weight: 700; }
.hdt-scene ul.hdt-must { margin: 0.2rem 0 0.6rem; padding-left: 1.25rem; }
.hdt-scene ul.hdt-must > li { margin: 0.3rem 0; }
.hdt-scene ul.hdt-must > li > b { color: ${GREEN_DK}; }
.hdt-scene cite {
  margin-left: 0.35em; font-size: 0.72em; color: #a08a5e; font-style: normal;
  vertical-align: super; white-space: nowrap;
}
/* 考選部-vs-國際教科書 divergence note (kept 考選部 answer + flagged textbook difference) */
.hdt-scene .hdt-intl {
  display: block; margin: 0.3rem 0 0.7rem; padding: 0.3rem 0.6rem;
  font-size: 0.8rem; line-height: 1.5; color: #6b5d3a;
  background: #fbf4dd; border-left: 3px solid #d9b64e; border-radius: 3px;
}
.hdt-scene table.hdt-tbl {
  width: 100%; border-collapse: collapse; margin: 0.4rem 0 1rem; font-size: 0.86rem;
  display: block; overflow-x: auto;
}
.hdt-scene table.hdt-tbl thead th {
  background: #e3ead2; color: ${GREEN_DK}; text-align: left; padding: 0.35rem 0.55rem;
  border-bottom: 2px solid ${GREEN}; white-space: nowrap;
}
.hdt-scene table.hdt-tbl td {
  padding: 0.35rem 0.55rem; border-bottom: 1px solid #e7ddc2; vertical-align: top; color: #33301f;
}
.hdt-scene table.hdt-tbl tbody tr:nth-child(even) { background: #faf6ea; }
.hdt-scene table.hdt-vs thead th:first-child { color: #7a6a45; }
.hdt-scene b { color: #2a2618; }

/* drawer (tablet + phone) */
.hdt-drawer { position: fixed; inset: 0; z-index: 1100; }
.hdt-drawer__backdrop { position: absolute; inset: 0; background: rgba(40,36,24,0.42); }
.hdt-drawer__panel {
  position: absolute; top: 0; left: 0; bottom: 0; width: min(280px, 82vw); background: #f7f3e4;
  border-right: 1px solid #d8c8a0; padding: 0.75rem 0.8rem; overflow-y: auto;
  box-shadow: 2px 0 16px rgba(40,36,24,0.25);
}
.hdt-drawer__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; color: ${GREEN_DK}; font-weight: 700; }
.hdt-drawer__head > button { margin-left: 0; }

/* ≤1023px: hide sidebar, expose the header 章節 toggle */
@media (max-width: 1023px) {
  .hdt-sidebar { display: none; }
  .hdt-toc-toggle { display: inline-flex; }
}

/* <768px: use a bottom-sheet drawer + a floating FAB instead of the header toggle */
@media (max-width: 767px) {
  .hdt-toc-toggle { display: none; }
  /* Header chrome converges so the no-wrap row stops clipping off-screen on phones:
     drop the beta + subject chips (subject is in the picker/content), collapse the
     回救急 / 下載PDF buttons to icon-only, and let the title ellipsis if needed. The
     close (✕) keeps its marginLeft:auto and stays visible. */
  .hdt-header { gap: 0.4rem; }
  .hdt-beta, .hdt-subject { display: none; }
  .hdt-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hdt-chrome-label { display: none; }
  .hdt-fab {
    display: inline-flex; align-items: center; gap: 0.3rem; position: fixed; right: 14px; bottom: 16px;
    z-index: 1050; border: none; background: ${GREEN}; color: #fff; border-radius: 999px;
    padding: 0.6rem 1rem; font: 700 0.86rem/1 var(--font-legible); cursor: pointer;
    box-shadow: 0 4px 14px rgba(40,36,24,0.3);
  }
  .hdt-drawer__panel {
    top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 70vh; border-right: none;
    border-top: 2px solid ${GREEN}; border-radius: 14px 14px 0 0; box-shadow: 0 -2px 16px rgba(40,36,24,0.25);
  }
  .hdt-content { padding: 0.8rem 0.85rem 5rem; font-size: 0.93rem; line-height: 1.72; }
  .hdt-scene table.hdt-tbl { font-size: 0.8rem; }
}

/* ≥1024px: the drawer is never used (sidebar is persistent) */
@media (min-width: 1024px) { .hdt-drawer { display: none; } }

/* ── one-click PDF: restore the fixed internally-scrolling scene to normal flow ── */
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  .hdt-scene, .hdt-scene * { visibility: visible; }
  .hdt-scene {
    position: static !important; inset: auto !important; right: auto !important; z-index: auto !important;
    display: block !important; background: #fff !important;
  }
  .hdt-scene header, .hdt-sidebar, .hdt-toc-toggle, .hdt-print-btn, .hdt-fab, .hdt-drawer,
  .hdt-progress, .hdt-quiz-cta, .hdt-quiz-signpost, .hdt-cram-link, .hdt-leaf-unavailable { display: none !important; }
  .hdt-layout, .hdt-scroll { display: block !important; overflow: visible !important; height: auto !important; min-height: 0 !important; }
  .hdt-content { max-width: none !important; margin: 0 !important; padding: 0 !important; font-size: 10.5pt; line-height: 1.55; color: #111 !important; }
  .hdt-scene .hdt-region { break-inside: auto; page-break-inside: auto; margin-bottom: 12pt; }
  .hdt-scene .hdt-region__head {
    break-after: avoid; page-break-after: avoid; color: #111 !important;
    background: #e8efd8 !important; border: 1px solid #9ab36e;
  }
  .hdt-scene table.hdt-tbl { display: table !important; width: 100% !important; overflow: visible !important; font-size: 8.5pt; break-inside: avoid; }
  .hdt-scene thead { display: table-header-group; }
  .hdt-scene tr, .hdt-scene li, .hdt-scene p { break-inside: avoid; }
  .hdt-scene cite { color: #555 !important; }
}
`
