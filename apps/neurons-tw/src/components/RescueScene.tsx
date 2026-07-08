/**
 * RescueScene — 單科考前救急 full-screen overlay (add-neurons-single-subject-rescue).
 *
 * One family, one exam date, a backward-planned daily queue. A self-contained overlay
 * (portaled to <body>, like SpeedReviewPage, to escape the AnimatedRoutes transform)
 * that owns the whole rescue flow: setup → D-scaled diagnostic blitz → overview
 * (RescueScore + 戰情圖 + stop-loss re-read) → today's queue / exam-morning quick-scan.
 * All rescue state is device-local (rescue-store); answering reuses QuizModal in its
 * rescue submit mode (pre-reveal two-button confidence). Zero Dexie/R2 schema.
 *
 * Spec: openspec/changes/add-neurons-single-subject-rescue/specs/
 *       neurons-single-subject-rescue/spec.md (+ neurons-homepage / neurons-weakness-radar deltas)
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ContentPack } from '@study-rpg/core'
import { QuizModal } from './QuizModal'
import { EmojiIcon } from './EmojiIcon'
import { useCram } from '../lib/cram'
import { useConceptTags, conceptLabel } from '../lib/concept-tags'
import { useQuestionHistory } from '../lib/services/question-history'
import { useAllFlags } from '../lib/services/question-flags'
import { filterPoolByFamily } from '../lib/services/quiz-pool'
import { todayISO } from '../lib/db'
import {
  useRescuePlan,
  useRescueState,
  getActivePlan,
  startRescue,
  abandonRescue,
  archiveIfDue,
  touchLastStudied,
  setOverride,
  isBlitzDone,
  markBlitzDone,
  appendTelemetry,
  exportTelemetry,
  type RescuePlan,
} from '../lib/services/rescue/rescue-store'
import { computeRescueD, rescuePhase } from '../lib/services/rescue/rescue-lifecycle'
import { isOverrideExpired } from '../lib/services/rescue/rescue-stoploss'
import { findCramSubject, resolveConceptRereadCard } from '../lib/services/rescue/rescue-reread'
import type { ConfidenceSignal } from '../lib/services/rescue/rescue-priority'
import {
  buildBlitzPool,
  buildWarMap,
  assembleRescueQueue,
  computeReadiness,
  buildQuickScanPool,
  buildConceptStatsToday,
  interleaveByBlock,
  type WarMapConcept,
} from '../lib/services/rescue/rescue-session'

interface Props {
  pack: ContentPack
  /** Preselect this family in setup, or the family to resume if it has an active plan. */
  initialFamilyId?: string
  onClose: () => void
}

type Phase = 'setup' | 'overview' | 'blitz' | 'session' | 'quickscan'

const DAY_MS = 86_400_000
function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

const RETURN_COPY: Record<string, string> = {
  夯: '再讀這幾天，回報很高。',
  普通: '還有可回收的分數，穩穩刷。',
  低迷: '這科邊際回報較低，收斂就好。',
}
const WAR_BAND_COLOR: Record<WarMapConcept['band'], string> = {
  red: '#c44d4d',
  yellow: '#d4a04d',
  grey: '#b7ac93',
}
const WAR_BAND_LABEL: Record<WarMapConcept['band'], string> = {
  red: '高頻弱點 / 高信心答錯',
  yellow: '待鞏固',
  grey: '尚未診斷',
}

export function RescueScene({ pack, initialFamilyId, onClose }: Props): JSX.Element | null {
  const plan = useRescuePlan()
  const state = useRescueState()
  const history = useQuestionHistory()
  const flags = useAllFlags()
  const conceptTags = useConceptTags()
  const cram = useCram()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Auto-archive a plan whose exam has passed (reverts absorption via the plan-null signal).
  useEffect(() => {
    archiveIfDue(todayISO())
  }, [])

  const [phase, setPhase] = useState<Phase>(() => {
    const p = getActivePlan()
    if (!p) return 'setup'
    return isBlitzDone(p.createdAt) ? 'overview' : 'blitz'
  })
  // Setup form state.
  const [setupFamily, setSetupFamily] = useState<string>(
    initialFamilyId ?? getActivePlan()?.familyId ?? pack.subjects[0]?.id ?? '',
  )
  const [setupExam, setSetupExam] = useState<string>(() => addDaysISO(todayISO(), 3))
  const [setupMinutes, setSetupMinutes] = useState<number>(30)
  const [confirmReplace, setConfirmReplace] = useState<RescuePlan | null>(null)
  const [confirmAbandon, setConfirmAbandon] = useState(false)

  // If the plan vanished (archived / abandoned) while we're past setup, close out.
  useEffect(() => {
    if (!plan && phase !== 'setup') onClose()
  }, [plan, phase, onClose])

  const subjectId = plan?.familyId ?? ''
  // Header + copy use the 科目 (subject) name — which IS the subject `id` in neurons —
  // NOT the neuron persona `displayName` (owner request: 「考前救急 · 藥理學」, not the persona).
  const familyName = subjectId
  const subjectQuestions = useMemo(
    () => (plan ? filterPoolByFamily(pack.questions, subjectId) : []),
    [plan, pack.questions, subjectId],
  )
  const cramSubject = useMemo(() => findCramSubject(cram, subjectId), [cram, subjectId])
  const push = cramSubject?.push ?? []
  const histById = useMemo(() => new Map(history.map((h) => [h.questionId, h])), [history])
  const flagById = useMemo(() => new Map(flags.map((f) => [f.questionId, f])), [flags])
  const confidenceById = useMemo<Map<string, ConfidenceSignal>>(
    () => new Map(Object.entries(state.confidence)),
    [state.confidence],
  )
  const conceptStats = useMemo(
    () => (plan ? buildConceptStatsToday(subjectQuestions, history, conceptTags) : new Map()),
    [plan, subjectQuestions, history, conceptTags],
  )
  const overrideConcepts = useMemo(() => {
    const now = Date.now()
    const s = new Set<string>()
    for (const [cid, ov] of Object.entries(state.overrides)) {
      const attempts = conceptStats.get(cid)?.attemptsToday ?? 0
      if (!isOverrideExpired(ov, now, attempts)) s.add(cid)
    }
    return s
  }, [state.overrides, conceptStats])

  const assembled = useMemo(() => {
    if (!plan) return null
    return assembleRescueQueue({
      subjectQuestions,
      history,
      flagById,
      confidenceById,
      conceptTags,
      push,
      overrideConcepts,
      conceptStats,
      dailyMinutes: plan.dailyMinutes,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, subjectQuestions, history, flagById, confidenceById, conceptTags, cram, overrideConcepts, conceptStats])

  const warMap = useMemo(
    () =>
      assembled
        ? buildWarMap(subjectQuestions, history, assembled.conceptYield, conceptTags, confidenceById)
        : [],
    [assembled, subjectQuestions, history, conceptTags, confidenceById],
  )
  const readiness = useMemo(
    () =>
      assembled
        ? computeReadiness(history, assembled.conceptYield, conceptTags, assembled.dayMeanMovability)
        : null,
    [assembled, history, conceptTags],
  )
  // 戰情圖 sections: split the labelled concepts into 紅先攻 / 黃待鞏固 / 灰未診斷, each
  // capped for a <5s pre-exam glance. Red is sorted hi-confidence-wrong first (the worst
  // leak surfaces at the very top). Concepts without a resolvable label are dropped.
  const warSections = useMemo(() => {
    const labeled = warMap
      .map((c) => ({ ...c, zh: conceptLabel(subjectId, c.conceptId) }))
      .filter((c) => c.zh)
    const red = labeled
      .filter((c) => c.band === 'red')
      .sort((a, b) => Number(b.hiConfWrong) - Number(a.hiConfWrong))
    const yellow = labeled.filter((c) => c.band === 'yellow')
    const grey = labeled.filter((c) => c.band === 'grey')
    return [
      { band: 'red' as const, label: '先攻高頻弱點', items: red, cap: 6 },
      { band: 'yellow' as const, label: '待鞏固', items: yellow, cap: 4 },
      { band: 'grey' as const, label: '尚未診斷', items: grey, cap: 3 },
    ]
  }, [warMap, subjectId])

  const d = plan ? computeRescueD(plan.examDate, todayISO()) : 0
  const phaseKind = plan ? rescuePhase(plan.examDate, todayISO()) : 'active'

  // Today's set. Exam-eve (D1) is consolidation-only — no brand-new (unanswered) items.
  const daySet = useMemo(() => {
    if (!assembled) return []
    let core = assembled.day
    if (phaseKind === 'exam-eve') core = core.filter((q) => histById.has(q.id))
    const addon = interleaveByBlock(assembled.queue.addon, conceptTags)
    return [...interleaveByBlock(core, conceptTags), ...addon]
  }, [assembled, phaseKind, histById, conceptTags])

  const blitzPool = useMemo(() => {
    if (!plan || !assembled) return []
    return buildBlitzPool(subjectQuestions, histById, assembled.conceptYield, conceptTags, d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, assembled, subjectQuestions, histById, conceptTags, d])

  const quickScanPool = useMemo(
    () =>
      assembled
        ? buildQuickScanPool(subjectQuestions, histById, confidenceById, assembled.conceptYield, conceptTags)
        : [],
    [assembled, subjectQuestions, histById, confidenceById, conceptTags],
  )

  const rereadCards = useMemo(
    () =>
      assembled
        ? assembled.rereadConcepts.map((cid) => resolveConceptRereadCard(cramSubject, cid))
        : [],
    [assembled, cramSubject],
  )

  // ── actions ──
  const doStart = (replace = false): void => {
    const res = startRescue(
      { familyId: setupFamily, examDate: setupExam, dailyMinutes: setupMinutes },
      { replace },
    )
    if (!res.ok) {
      setConfirmReplace(res.current)
      return
    }
    setConfirmReplace(null)
    appendTelemetry({
      kind: 'plan-started',
      familyId: setupFamily,
      examDate: setupExam,
      dailyMinutes: setupMinutes,
    })
    setPhase('blitz')
  }
  const finishBlitz = (): void => {
    if (plan) markBlitzDone(plan.createdAt)
    appendTelemetry({ kind: 'diagnostic-completed', count: blitzPool.length })
    touchLastStudied()
    setPhase('overview')
  }
  const openSession = (): void => {
    if (daySet.length === 0) return
    appendTelemetry({ kind: 'priority-selected', count: daySet.length, phase: phaseKind })
    setPhase('session')
  }
  const finishSession = (): void => {
    touchLastStudied()
    setPhase('overview')
  }
  const openQuickScan = (): void => {
    if (quickScanPool.length === 0) return
    appendTelemetry({ kind: 'quick-scan-opened', count: quickScanPool.length })
    setPhase('quickscan')
  }
  const finishQuickScan = (): void => {
    appendTelemetry({ kind: 'quick-scan-completed' })
    touchLastStudied()
    setPhase('overview')
  }
  const doOverride = (conceptId: string): void => {
    setOverride(conceptId, {
      setAt: Date.now(),
      attemptsAtOverride: conceptStats.get(conceptId)?.attemptsToday ?? 0,
    })
    appendTelemetry({ kind: 'manual-override', conceptId })
  }
  const doAbandon = (): void => {
    abandonRescue()
    onClose()
  }
  const doExport = (): void => {
    try {
      const blob = new Blob([exportTelemetry()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rescue-telemetry-${todayISO()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[rescue] telemetry export failed', err)
    }
  }

  if (!mounted) return null

  // Answering phases render QuizModal (its own fixed overlay) instead of scene chrome.
  if (phase === 'blitz' && plan) {
    return createPortal(
      <QuizModal pool={blitzPool} rescueSubmit preserveOrder onClose={finishBlitz} />,
      document.body,
    )
  }
  if (phase === 'session' && plan) {
    return createPortal(
      <QuizModal pool={daySet} rescueSubmit preserveOrder onClose={finishSession} />,
      document.body,
    )
  }
  if (phase === 'quickscan' && plan) {
    return createPortal(
      <QuizModal pool={quickScanPool} rescueSubmit preserveOrder onClose={finishQuickScan} />,
      document.body,
    )
  }

  const conceptsLoading = phase === 'overview' && Object.keys(conceptTags).length === 0

  return createPortal(
    <div style={sceneStyle} role="dialog" aria-modal="true" aria-label="單科考前救急">
      <header style={headerStyle}>
        <span style={titleStyle}>
          <EmojiIcon char="⏱️" size={16} decorative /> 考前救急
          {plan && <span style={familyNameStyle}>· {familyName}</span>}
        </span>
        {plan && (
          <span style={dChipStyle}>{d <= 0 ? '考試當天' : `距考試 ${d} 天 (D-${d})`}</span>
        )}
        <button style={closeBtnStyle} onClick={onClose} aria-label="關閉救急">
          ✕
        </button>
      </header>

      <div style={bodyStyle}>
        {phase === 'setup' && (
          <div style={cardStyle}>
            <h2 style={h2Style}>鎖定一科，倒數衝刺</h2>
            <p style={subCopyStyle}>選一科、設考試日與每天可投入的分鐘數，之後每天替你排最高回報的題。</p>
            <label style={labelStyle}>
              救哪一科
              <select
                style={inputStyle}
                value={setupFamily}
                onChange={(e) => setSetupFamily(e.target.value)}
              >
                {pack.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              考試日期
              <input
                style={inputStyle}
                type="date"
                value={setupExam}
                min={todayISO()}
                onChange={(e) => setSetupExam(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              每天可投入
              <select
                style={inputStyle}
                value={setupMinutes}
                onChange={(e) => setSetupMinutes(Number(e.target.value))}
              >
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} 分鐘 / 天
                  </option>
                ))}
              </select>
            </label>
            {confirmReplace && (
              <div style={warnBoxStyle}>
                目前已在救「{confirmReplace.familyId}」。一次只能救一科 —— 要換成這科嗎？（舊計畫的答題結果都保留）
                <div style={rowStyle}>
                  <button style={primaryBtnStyle} onClick={() => doStart(true)}>
                    換成這科
                  </button>
                  <button style={ghostBtnStyle} onClick={() => setConfirmReplace(null)}>
                    取消
                  </button>
                </div>
              </div>
            )}
            {!confirmReplace && (
              <button style={primaryBtnStyle} onClick={() => doStart(false)} disabled={!setupFamily}>
                開始救急 →
              </button>
            )}
            <p style={deviceCopyStyle}>救急計畫與信心紀錄存於本裝置。</p>
          </div>
        )}

        {phase === 'overview' && plan && (
          <div style={overviewWrapStyle}>
            {conceptsLoading ? (
              <p style={loadingStyle}>載入救急資料中…</p>
            ) : (
              <>
                {/* RescueScore + qualitative return */}
                <div style={scoreCardStyle}>
                  <div>
                    <div style={scoreLabelStyle}>RescueScore</div>
                    <div style={scoreValueStyle}>{readiness?.score ?? 0}</div>
                  </div>
                  <div style={returnColStyle}>
                    <div style={returnTierStyle}>續讀回報：{readiness?.tier ?? '普通'}</div>
                    <div style={returnCopyStyle}>{RETURN_COPY[readiness?.tier ?? '普通']}</div>
                  </div>
                </div>

                {/* primary CTA — directly under the score so the main action is reachable
                    without scrolling past the 戰情圖 / stop-loss cards. */}
                {phaseKind === 'exam-morning' ? (
                  <button
                    style={quickScanPool.length ? primaryBtnStyle : primaryBtnDisabledStyle}
                    onClick={openQuickScan}
                    disabled={quickScanPool.length === 0}
                  >
                    ▶ 考試日速掃（{quickScanPool.length} 題 · ~15 分）
                  </button>
                ) : (
                  <button
                    style={daySet.length ? primaryBtnStyle : primaryBtnDisabledStyle}
                    onClick={openSession}
                    disabled={daySet.length === 0}
                  >
                    ▶ {phaseKind === 'exam-eve' ? '考前夜鞏固' : '今日佇列'}（{daySet.length} 題）
                  </button>
                )}
                {phaseKind === 'exam-eve' && (
                  <p style={fallbackNoteStyle}>考前夜只鞏固已練過的，不塞全新難題。</p>
                )}

                {/* 戰情圖 — three labelled sections (紅先攻 / 黃待鞏固 / 灰未診斷), each capped
                    with a +N overflow so nothing is silently truncated. */}
                <div style={warMapCardStyle}>
                  <div style={warMapHeadRowStyle}>
                    <span style={warMapTitleStyle}>戰情圖</span>
                    <span style={warMapHintStyle}>先看紅色，尤其 ‼（有把握卻答錯）</span>
                  </div>
                  {warSections.every((s) => s.items.length === 0) ? (
                    <p style={fallbackNoteStyle}>完成診斷題後，這裡會顯示紅／黃／灰弱點分布。</p>
                  ) : (
                    warSections.map((sec) =>
                      sec.items.length === 0 ? null : (
                        <div key={sec.band} style={warBandSectionStyle}>
                          <div style={warBandHeaderStyle}>
                            <i style={{ ...warDotStyle, background: WAR_BAND_COLOR[sec.band] }} />
                            <span style={warBandLabelStyle}>{sec.label}</span>
                            <span style={countBadgeStyle}>{sec.items.length}</span>
                          </div>
                          <div style={warGridStyle}>
                            {sec.items.slice(0, sec.cap).map((c) => (
                              <span key={c.conceptId} style={warChipStyle} title={WAR_BAND_LABEL[c.band]}>
                                {c.hiConfWrong && <span style={hiConfMarkStyle}>‼</span>}
                                <i style={{ ...warDotStyle, background: WAR_BAND_COLOR[c.band] }} />
                                {c.zh}
                              </span>
                            ))}
                            {sec.items.length > sec.cap && (
                              <span style={warMoreChipStyle}>+{sec.items.length - sec.cap}</span>
                            )}
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>

                {/* stop-loss re-read interstitial — below the map (an interrupt, not the nav) */}
                {rereadCards.map((card) => (
                  <div key={card.conceptId} style={stopLossCardStyle}>
                    <div style={stopLossHeadStyle}>
                      ⚠️ 卡關了：{card.conceptZh ?? conceptLabel(subjectId, card.conceptId) ?? '這個觀念'}
                    </div>
                    <p style={stopLossBodyStyle}>
                      這塊暫時卡住，先重讀 30 秒再回來測，通常比硬刷省力。
                    </p>
                    {card.kernelItems.slice(0, 3).map((it, i) => (
                      <p key={i} style={kernelLineStyle} dangerouslySetInnerHTML={{ __html: it.html }} />
                    ))}
                    {card.source === 'subject-fallback' && (
                      <p style={fallbackNoteStyle}>（此為整科重點，非單一觀念卡）</p>
                    )}
                    {overrideConcepts.has(card.conceptId) ? (
                      <p style={overrideActiveStyle}>已加練中 · 會自動在 24 小時 / 再 6 題後重新評估</p>
                    ) : (
                      <button style={ghostBtnStyle} onClick={() => doOverride(card.conceptId)}>
                        仍想加練這塊（不擠掉高頻目標）
                      </button>
                    )}
                  </div>
                ))}

                <p style={deviceCopyStyle}>救急計畫與信心紀錄存於本裝置。</p>
                <div style={overviewFootRowStyle}>
                  <button style={linkBtnStyle} onClick={() => setPhase('setup')}>
                    換一科救急
                  </button>
                  <button style={linkBtnStyle} onClick={doExport}>
                    ⬇ 匯出救急紀錄
                  </button>
                  <button style={linkBtnStyle} onClick={() => setConfirmAbandon(true)}>
                    放棄計畫
                  </button>
                </div>
                {confirmAbandon && (
                  <div style={warnBoxStyle}>
                    放棄後只清掉「計畫殼」，你已答的題目與進度都保留。確定放棄？
                    <div style={rowStyle}>
                      <button style={primaryBtnStyle} onClick={doAbandon}>
                        確定放棄
                      </button>
                      <button style={ghostBtnStyle} onClick={() => setConfirmAbandon(false)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── styles (warm pixel-tan aesthetic, matching SpeedReviewPage / QuizModal) ──
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
  borderBottom: '2px solid #d8c8a0',
}
const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#5a4a2f',
  fontSize: '1rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
}
const familyNameStyle: React.CSSProperties = { color: '#8c6d4a', fontWeight: 600 }
const dChipStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.82rem',
  color: '#7a5a2f',
  background: '#efe4c6',
  border: '1px solid #d4a04d',
  borderRadius: 999,
  padding: '0.15rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
}
const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  color: '#8c6d4a',
  cursor: 'pointer',
  lineHeight: 1,
}
const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  justifyContent: 'center',
  padding: '1rem',
  boxSizing: 'border-box',
}
const cardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  width: 'min(560px, 100%)',
  height: 'fit-content',
  padding: '1.2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
}
const overviewWrapStyle: React.CSSProperties = {
  width: 'min(680px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
}
const h2Style: React.CSSProperties = { margin: 0, color: '#5a4a2f', fontSize: '1.2rem' }
const subCopyStyle: React.CSSProperties = { margin: 0, color: '#8c7a55', fontSize: '0.9rem', lineHeight: 1.6 }
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  color: '#5a4a2f',
  fontSize: '0.9rem',
  fontWeight: 600,
}
const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  borderRadius: 8,
  border: '1px solid #c9b891',
  background: '#fffdf7',
  color: '#3f341f',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '0.6rem 1.1rem',
  background: '#d4a04d',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: '0.98rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const primaryBtnDisabledStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: '#e0d4b8',
  color: '#a89a7d',
  cursor: 'not-allowed',
}
const ghostBtnStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'transparent',
  color: '#7a5a2f',
  border: '1px solid #c9b891',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#a08a5e',
  fontSize: '0.82rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const deviceCopyStyle: React.CSSProperties = { margin: 0, color: '#a08a5e', fontSize: '0.78rem' }
const loadingStyle: React.CSSProperties = { color: '#8c7a55', margin: '2rem auto' }
const warnBoxStyle: React.CSSProperties = {
  background: '#fbeee0',
  border: '1px solid #d4a04d',
  borderRadius: 8,
  padding: '0.7rem 0.85rem',
  color: '#6a4a24',
  fontSize: '0.88rem',
  lineHeight: 1.6,
}
const rowStyle: React.CSSProperties = { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }
const scoreCardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  padding: '0.9rem 1.1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1.2rem',
  flexWrap: 'wrap', // narrow phones: RescueScore + return copy stack instead of squeezing
}
const scoreLabelStyle: React.CSSProperties = { color: '#8c7a55', fontSize: '0.78rem', fontWeight: 600 }
const scoreValueStyle: React.CSSProperties = {
  color: '#5a4a2f',
  fontSize: '2.4rem',
  fontWeight: 800,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}
const returnColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.2rem' }
const returnTierStyle: React.CSSProperties = { color: '#5a4a2f', fontWeight: 700, fontSize: '1rem' }
const returnCopyStyle: React.CSSProperties = { color: '#8c7a55', fontSize: '0.85rem' }
const stopLossCardStyle: React.CSSProperties = {
  background: '#fdf2e0',
  border: '1px solid #d4a04d',
  borderRadius: 10,
  padding: '0.8rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}
const stopLossHeadStyle: React.CSSProperties = { fontWeight: 700, color: '#8a5a1f' }
const stopLossBodyStyle: React.CSSProperties = { margin: 0, color: '#6a4a24', fontSize: '0.86rem', lineHeight: 1.6 }
const kernelLineStyle: React.CSSProperties = { margin: '0.1rem 0', color: '#3f341f', fontSize: '0.9rem', lineHeight: 1.6 }
const fallbackNoteStyle: React.CSSProperties = { margin: 0, color: '#a08a5e', fontSize: '0.78rem' }
const overrideActiveStyle: React.CSSProperties = { margin: 0, color: '#7a5a2f', fontSize: '0.82rem', fontWeight: 600 }
const warMapCardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  padding: '0.9rem 1.1rem',
}
const warMapHeadRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.6rem',
}
const warMapTitleStyle: React.CSSProperties = { fontWeight: 700, color: '#5a4a2f' }
const warMapHintStyle: React.CSSProperties = {
  color: '#8c7a55',
  fontSize: '0.72rem',
  textAlign: 'right',
}
const warBandSectionStyle: React.CSSProperties = { marginTop: '0.5rem' }
const warBandHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  marginBottom: '0.3rem',
}
const warBandLabelStyle: React.CSSProperties = { fontWeight: 700, color: '#5a4a2f', fontSize: '0.82rem' }
const countBadgeStyle: React.CSSProperties = {
  minWidth: 18,
  textAlign: 'center',
  background: '#e2d6b8',
  color: '#6a5836',
  borderRadius: 999,
  padding: '0 0.4rem',
  fontSize: '0.72rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}
const warMoreChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '0.2rem 0.55rem',
  fontSize: '0.78rem',
  color: '#8c7a55',
  background: '#f0ece2',
  border: '1px dashed #cbbb95',
}
const warGridStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }
const warChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  background: '#efe4cc',
  border: '1px solid #d8c39a',
  borderRadius: 999,
  padding: '0.2rem 0.6rem',
  fontSize: '0.82rem',
  color: '#4a3f28',
}
const warDotStyle: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%', display: 'inline-block' }
const hiConfMarkStyle: React.CSSProperties = { color: '#c44d4d', fontWeight: 800 }
const overviewFootRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
  justifyContent: 'center',
}
