/**
 * CramPage — /cram 考前猜題 (add-neurons-cram-tab; UX refined in refine-neurons-cram-tab-ux).
 *
 * Layout (top→bottom): download-PDF row → honesty disclaimer + methodology + 「統計至 115-1」 stamp
 * → single-select subject filter chips (grouped 醫學一 / 醫學二; first subject auto-selected) →
 * selected subject panel = 速看重點 blocks (shown directly, first) → section practice CTA →
 * 考古清單 (concept-recurrence ranking, honest raw counts + tier) with an evidence-first drawer that
 * drills to real source questions and offers a low-friction practice on-ramp (design D7).
 *
 * The user-facing label is 考古; the internal cram.json field is still `push` (unchanged).
 * Data is lazy-fetched cram.json (useCram); questions resolve from the loaded ContentPack.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentPack, Question } from '@study-rpg/core'
import type { CramBlock, CramPushItem } from '@study-rpg/content-neurons-tw'
import { useCram } from '../lib/cram'
import { useQuestionHistory } from '../lib/services/question-history'
import { getTodayPlanSnapshotIds } from '../lib/services/prescription'
import { orderPracticePool } from '../lib/cram-practice-pool'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { QuizModal } from '../components/QuizModal'
import { EmojiIcon } from '../components/EmojiIcon'
// 考前中心 hub (add-neurons-exam-prep-hub): rescue status strip + in-place RescueScene.
import { useConceptTags } from '../lib/concept-tags'
import { useRescuePlans } from '../lib/services/rescue/rescue-store'
import { useRescueChips } from '../lib/services/rescue/useRescueChips'
import { RescueScene } from '../components/RescueScene'

const STAT_STAMP = '統計至 115-1'
const SOURCE_PREVIEW_CAP = 6

// Tier presentation — honest labels; 經典但降溫 explicitly flagged as cooling.
const TIER_STYLE: Record<string, { color: string; bg: string; icon: string; suffix?: string }> = {
  常青必掃: { color: '#7a5410', bg: '#f3dfa6', icon: '🌲' },
  穩定考點: { color: '#5a4a33', bg: '#e6dcc2', icon: '◆' },
  近年新寵: { color: '#2f6b45', bg: '#d5ecd9', icon: '✨' },
  經典但降溫: { color: '#6a6a6a', bg: '#e4e4e4', icon: '❄️', suffix: '降溫' },
}

/** Render build-trusted inline HTML (sanitized to <b> only in build-cram). */
function Inline({ html }: { html: string }): JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export function CramPage({ pack }: { pack: ContentPack }): JSX.Element {
  const navigate = useNavigate()
  const cram = useCram()
  const questionById = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of pack.questions) m.set(q.id, q)
    return m
  }, [pack.questions])

  // `?subject=` / `?push=` deep-link from the handout「本單元猜題」reverse link (neurons-unit-
  // correspondence): auto-select the subject + open that leaf's 押題 drawer, resolved synchronously so
  // the first render already targets the right subject. Read-only URL query; zero persistent state.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('subject'),
  )
  const [drawerFor, setDrawerFor] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const p = new URLSearchParams(window.location.search)
    const subj = p.get('subject')
    const push = p.get('push')
    return subj && push ? `${subj}::${push}` : null // `${subjectId}::${leafId}`
  })
  const pushScrollConsumedRef = useRef(false)
  const [methodOpen, setMethodOpen] = useState(false)
  const [practice, setPractice] = useState<{ pool: Question[]; label: string } | null>(null)

  // Coverage imprint: a 考古 item is "已固化過" when ≥1 of its source questions is
  // currently answered correctly (pure derived from questionHistory; zero schema).
  const history = useQuestionHistory()
  const consolidatedIds = useMemo(
    () => new Set(history.filter((h) => h.lastResult === 'correct').map((h) => h.questionId)),
    [history],
  )

  // 考前中心 hub rescue status strip: same per-family chip signal as the homepage (shared
  // selector), and an in-place RescueScene overlay so 可點進場 opens the SAME plan without
  // leaving /cram or route-izing the overlay (add-neurons-exam-prep-hub, design D2/D3).
  const conceptTags = useConceptTags()
  const rescuePlans = useRescuePlans()
  const rescueChipByFamily = useRescueChips(rescuePlans, pack.questions, conceptTags, history)
  const [rescueOpen, setRescueOpen] = useState(false)
  const [rescueInitialFamily, setRescueInitialFamily] = useState<string | undefined>(undefined)
  // startInSetup drives the「＋ 新增計畫」add-plan entry (fold-rescue-list-into-exam-prep-hub).
  const [rescueStartInSetup, setRescueStartInSetup] = useState(false)
  const openRescue = (familyId?: string): void => {
    setRescueInitialFamily(familyId)
    setRescueStartInSetup(false)
    setRescueOpen(true)
  }
  // Hub「＋ 新增計畫」: open RescueScene straight into add-new-plan setup (no initial family).
  const openRescueSetup = (): void => {
    setRescueInitialFamily(undefined)
    setRescueStartInSetup(true)
    setRescueOpen(true)
  }
  // Reset the load-bearing startInSetup flag on close: a stale `true` when the strip has fallen
  // back to the empty-state CTA (last plan abandoned cross-device) would skip the untouched-setup
  // B1 protection on the next open. (Family-chip opens are immune via RescueScene's !initialFamilyId guard.)
  const closeRescue = (): void => {
    setRescueOpen(false)
    setRescueStartInSetup(false)
  }
  // Today's prescription snapshot ids (read-only; null when no plan yet) — used to
  // serve snapshot questions first in cram practice so the prescription payoff fires.
  const [snapshotIds, setSnapshotIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    let alive = true
    getTodayPlanSnapshotIds().then((ids) => {
      if (alive) setSnapshotIds(ids)
    })
    return () => {
      alive = false
    }
  }, [])

  // Scroll the deep-linked 押題 into view once (after cram loads + the subject panel renders). Keyed by
  // the `push-<leafId>` li id; guarded so it fires once. Deferred one paint so the 62-item list + the
  // auto-opened evidence drawer have laid out before we measure (an eager scroll lands short).
  useEffect(() => {
    if (pushScrollConsumedRef.current || !cram || !drawerFor) return
    const leaf = drawerFor.split('::')[1]
    if (!leaf || !document.getElementById(`push-${leaf}`)) return
    pushScrollConsumedRef.current = true
    const t = window.setTimeout(() => {
      document.getElementById(`push-${leaf}`)?.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 250)
    return () => window.clearTimeout(t)
  }, [cram, drawerFor])

  if (!cram) {
    return (
      <div style={pageStyle}>
        <p style={loadingStyle}>載入考前猜題資料中…</p>
      </div>
    )
  }

  const resolve = (ids: string[]): Question[] =>
    ids.map((id) => questionById.get(id)).filter((q): q is Question => q != null)

  // Auto-select the first subject on entry; no accordion, one subject shown at a time.
  const activeId = selectedSubject ?? cram.books[0]?.subjects[0]?.subjectId ?? null
  const activeBook = cram.books.find((b) => b.subjects.some((s) => s.subjectId === activeId))
  const active = activeBook?.subjects.find((s) => s.subjectId === activeId) ?? null

  // subjectId → display name, for the rescue status strip chips (cheap; runs post early-return).
  const subjectNameById = new Map<string, string>()
  for (const b of cram.books) for (const s of b.subjects) subjectNameById.set(s.subjectId, s.name)

  return (
    <div style={pageStyle}>
      {/* ── 救急狀態條: reflects active rescue plans; click a chip to open the SAME RescueScene
           in place (add-neurons-exam-prep-hub). No active plan → a create-rescue entry. ── */}
      <div style={rescueStripStyle}>
        {rescuePlans.length > 0 ? (
          <>
            <span style={rescueStripLabelStyle}>
              <EmojiIcon char="⏱️" size={14} decorative /> 考前救急
            </span>
            {rescuePlans.map((plan) => {
              const chip = rescueChipByFamily.get(plan.familyId)
              const countdown = chip ? (chip.d <= 0 ? '考試日' : `D-${chip.d}`) : ''
              return (
                <button
                  key={plan.familyId}
                  type="button"
                  style={rescueStripChipStyle}
                  onClick={() => openRescue(plan.familyId)}
                  title="開啟今日佇列"
                >
                  <span style={rescueStripStrongStyle}>{subjectNameById.get(plan.familyId) ?? plan.familyId}</span>
                  {chip && (
                    <span style={rescueStripMetaStyle}>
                      {countdown} · RescueScore {chip.score}
                    </span>
                  )}
                  <span style={rescueStripCtaStyle}>今日佇列 →</span>
                </button>
              )
            })}
            {/* Low-key「＋ 新增計畫」add affordance — shown only below the 5-plan hard cap
                (the cap is enforced by absence). Opens rescue setup directly (add-new-plan,
                preselecting a subject without a plan), not a plan-list overlay. */}
            {rescuePlans.length < 5 && (
              <button
                type="button"
                style={rescueStripAddBtnStyle}
                onClick={openRescueSetup}
                title="新增一科考前救急計畫"
              >
                ＋ 新增計畫
              </button>
            )}
          </>
        ) : (
          <button type="button" style={rescueStripEmptyBtnStyle} onClick={() => openRescue()}>
            <EmojiIcon char="⏱️" size={14} decorative /> 建立考前救急 —— 鎖科目、綁考試日，排最能救分的題
          </button>
        )}
      </div>

      {/* ── Persistent honesty header ── */}
      <header style={disclaimerStyle}>
        <p style={disclaimerLineStyle}>
          此清單依歷屆<b>出現頻率</b>排序，供考前收斂用。
          <b>頻率高 ≠ 今年一定考</b>；請當作投報率參考，不是預測。
        </p>
        <div style={disclaimerMetaStyle}>
          <button type="button" style={methodBtnStyle} onClick={() => setMethodOpen((v) => !v)}>
            ⓘ 怎麼算的 {methodOpen ? '▴' : '▾'}
          </button>
          <span style={stampStyle}>{STAT_STAMP}</span>
        </div>
        {methodOpen && (
          <div style={methodBodyStyle}>
            考古排序＝該概念在 <b>23 次考試</b>（104–114 各兩次 + 115 第一次）中出現過的<b>不同次數</b>
            （sitting-breadth，同一次考多題只算一次，上限 23）。分母固定 23，跨概念題不會灌水。
            「共 N 題」是次要強度參考，可能超過真實題數（跨概念題重複計）。
            速看重點由歷屆真實考題 + 陽明國考考古題小組詳解壓縮而成，每一條都可回溯真題。
          </div>
        )}
      </header>

      {/* ── Subject card grid (single-select picker; each card carries a 講義(beta) mini +
           猜題 access; selecting surfaces that subject's 猜題 panel directly below) ── */}
      <div role="group" aria-label="科目">
        {cram.books.map((book) => (
          <div key={book.book} style={subjectGroupStyle}>
            <span style={chipGroupLabelStyle}>{book.book}</span>
            <div style={subjectGridStyle}>
              {book.subjects.map((s) => {
                const isActive = s.subjectId === activeId
                const chip = rescueChipByFamily.get(s.subjectId)
                return (
                  <div
                    key={s.subjectId}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    style={{ ...subjectTileStyle, ...(isActive ? subjectTileActiveStyle : null) }}
                    onClick={() => setSelectedSubject(s.subjectId)}
                    onKeyDown={(e) => {
                      // Only the tile itself selects on Enter/Space — let keydown from the nested
                      // 講義(beta) button reach its own native activation (keydown bubbles; without
                      // this guard, focusing 講義 + Enter would preventDefault the button AND select
                      // the subject instead of opening the handout).
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedSubject(s.subjectId)
                      }
                    }}
                  >
                    <div style={tileHeadStyle}>
                      <span style={tileNameStyle}>{s.name}</span>
                      {chip && (
                        <span style={tileRescueChipStyle}>
                          <EmojiIcon char="⏱️" size={11} decorative /> {chip.d <= 0 ? '考試日' : `D-${chip.d}`}
                        </span>
                      )}
                    </div>
                    <span style={tileMetaStyle}>考古 {s.push.length} · 速看 {s.blocks.length}</span>
                    <button
                      type="button"
                      style={tileHandoutMiniStyle}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/cram/handout?subject=${encodeURIComponent(s.subjectId)}`)
                      }}
                    >
                      <EmojiIcon char="📖" size={13} decorative /> 講義(beta)
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Selected subject panel: 速看重點 → 練幾題 CTA → 考古清單 ── */}
      {active && (
        <article style={subjectCardStyle}>
          <div style={subjectBodyStyle}>
            <div style={panelHeaderStyle}>
              <span style={subjectNameStyle}>{active.name}</span>
              {activeBook && (
                <span style={bookNoteStyle}>{activeBook.book === '醫學一' ? '（上午卷）' : '（下午卷）'}</span>
              )}
              <span style={subjectCountChipStyle}>
                考古 {active.push.length} · 速看 {active.blocks.length}
              </span>
            </div>

            {/* 速看重點 (first, shown directly) */}
            {active.blocks.length > 0 && (
              <div style={blocksWrapStyle}>
                {active.blocks.map((b, i) => (
                  <CramBlockView
                    key={i}
                    block={b}
                    onOpenHandout={() => navigate(`/cram/handout?subject=${encodeURIComponent(active.subjectId)}`)}
                  />
                ))}
              </div>
            )}

            {/* One section-level practice CTA (D7 — single low-friction bridge), above 考古清單 */}
            <button
              type="button"
              style={sectionPracticeStyle}
              onClick={() => {
                const ids = active.push.flatMap((p) => p.sourceQuestionIds)
                const pool = orderPracticePool(resolve([...new Set(ids)]), snapshotIds)
                if (pool.length > 0) setPractice({ pool, label: `${active.name} 高頻概念` })
              }}
            >
              ▶ 用本章高頻概念練幾題
            </button>

            {/* 考古清單 (依重現度) */}
            <h3 style={sectionLabelStyle}>
              <EmojiIcon char="🎯" size={14} decorative /> 考古清單（依重現度）
            </h3>
            <ul style={pushListStyle}>
              {active.push.map((item) => {
                const dkey = `${active.subjectId}::${item.leafId}`
                const drawerOpen = drawerFor === dkey
                const tier = TIER_STYLE[item.tier] ?? TIER_STYLE['穩定考點']
                const covered = item.sourceQuestionIds.some((id) => consolidatedIds.has(id))
                const rchip = rescueChipByFamily.get(item.subjectId) // family rescue chip (if active plan)
                return (
                  <li key={item.leafId} id={`push-${item.leafId}`} style={pushItemStyle}>
                    <div style={pushRowStyle}>
                      <span style={pushZhStyle}>{item.zh}</span>
                      <span style={{ ...tierChipStyle, color: tier.color, background: tier.bg }}>
                        <EmojiIcon char={tier.icon} size={12} decorative />
                        {tier.suffix ? ` ${tier.suffix}` : ''} {item.tier}
                      </span>
                      {covered && <span style={coveredChipStyle}>✓ 已固化過</span>}
                      {/* Leaf-level deep-link to this unit's teaching handout (push is leaf-native). */}
                      <button
                        type="button"
                        style={pushHandoutBtnStyle}
                        onClick={() =>
                          navigate(
                            `/cram/handout?subject=${encodeURIComponent(item.subjectId)}&leaf=${encodeURIComponent(item.leafId)}`,
                          )
                        }
                      >
                        <EmojiIcon char="📖" size={12} decorative /> 看講義
                      </button>
                      {/* leaf context toolbar (cram-side, add-neurons-exam-prep-hub): 看講義 (above)
                          + 練題 + 救急狀態 for this unit — the family-level rescue chip only, never
                          per-leaf 戰情圖 band into content. Reuses existing deep-links / practice. */}
                      <button
                        type="button"
                        style={leafToolBtnStyle}
                        onClick={() => {
                          const pool = orderPracticePool(resolve(item.sourceQuestionIds), snapshotIds)
                          if (pool.length > 0) setPractice({ pool, label: item.zh })
                        }}
                      >
                        <EmojiIcon char="✏️" size={12} decorative /> 練題
                      </button>
                      {rchip && (
                        <button
                          type="button"
                          style={leafRescueBtnStyle}
                          onClick={() => openRescue(item.subjectId)}
                        >
                          <EmojiIcon char="⏱️" size={12} decorative /> 救急 {rchip.d <= 0 ? '考試日' : `D-${rchip.d}`}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      style={countChipStyle}
                      aria-expanded={drawerOpen}
                      onClick={() => setDrawerFor(drawerOpen ? null : dkey)}
                    >
                      {item.sittingsTotal} 次考試出現 <b>{item.sittingBreadth}</b> 次
                      <span style={intensityStyle}> · 共 {item.questionCount} 題</span>
                      <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
                        {drawerOpen ? '▴ 收合' : '▾ 看題'}
                      </span>
                    </button>

                    {drawerOpen && (
                      <CramEvidenceDrawer
                        item={item}
                        questions={resolve(item.sourceQuestionIds)}
                        onPractice={(pool) => setPractice({ pool: orderPracticePool(pool, snapshotIds), label: item.zh })}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </article>
      )}

      {/* ── 五分鐘速看: first-class entry card below the subject grid. Cross-11-subject,
           zero-decision (no picker / no config) — open → swipe → out the door. ── */}
      <button type="button" style={fiveMinCardStyle} onClick={() => navigate('/cram/5min')}>
        <span style={fiveMinTitleStyle}>
          <EmojiIcon char="⏳" size={16} decorative /> 五分鐘速看版
        </span>
        <span style={fiveMinSubStyle}>進考場前，11 科最高投報率精華一頁掃完</span>
      </button>

      {/* ── A4 PDF downloads (sunk to the bottom) ── */}
      <div style={pdfSectionStyle}>
        <a href={`${import.meta.env.BASE_URL}content/neurons-tw/cram-pdf/考前速看-醫學一.pdf`} download style={downloadBtnStyle}>
          ⬇ 下載 醫學一 A4 PDF
        </a>
        <a href={`${import.meta.env.BASE_URL}content/neurons-tw/cram-pdf/考前速看-醫學二.pdf`} download style={downloadBtnStyle}>
          ⬇ 下載 醫學二 A4 PDF
        </a>
        <a href={`${import.meta.env.BASE_URL}content/neurons-tw/cram-pdf/考前速看-5分鐘.pdf`} download style={downloadBtnStyle}>
          ⬇ 下載 5 分鐘速看 一頁 PDF
        </a>
      </div>

      {/* Practice on-ramp — existing QuizModal in practice mode (no progression, wrong→錯題本→出征) */}
      {practice && (
        <QuizModal pool={practice.pool} practice preserveOrder creditCramRescue onClose={() => setPractice(null)} />
      )}

      {/* 考前救急 in place: same RescueScene overlay + same global plan store, mounted from the hub
          so the strip / leaf 救急 buttons open it without leaving /cram (add-neurons-exam-prep-hub).
          Only one RescueScene is visible at a time (/ and /cram never mount together). */}
      {rescueOpen && (
        <RescueScene
          pack={pack}
          initialFamilyId={rescueInitialFamily}
          startInSetup={rescueStartInSetup}
          onClose={closeRescue}
        />
      )}
    </div>
  )
}

/** 考古 evidence-first drawer: raw count + tier + recent-first read-only source mini-list + on-ramp. */
function CramEvidenceDrawer({
  item,
  questions,
  onPractice,
}: {
  item: CramPushItem
  questions: Question[]
  onPractice: (pool: Question[]) => void
}): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const preview = questions.slice(0, SOURCE_PREVIEW_CAP)
  return (
    <div style={drawerStyle}>
      <p style={drawerLeadStyle}>
        這個考點在 {item.sittingsTotal} 次考試中出現 <b>{item.sittingBreadth}</b> 次（{item.tier}）。以下為真實考題：
      </p>
      <ul style={sourceListStyle}>
        {preview.map((q) => {
          const open = expandedId === q.id
          return (
            <li key={q.id} style={sourceItemStyle}>
              <button type="button" style={sourceQBtnStyle} onClick={() => setExpandedId(open ? null : q.id)}>
                {open ? '▴' : '▾'} {q.id}
              </button>
              {open && (
                <div style={reviewWrapStyle}>
                  <QuestionReviewCard question={q} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {questions.length > preview.length && (
        <p style={moreNoteStyle}>還有 {questions.length - preview.length} 題（標此考點）</p>
      )}
      {/* Low-friction primary on-ramp — opens practice directly, no prompt/modal */}
      <button type="button" style={practiceCtaStyle} onClick={() => onPractice(questions)}>
        ▶ 答 1 題看看
      </button>
    </div>
  )
}

/** Render one 速看 CramBlock by kind. */
function CramBlockView({ block, onOpenHandout }: { block: CramBlock; onOpenHandout: () => void }): JSX.Element {
  return (
    <div style={blockStyle}>
      <h4 style={blockHeadingStyle}>{block.heading}</h4>
      {block.kind === 'kernel' && (
        <ul style={kernelListStyle}>
          {block.items.map((it, i) => (
            <li key={i} style={kernelItemStyle}>
              <Inline html={it.html} />
              {it.cite && <cite style={citeStyle}>{it.cite}</cite>}
            </li>
          ))}
        </ul>
      )}
      {block.kind === 'kw' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td style={kwKeyStyle}>{r.k}</td>
                <td style={cellStyle}><Inline html={r.v} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'disc' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          {block.cols.length > 0 && (
            <thead>
              <tr>
                {block.cols.map((c, i) => (
                  <th key={i} style={thStyle}><Inline html={c} /></th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} style={cellStyle}><Inline html={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'num' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td style={numLabelStyle}>{r.label}</td>
                <td style={cellStyle}><Inline html={r.value} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'skeleton' && (
        <div style={skelStyle}>
          {block.html.split('\n').map((line, i) => (
            <div key={i}><Inline html={line} /></div>
          ))}
        </div>
      )}
      {/* Subject-level (NOT unit-level) deep-link to the teaching handout: 速看 is a cross-concept
          discriminator table, so a single-leaf binding would give false precision (neurons-unit-
          correspondence D5). Muted footer link. */}
      <button type="button" style={blockHandoutLinkStyle} onClick={onOpenHandout}>
        <EmojiIcon char="📖" size={12} decorative /> 開啟本科講義
      </button>
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic; exam content uses --font-legible) ─────────────────────
const pageStyle: React.CSSProperties = { maxWidth: 960, margin: '1.5rem auto', padding: '0 1.25rem', fontFamily: 'var(--font-pixel-cjk)' }
const loadingStyle: React.CSSProperties = { textAlign: 'center', color: '#8c6d4a', padding: '2rem', fontFamily: 'var(--font-legible)' }
const disclaimerStyle: React.CSSProperties = { background: '#f4ecd8', border: '1px solid #c9ad7f', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem' }
const disclaimerLineStyle: React.CSSProperties = { margin: 0, fontSize: '0.82rem', color: '#4a3a22', lineHeight: 1.7, fontFamily: 'var(--font-pixel-cjk)' }
const disclaimerMetaStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }
const methodBtnStyle: React.CSSProperties = { border: '1px solid #c9ad7f', background: '#fff8e8', borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.76rem', cursor: 'pointer', color: '#7a5a2a', fontFamily: 'var(--font-legible)' }
const stampStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#8c6d4a', fontFamily: 'var(--font-legible)' }
const methodBodyStyle: React.CSSProperties = { marginTop: '0.5rem', fontSize: '0.78rem', color: '#4a3a22', lineHeight: 1.7, background: '#fff8e8', border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.55rem 0.7rem', fontFamily: 'var(--font-legible)' }
const chipGroupLabelStyle: React.CSSProperties = { fontSize: '0.76rem', color: '#5a3d1a', fontWeight: 700, marginRight: '0.2rem', whiteSpace: 'nowrap' }
const subjectCardStyle: React.CSSProperties = { border: '1px solid #c9ad7f', borderRadius: 8, marginBottom: '0.5rem', overflow: 'hidden', background: '#fffdf7' }
const subjectBodyStyle: React.CSSProperties = { padding: '0.6rem 0.8rem' }
const panelHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }
const subjectNameStyle: React.CSSProperties = { fontWeight: 700, fontSize: '0.95rem', color: '#4a3a22' }
const bookNoteStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#8c6d4a', fontWeight: 400, fontFamily: 'var(--font-legible)' }
const subjectCountChipStyle: React.CSSProperties = { fontSize: '0.7rem', color: '#8c6d4a', background: '#efe4cc', borderRadius: 999, padding: '0.05rem 0.5rem', fontFamily: 'var(--font-legible)' }
const sectionLabelStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.82rem', color: '#7a5410', margin: '0.2rem 0 0.5rem' }
const pushListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }
const pushItemStyle: React.CSSProperties = { border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.45rem 0.6rem', background: '#fff' }
const pushRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }
const pushZhStyle: React.CSSProperties = { fontSize: '0.88rem', color: '#2a2118', fontFamily: 'var(--font-legible)', fontWeight: 600 }
const tierChipStyle: React.CSSProperties = { fontSize: '0.7rem', borderRadius: 999, padding: '0.05rem 0.45rem', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
// 押題 → 講義 (leaf-level) + 速看 → 講義 (subject-level) deep-link affordances (neurons-unit-correspondence).
const pushHandoutBtnStyle: React.CSSProperties = { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', border: '1px solid #6a8c3f', background: '#eef4e2', color: '#4c6a2b', borderRadius: 999, padding: '0.1rem 0.55rem', cursor: 'pointer', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
const blockHandoutLinkStyle: React.CSSProperties = { marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', border: 0, background: 'transparent', color: '#4c6a2b', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-legible)', padding: '0.1rem 0', borderBottom: '1px dashed #6a8c3f' }
// Positive coverage imprint — shown only on covered items; never a count/%/denominator.
const coveredChipStyle: React.CSSProperties = { fontSize: '0.68rem', color: '#2f6b45', background: '#d5ecd9', border: '1px solid #a9d4b5', borderRadius: 999, padding: '0.05rem 0.4rem', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
const countChipStyle: React.CSSProperties = { marginTop: '0.35rem', border: '1px solid #d8c39a', background: '#f8f2e2', borderRadius: 6, padding: '0.15rem 0.5rem', fontSize: '0.76rem', color: '#5a4a33', cursor: 'pointer', fontFamily: 'var(--font-legible)', width: '100%', textAlign: 'left' }
const intensityStyle: React.CSSProperties = { color: '#a08a5a' }
const sectionPracticeStyle: React.CSSProperties = { marginTop: '0.6rem', marginBottom: '0.6rem', border: '1px solid #b58900', background: '#fff3d0', color: '#7a5410', borderRadius: 6, padding: '0.35rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const blocksWrapStyle: React.CSSProperties = { marginTop: '0.2rem', marginBottom: '0.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }
const blockStyle: React.CSSProperties = { border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.5rem 0.65rem', background: '#fffdf7' }
const blockHeadingStyle: React.CSSProperties = { fontSize: '0.84rem', color: '#7a5410', margin: '0 0 0.4rem' }
const kernelListStyle: React.CSSProperties = { margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const kernelItemStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#2a2118', lineHeight: 1.55, fontFamily: 'var(--font-legible)' }
const citeStyle: React.CSSProperties = { marginLeft: '0.4rem', fontSize: '0.7rem', color: '#a08a5a', fontStyle: 'normal' }
const tableWrapStyle: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-legible)' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.25rem 0.4rem', background: '#f0e6cd', color: '#5a4a33', borderBottom: '1px solid #d8c39a', fontSize: '0.76rem' }
const cellStyle: React.CSSProperties = { padding: '0.25rem 0.4rem', color: '#2a2118', borderBottom: '1px solid #efe4cc', verticalAlign: 'top', lineHeight: 1.5 }
const kwKeyStyle: React.CSSProperties = { ...cellStyle, color: '#7a5a2a', fontWeight: 600, whiteSpace: 'nowrap' }
const numLabelStyle: React.CSSProperties = { ...cellStyle, color: '#5a4a33' }
const skelStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#2a2118', lineHeight: 1.7, fontFamily: 'var(--font-legible)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }
const drawerStyle: React.CSSProperties = { marginTop: '0.4rem', borderTop: '1px dashed #d8c39a', paddingTop: '0.4rem' }
const drawerLeadStyle: React.CSSProperties = { margin: '0 0 0.4rem', fontSize: '0.78rem', color: '#5a4a33', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
const sourceListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const sourceItemStyle: React.CSSProperties = { fontSize: '0.78rem' }
const sourceQBtnStyle: React.CSSProperties = { border: '1px solid #d8c39a', background: '#f8f2e2', borderRadius: 4, padding: '0.1rem 0.45rem', fontSize: '0.74rem', color: '#5a4a33', cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }
const reviewWrapStyle: React.CSSProperties = { marginTop: '0.35rem', border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.5rem 0.6rem', background: '#fff' }
const moreNoteStyle: React.CSSProperties = { margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#a08a5a', fontFamily: 'var(--font-legible)' }
const practiceCtaStyle: React.CSSProperties = { marginTop: '0.5rem', border: '1px solid #b58900', background: '#b58900', color: '#fff', borderRadius: 6, padding: '0.35rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const downloadBtnStyle: React.CSSProperties = { border: '1px solid #8c6d4a', background: '#f4ecd8', color: '#5a3d1a', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.82rem', textDecoration: 'none', fontFamily: 'var(--font-pixel-cjk)' }

// ─── 考前中心 hub styles (add-neurons-exam-prep-hub) ─────────────────────────────────────────────
// Rescue strip mirrors the homepage RescueChip palette (#fdf2e0 / #d4a04d / #8a5a1f)
// so 考前救急 reads the same across homepage cards and the hub (add-neurons-exam-prep-hub).
const rescueStripStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', padding: '0.5rem 0.6rem', background: '#fbf3e6', border: '1px solid #e0c088', borderRadius: 8 }
const rescueStripLabelStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 700, color: '#8a5a1f', marginRight: '0.2rem', fontFamily: 'var(--font-pixel-cjk)' }
const rescueStripChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', border: '1px solid #d4a04d', background: '#fdf2e0', color: '#5a3f29', borderRadius: 8, padding: '0.25rem 0.6rem', cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const rescueStripStrongStyle: React.CSSProperties = { fontWeight: 800, color: '#8a5a1f' }
const rescueStripMetaStyle: React.CSSProperties = { fontSize: '0.72rem', color: '#8c7a55', fontVariantNumeric: 'tabular-nums' }
const rescueStripCtaStyle: React.CSSProperties = { fontWeight: 700, color: '#d4a04d' }
const rescueStripEmptyBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #d4a04d', background: '#fdf2e0', color: '#8a5a1f', borderRadius: 999, padding: '0.3rem 0.75rem', cursor: 'pointer', fontFamily: 'var(--font-legible)', textAlign: 'left', lineHeight: 1.4 }
// Low-key add affordance — dashed / transparent so it reads「add」not another plan chip.
const rescueStripAddBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.74rem', fontWeight: 700, border: '1px dashed #d4a04d', background: 'transparent', color: '#8a5a1f', borderRadius: 8, padding: '0.22rem 0.55rem', cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const subjectGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.8rem' }
const subjectGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }
const subjectTileStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', border: '1px solid #d8c39a', background: '#fffdf7', borderRadius: 8, padding: '0.5rem 0.55rem', cursor: 'pointer' }
const subjectTileActiveStyle: React.CSSProperties = { border: '1px solid #b58900', background: '#fff3d0', boxShadow: '0 0 0 1px #b58900 inset' }
const tileHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem' }
const tileNameStyle: React.CSSProperties = { fontSize: '0.86rem', fontWeight: 700, color: '#4a3a22' }
const tileRescueChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.66rem', color: '#8a5a1f', background: '#fdf2e0', border: '1px solid #d4a04d', borderRadius: 999, padding: '0.02rem 0.35rem', whiteSpace: 'nowrap', fontFamily: 'var(--font-legible)' }
const tileMetaStyle: React.CSSProperties = { fontSize: '0.7rem', color: '#8c6d4a', fontFamily: 'var(--font-legible)' }
const tileHandoutMiniStyle: React.CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', border: '1px solid #6a8c3f', background: 'linear-gradient(#a7c76a, #8bb04e)', color: '#243611', borderRadius: 6, padding: '0.15rem 0.5rem', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-pixel-cjk)' }
const leafToolBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', border: '1px solid #b58900', background: '#fff3d0', color: '#7a5410', borderRadius: 999, padding: '0.1rem 0.5rem', cursor: 'pointer', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
const leafRescueBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', border: '1px solid #d4a04d', background: '#fdf2e0', color: '#8a5a1f', borderRadius: 999, padding: '0.1rem 0.5rem', cursor: 'pointer', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
const fiveMinCardStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.15rem', width: '100%', textAlign: 'left', border: '1px solid #b8933c', background: 'linear-gradient(#f6e6b8, #efd88f)', color: '#4a3712', borderRadius: 8, padding: '0.7rem 0.9rem', cursor: 'pointer', margin: '0.4rem 0 1rem' }
const fiveMinTitleStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--font-pixel-cjk)' }
const fiveMinSubStyle: React.CSSProperties = { fontSize: '0.76rem', color: '#7a5a2a', fontFamily: 'var(--font-legible)' }
const pdfSectionStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingTop: '0.8rem', borderTop: '1px dashed #d8c39a' }
