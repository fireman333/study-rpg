import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import {
  rollLoot,
  instanceFromRoll,
  newPlayer,
  applyXp,
  addStat,
  REWARD,
  FAST_ANSWER_THRESHOLD_MS,
  DEFAULT_STAT_SCHEMA,
  detectUnlocks,
  resolveSkillTree,
  getDB,
  newCard,
  reviewCard,
  applyCheckIn,
  getStreakMultiplier,
  getTaipeiToday,
  getTaipeiYesterday,
  incrementReadingMinutes,
  incrementQuestionsAnswered,
  hasMetCheckInThreshold,
  quizEvents,
  pickDailyQuestion,
  enqueueBacklogForMissedDays,
  initialBacklog,
  consumeBacklog,
  computeMentorReward,
  mentorToday,
  checkMilestoneUnlocks,
  instanceFromCosmetic,
  type MentorBacklog,
  type Attempt,
  type Cosmetic,
  type Player,
  type RollResult,
  type EquipSlot,
  type ItemInstance,
  type Item,
  type ContentPack,
  type QuestionId,
  type SkillNode,
} from '@study-rpg/core'
import { THEME_PIXEL_MEDICAL, COSMETIC_CATALOG } from '@study-rpg/theme-pixel-medical'
import { getContentPack } from '@study-rpg/content-medexam-tw'
import { AuthButton } from './components/AuthButton'
import { MigrationUploadPrompt } from './components/MigrationUploadPrompt'
import { ConflictChooserModal } from './components/ConflictChooserModal'
import { SettingsPanel } from './components/SettingsPanel'
import { useSync } from './lib/sync/useSync'
import { useAuth } from './lib/auth/AuthContext'
import { CharCard } from './components/CharCard'
import { InventoryModal } from './components/InventoryModal'
import { RollReveal } from './components/RollReveal'
import { SkillUnlockToast } from './components/SkillUnlockToast'
import { CosmeticUnlockToast } from './components/CosmeticUnlockToast'
import { QuizModal, REVIEW_BATCH_SIZE, type QuizResult, type QuestionResult } from './components/QuizModal'
import { BossModal, type BossRunResult } from './components/BossModal'
import { PersistenceButtons } from './components/PersistenceButtons'
import { StreakChip } from './components/StreakChip'
import { StreakBreakToast } from './components/StreakBreakToast'
import { SkillTreeRoute } from './routes/SkillTreeRoute'
import { MockPickerRoute } from './routes/MockPickerRoute'
import { MockRunnerRoute } from './routes/MockRunnerRoute'
import { MockResultRoute } from './routes/MockResultRoute'
import { MentorDialog } from './components/MentorDialog'
import { getBacklog, saveBacklog } from './db/mentor-backlog'
import { DormRoute } from './routes/DormRoute'

const STAT_SCHEMA = DEFAULT_STAT_SCHEMA
const STARTER_NAME = '見習醫師'
const PLAYER_ID = 'p1'
const SAVE_SCHEMA_VERSION = 2

/** Ordered list of character sprite variants the player can cycle through. */
const CHARACTER_VARIANTS = ['character-base', 'character-base-female'] as const

/** Per-tick reward cap. Demo: 10s = "1 minute"; M2 prod can bump to 60_000. */
const READING_TICK_MS = 10_000
/** Idle pause threshold (no mousemove/keydown/touchstart). */
const READING_IDLE_TIMEOUT_MS = 90_000

type PauseReason = 'manual' | 'visibility' | 'idle' | null

function dayDiff(fromISODate: string, toISODate: string): number {
  const ord = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
  }
  return ord(toISODate) - ord(fromISODate)
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  // M4 cloud sync — starts when authed, idle when unauthed.
  const {
    status: syncStatus,
    lastPushAt,
    lastPullAt,
    gateState,
    gateSnapshot,
    resolveUploadPrompt,
    resolveConflictChooser,
    reopenConflictChooser,
    resetMigrationPreference,
  } = useSync()
  const { user: authUser, signOut } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Reading-loop must NOT double-count while user is in mock runner (spec mock-exam R3)
  // or in dorm view (spec dorm-view "no game mechanics").
  const isInMockRunner = location.pathname.startsWith('/mock/run/')
  const isInDorm = location.pathname.startsWith('/dorm')
  const shouldPauseReading = isInMockRunner || isInDorm
  const [player, setPlayer] = useState<Player>(() =>
    newPlayer('p1', STARTER_NAME, STAT_SCHEMA.order),
  )
  const [instances, setInstances] = useState<ItemInstance[]>([])
  const [reveal, setReveal] = useState<RollResult | null>(null)
  const [inventoryFor, setInventoryFor] = useState<EquipSlot | null | 'all'>(null)
  const [readMs, setReadMs] = useState(0)
  const [reading, setReading] = useState(false)
  const [pauseReason, setPauseReason] = useState<PauseReason>(null)
  const [content, setContent] = useState<ContentPack | null>(null)
  const [quizOpen, setQuizOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [bossOpen, setBossOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [dueQuestionIds, setDueQuestionIds] = useState<QuestionId[]>([])
  const [skillToasts, setSkillToasts] = useState<Array<{ id: number; node: SkillNode }>>([])
  const [streakBreakToast, setStreakBreakToast] = useState(false)
  const [mentorBacklog, setMentorBacklog] = useState<MentorBacklog | null>(null)
  const [cosmeticUnlockToasts, setCosmeticUnlockToasts] = useState<Array<{ id: number; cosmetic: Cosmetic }>>([])
  const prevPlayerForCosmeticRef = useRef<Player | null>(null)
  const [mentorOpen, setMentorOpen] = useState(false)
  const [mentorPickMode, setMentorPickMode] = useState<'srs' | 'weak' | 'random'>('srs')
  const [suppressSkipConfirm, setSuppressSkipConfirm] = useState(false)
  const streakBreakHandledRef = useRef(false)
  const prevStatsRef = useRef<Player['stats']>(player.stats)
  const toastIdRef = useRef(0)
  const skillTreeContent = useMemo(() => resolveSkillTree(THEME_PIXEL_MEDICAL), [])

  // Load content pack at mount
  useEffect(() => {
    getContentPack('/study-rpg/content/medexam-tw')
      .then(setContent)
      .catch((err) => {
        console.error('Failed to load content pack:', err)
      })
  }, [])

  // Hydrate player + instances + SRS due queue from IndexedDB on mount (once)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const db = getDB()
        const saved = await db.players.get(PLAYER_ID)
        if (cancelled) return
        if (saved) {
          const insts = await db.itemInstances.toArray()
          if (cancelled) return
          setPlayer(saved)
          setInstances(insts)
        }
        const now = Date.now()
        const dueCards = await db.srs.where('dueAt').belowOrEqual(now).toArray()
        if (!cancelled) setDueQuestionIds(dueCards.map((c) => c.questionId))
      } catch (err) {
        console.error('Hydrate failed:', err)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Hydrate + accumulate mentor backlog once player + content are ready.
  // Runs only once (after first hydration) to avoid re-picking on every player mutation.
  const mentorHydratedRef = useRef(false)
  useEffect(() => {
    if (!hydrated || !content || mentorHydratedRef.current) return
    mentorHydratedRef.current = true
    const cp = content // narrow capture for inner closures
    let cancelled = false
    ;(async () => {
      try {
        const db = getDB()
        const today = mentorToday()
        const now = Date.now()
        const existing = await getBacklog()

        async function pickOne(): Promise<string | null> {
          const srsDue = await db.srs.where('dueAt').belowOrEqual(now).toArray()
          const recentAttempts = await db.attempts
            .where('ts')
            .above(now - 30 * 24 * 3600 * 1000)
            .toArray()
          const pick = pickDailyQuestion({
            srsDue,
            player,
            questions: cp.questions,
            recentAttempts: recentAttempts as Attempt[],
            now,
          })
          if (pick) setMentorPickMode(pick.mode)
          return pick?.questionId ?? null
        }

        let next: MentorBacklog
        if (!existing) {
          const firstId = await pickOne()
          if (firstId === null) return
          next = initialBacklog(today, firstId)
        } else if (existing.lastAssignedDate !== today) {
          // Reuse core helper for missed-day accumulation by pre-fetching picks.
          // Core fn is sync; we feed it N pre-resolved picks via a closure-with-queue.
          const missedDayCount = Math.max(0, dayDiff(existing.lastAssignedDate, today))
          const slots = Math.min(missedDayCount, 5 - existing.questionIds.length)
          const newPicks: string[] = []
          for (let i = 0; i < slots; i++) {
            const id = await pickOne()
            if (id === null) break
            newPicks.push(id)
          }
          let idx = 0
          next = enqueueBacklogForMissedDays(existing, today, () => newPicks[idx++] ?? null)
        } else {
          next = existing
        }
        if (cancelled) return
        await saveBacklog(next)
        if (!cancelled) setMentorBacklog(next)
      } catch (err) {
        console.error('[mentor] hydrate failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [hydrated, content, player])

  /** Refresh due queue from db.srs after a quiz writes new cards. */
  async function refreshDueQueue() {
    try {
      const now = Date.now()
      const due = await getDB().srs.where('dueAt').belowOrEqual(now).toArray()
      setDueQuestionIds(due.map((c) => c.questionId))
    } catch (err) {
      console.error('Refresh due queue failed:', err)
    }
  }

  // Persist player on change (only after hydration so we don't overwrite saved
  // state with the initial newPlayer default)
  useEffect(() => {
    if (!hydrated) return
    getDB().players.put(player).catch((err) => console.error('Player persist failed:', err))
  }, [hydrated, player])

  // Persist instances on change (MVP: clear + bulkAdd; instance count is small)
  useEffect(() => {
    if (!hydrated) return
    const db = getDB()
    db.transaction('rw', db.itemInstances, async () => {
      await db.itemInstances.clear()
      if (instances.length) await db.itemInstances.bulkAdd(instances)
    }).catch((err) => console.error('Instances persist failed:', err))
  }, [hydrated, instances])

  function handleImport(payload: { player: Player; instances: ItemInstance[] }) {
    setPlayer(payload.player)
    setInstances(payload.instances)
  }

  // Break-day detection: once per hydration, if the last check-in is older than
  // yesterday AND the player had an active streak, pre-emptively reset
  // currentStreak to 0 and show a soft toast. Pre-emptive reset keeps the chip
  // honest — without this, the chip would still read the stale streak number
  // until the player threshold-crosses again today. applyCheckIn's existing
  // "older / undefined" branch still correctly sets to 1 when that crossing
  // happens, so this proactive reset doesn't violate the spec invariants.
  // NOTE on deps: this effect calls setPlayer, which mutates `player.currentStreak`
  // — a dep. React will schedule a re-run, but `streakBreakHandledRef` short-circuits
  // it to the no-op else branch on second entry. The ref-guard contract — not the
  // dep array — is what guarantees we only fire the toast once.
  useEffect(() => {
    if (!hydrated) return
    if (streakBreakHandledRef.current) return
    const today = getTaipeiToday()
    const yesterday = getTaipeiYesterday(today)
    if (
      player.lastCheckInDate &&
      player.lastCheckInDate !== today &&
      player.lastCheckInDate !== yesterday &&
      player.currentStreak > 0
    ) {
      streakBreakHandledRef.current = true
      setStreakBreakToast(true)
      setPlayer((p) => ({ ...p, currentStreak: 0 }))
    } else {
      // No break to handle (fresh player, ongoing streak, or first-ever load).
      // Still flip the ref so we don't re-evaluate on every player mutation.
      streakBreakHandledRef.current = true
    }
  }, [hydrated, player.lastCheckInDate, player.currentStreak])

  // Skill-tree unlock detection: enqueue toasts for newly crossed thresholds.
  // Skipped until hydration completes so returning players don't get a flurry
  // of toasts for thresholds already crossed in previous sessions.
  useEffect(() => {
    const next = player.stats
    if (!hydrated) {
      prevStatsRef.current = next
      return
    }
    const prev = prevStatsRef.current
    if (prev === next) return
    const unlocked = detectUnlocks(prev, next, skillTreeContent)
    prevStatsRef.current = next
    if (unlocked.length) {
      const entries = unlocked.map((node) => ({ id: ++toastIdRef.current, node }))
      setSkillToasts((q) => [...q, ...entries])
    }
  }, [hydrated, player.stats, skillTreeContent])

  const catalog = useMemo(() => THEME_PIXEL_MEDICAL.itemCatalog, [])
  const sprites = useMemo(() => THEME_PIXEL_MEDICAL.sprites, [])

  // Cosmetic milestone unlock — detect transitions on every player change.
  useEffect(() => {
    if (!hydrated) return
    if (!prevPlayerForCosmeticRef.current) {
      prevPlayerForCosmeticRef.current = player
      return
    }
    const prev = prevPlayerForCosmeticRef.current
    if (prev === player) return
    const newlyUnlocked = checkMilestoneUnlocks(prev, player, COSMETIC_CATALOG)
    prevPlayerForCosmeticRef.current = player
    if (newlyUnlocked.length === 0) return
    // Add instances + toast queue
    const newInstances = newlyUnlocked.map((c) => instanceFromCosmetic(c))
    setInstances((prev) => [...prev, ...newInstances])
    setCosmeticUnlockToasts((q) => [
      ...q,
      ...newlyUnlocked.map((c) => ({ id: ++toastIdRef.current, cosmetic: c })),
    ])
  }, [hydrated, player])

  /** base stats + equipment stat bonuses */
  const effectiveStats = useMemo(() => {
    const out = { ...player.stats }
    const slots: Array<keyof Player['equipment']> = ['head', 'body', 'weapon', 'charm']
    for (const slot of slots) {
      const instId = player.equipment[slot]
      if (!instId) continue
      const inst = instances.find((i) => i.id === instId)
      if (!inst) continue
      const item = catalog.find((c) => c.id === inst.itemId)
      if (!item) continue
      for (const eff of item.effects) {
        if (eff.stat) out[eff.stat.name] = (out[eff.stat.name] ?? 0) + eff.stat.delta
      }
    }
    return out
  }, [player, instances, catalog])

  // Reading timer — tick every 1s while reading; pause clears reason on resume.
  // Hard-gated on mock-runner / dorm route to satisfy mock-exam R3 + dorm-view (no double-counting).
  useEffect(() => {
    if (!reading || shouldPauseReading) return
    setPauseReason(null)
    const t = setInterval(() => setReadMs((m) => m + 1000), 1000)
    return () => clearInterval(t)
  }, [reading, shouldPauseReading])

  // Per-READING_TICK_MS reward (per-minute cap enforced via modulo)
  useEffect(() => {
    if (readMs > 0 && readMs % READING_TICK_MS === 0) {
      setPlayer((p) => {
        const today = getTaipeiToday()
        // 1) bump today's reading-minute counter
        let next = incrementReadingMinutes(p, today, 1)
        // 2) cross threshold? applyCheckIn idempotently bumps streak (same-day re-trigger is a no-op)
        if (hasMetCheckInThreshold(next, today)) {
          next = applyCheckIn(next, today)
        }
        // 3) compute multiplier from the post-check-in streak (Design Decision 6:
        //    threshold-crossing tick already feels the bonus)
        const multiplier = getStreakMultiplier(next.currentStreak)
        const xpGain = Math.floor(REWARD.readPerMinute.xp * multiplier)
        const stats = addStat(next.stats, REWARD.readPerMinute.stat.name, REWARD.readPerMinute.stat.delta)
        return applyXp({ ...next, stats }, xpGain).player
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readMs])

  // Pause on tab-hide (誠信防護: 切到別 tab 不該繼續累積 XP)
  useEffect(() => {
    function onVis() {
      if (document.hidden && reading) {
        setReading(false)
        setPauseReason('visibility')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reading])

  // Idle pause: 90s without mousemove/keydown/touchstart auto-pauses
  useEffect(() => {
    if (!reading) return
    let idleTimer: ReturnType<typeof setTimeout>
    function resetIdle() {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        setReading(false)
        setPauseReason('idle')
      }, READING_IDLE_TIMEOUT_MS)
    }
    resetIdle()
    const evs: Array<keyof DocumentEventMap> = ['mousemove', 'keydown', 'touchstart']
    for (const e of evs) document.addEventListener(e, resetIdle, { passive: true })
    return () => {
      clearTimeout(idleTimer)
      for (const e of evs) document.removeEventListener(e, resetIdle)
    }
  }, [reading])

  function doRoll(source: 'read' | 'quiz' | 'boss-mini' | 'boss-annual' | 'mock') {
    // Side effects MUST happen OUTSIDE the setPlayer updater — StrictMode runs
    // updaters twice, which would double-fire instanceFromRoll (random UUID)
    // and setInstances. See spec loot-mechanics §"Callers SHALL NOT invoke
    // loot functions inside React state updaters".
    const r = rollLoot(catalog, player.lootStats)
    if (!r) return
    const { instance } = instanceFromRoll(r, source)
    setReveal(r)
    setInstances((prev) => [...prev, instance])
    setPlayer((p) => ({
      ...p,
      lootStats: r.newStats,
      inventory: [...p.inventory, instance.id],
    }))
  }

  /** Batched reward calculation + SRS write for a multi-Q quiz session (reading or review mode). */
  function onQuizComplete(results: QuizResult[], questionResults: QuestionResult[]) {
    const wasReview = reviewOpen
    setQuizOpen(false)
    setReviewOpen(false)
    if (results.length === 0) return
    setPlayer((p) => {
      const today = getTaipeiToday()
      // Bump today's questions-answered counter once for the whole batch, then
      // check threshold and increment streak before computing the multiplier.
      // Same-day re-trigger of applyCheckIn is a no-op (spec idempotence guard).
      let next = incrementQuestionsAnswered(p, today, questionResults.length)
      if (hasMetCheckInThreshold(next, today)) {
        next = applyCheckIn(next, today)
      }
      const multiplier = getStreakMultiplier(next.currentStreak)
      for (const qr of questionResults) {
        const baseReward = qr.correct ? REWARD.quizCorrect : REWARD.quizWrong
        let stats = 'stat' in baseReward && baseReward.stat
          ? addStat(next.stats, baseReward.stat.name, baseReward.stat.delta)
          : next.stats
        // Reflex: correct + answered fast
        if (qr.correct && qr.elapsedMs < FAST_ANSWER_THRESHOLD_MS) {
          stats = addStat(stats, REWARD.quizFastAnswer.stat.name, REWARD.quizFastAnswer.stat.delta)
        }
        // Memory: correct review-mode answer (SRS due card)
        if (qr.correct && wasReview) {
          stats = addStat(stats, REWARD.srsReviewCorrect.stat.name, REWARD.srsReviewCorrect.stat.delta)
        }
        // Multiplier applies to quizCorrect only — quizWrong stays at the small
        // consolation flat (spec: "Quiz-correct path is multiplied; wrong path is not").
        const xpGain = qr.correct ? Math.floor(REWARD.quizCorrect.xp * multiplier) : REWARD.quizWrong.xp
        next = applyXp({ ...next, stats }, xpGain).player
      }
      return next
    })
    const correctCount = results.filter((r) => r.correct).length
    // Shared emit code path with 二階 (no listener registered in 一階).
    for (let i = 0; i < correctCount; i++) {
      quizEvents.emit('correct-answer')
    }
    for (let i = 0; i < correctCount; i++) {
      setTimeout(() => doRoll('quiz'), i * 150)
    }
    // SRS write — per-question card upsert; quality 4 if correct, 2 if wrong (lapse)
    ;(async () => {
      try {
        const db = getDB()
        const now = Date.now()
        for (const qr of questionResults) {
          const existing = await db.srs.get(qr.questionId)
          const base = existing ?? newCard(qr.questionId, now)
          const updated = reviewCard(base, qr.correct ? 4 : 2, now)
          await db.srs.put(updated)
        }
        await refreshDueQueue()
      } catch (err) {
        console.error('SRS write failed:', err)
      }
    })()
  }

  function onBossComplete(result: BossRunResult | null) {
    setBossOpen(false)
    if (!result) return
    const passedRun = result.passed
    const xpGain = passedRun
      ? REWARD.bossMiniPass.xp
      : Math.floor(REWARD.bossMiniPass.xp / 2)
    const rollsToFire = passedRun ? 3 : 1
    const BADGE_ID = 'boss:藥理學:mini'

    setPlayer((p) => {
      const nextBadges = passedRun && !p.badges.includes(BADGE_ID)
        ? [...p.badges, BADGE_ID]
        : p.badges
      return { ...applyXp(p, xpGain).player, badges: nextBadges }
    })
    for (let i = 0; i < rollsToFire; i++) setTimeout(() => doRoll('boss-mini'), i * 200)

    // Persist boss run record
    ;(async () => {
      try {
        const db = getDB()
        await db.bossRuns.put({
          id: `boss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mode: 'mini',
          subject: '藥理學',
          startTs: Date.now() - result.timeSpentMs,
          endTs: Date.now(),
          totalQ: result.totalQ,
          correctQ: result.correctQ,
          passed: passedRun,
        })
      } catch (err) {
        console.error('Boss run persist failed:', err)
      }
    })()
  }

  /** Click on an equip slot: occupied → unequip; empty → open inventory filtered to that slot */
  function handleSlotClick(slot: EquipSlot) {
    const equipKey = slot as 'head' | 'body' | 'weapon' | 'charm'
    if (slot === 'consumable') return
    const equippedInstId = player.equipment[equipKey]
    if (equippedInstId) {
      // Unequip: instance stays in inventory, just clear the slot
      setPlayer((p) => ({ ...p, equipment: { ...p.equipment, [equipKey]: undefined } }))
    } else {
      setInventoryFor(slot)
    }
  }

  /** Click on inventory tile: equip to its slot (swap if occupied) */
  function handlePickInstance(inst: ItemInstance, item: Item) {
    if (item.slot === 'consumable') {
      alert('Consumable 使用功能在 M2 開放')
      return
    }
    const equipKey = item.slot as 'head' | 'body' | 'weapon' | 'charm'
    setPlayer((p) => ({ ...p, equipment: { ...p.equipment, [equipKey]: inst.id } }))
    setInventoryFor(null)
  }

  function handleRename(name: string) {
    setPlayer((p) => ({ ...p, name }))
  }

  function cycleVariant(direction: 1 | -1) {
    setPlayer((p) => {
      const current = p.characterSpriteKey ?? CHARACTER_VARIANTS[0]
      const idx = CHARACTER_VARIANTS.indexOf(current as typeof CHARACTER_VARIANTS[number])
      // If current is not in the list (e.g. unknown saved key), start from 0
      const baseIdx = idx === -1 ? 0 : idx
      const nextIdx = (baseIdx + direction + CHARACTER_VARIANTS.length) % CHARACTER_VARIANTS.length
      return { ...p, characterSpriteKey: CHARACTER_VARIANTS[nextIdx] }
    })
  }

  const homeView = (
    <>
      <AuthButton onOpenSettings={() => setSettingsOpen(true)} />
      <div className="layout">
        <CharCard
          player={player}
          statSchema={STAT_SCHEMA}
          sprites={sprites}
          catalog={catalog}
          instances={instances}
          effectiveStats={effectiveStats}
          characterSpriteKey={player.characterSpriteKey ?? CHARACTER_VARIANTS[0]}
          canCycleVariant={CHARACTER_VARIANTS.length > 1}
          onRename={handleRename}
          onSlotClick={handleSlotClick}
          onCycleVariant={cycleVariant}
          onSkillTreeClick={() => navigate('/skills')}
        />

        <div className="actions">
          <button
            onClick={() => {
              setReading((r) => {
                if (r) setPauseReason('manual')
                return !r
              })
            }}
          >
            <span className="label">{reading ? '⏸ 暫停閱讀' : '📖 開始閱讀'}</span>
            <span className="hint">
              {reading
                ? `已累積 ${Math.floor(readMs / 1000)} s (demo: 10s = 1 min)`
                : pauseReason === 'visibility'
                  ? '⏸ 自動暫停（離開分頁）— 點我繼續'
                  : pauseReason === 'idle'
                    ? '⏸ 自動暫停（離桌太久）— 點我繼續'
                    : '閱讀累積經驗值與耐力'}
            </span>
          </button>

          <button
            onClick={() => setQuizOpen(true)}
            disabled={!content || content.questions.length === 0}
          >
            <span className="label">📚 開始答題（5Q 藥理）</span>
            <span className="hint">
              {content
                ? `共 ${content.questions.length} 題 · 每對 1 題 = +${REWARD.quizCorrect.xp} XP + 1 次抽卡`
                : '載入題庫中...'}
            </span>
          </button>

          <button
            onClick={() => setReviewOpen(true)}
            disabled={dueQuestionIds.length === 0}
          >
            <span className="label">📋 複習到期（{dueQuestionIds.length} 題）</span>
            <span className="hint">
              {dueQuestionIds.length === 0
                ? '目前沒有到期複習，繼續累積中'
                : dueQuestionIds.length > REVIEW_BATCH_SIZE
                  ? `共 ${dueQuestionIds.length} 題到期 · 一次最多複習 ${REVIEW_BATCH_SIZE} 題`
                  : `共 ${dueQuestionIds.length} 題到期 · SRS 排程`}
            </span>
          </button>

          <button
            onClick={() => setBossOpen(true)}
            disabled={!content || content.questions.length === 0}
          >
            <span className="label">⚔ 挑戰 mini-boss（藥理學）</span>
            <span className="hint">30 題 · 30 分 · ≥ 60% 拿徽章</span>
          </button>

          <button
            onClick={() => navigate('/mock')}
            disabled={!content || content.questions.length === 0}
          >
            <span className="label">🎯 模擬考全卷</span>
            <span className="hint">挑歷年原卷 · ≈100 題 · stopwatch + 全展開詳解</span>
          </button>

          {mentorBacklog && mentorBacklog.questionIds.length > 0 && content && (
            <button onClick={() => setMentorOpen(true)} disabled={!content || content.questions.length === 0}>
              <span className="label">
                🧑‍⚕️ 今日導師題
                {mentorBacklog.questionIds.length > 1 && `（尚有 ${mentorBacklog.questionIds.length} 題）`}
              </span>
              <span className="hint">SRS due 優先 · 答對 1.5× XP + 算 streak check-in</span>
            </button>
          )}

          <button onClick={() => navigate('/dorm')}>
            <span className="label">🏠 宿舍</span>
            <span className="hint">穿 cosmetic、看裝扮間 · 純展示不影響閱讀計時</span>
          </button>

          <button onClick={() => doRoll('read')}>
            <span className="label">🎲 手動測試一次抽卡</span>
            <span className="hint">總抽卡：{player.lootStats.totalRolls} · 距下次 SR 保底：{30 - player.lootStats.rollsSinceLastSR}</span>
          </button>

          <button onClick={() => setInventoryFor('all')} disabled={instances.length === 0}>
            <span className="label">🎒 開啟背包</span>
            <span className="hint">{instances.length} 件 · 點 item 裝備到對應 slot</span>
          </button>

          <PersistenceButtons
            player={player}
            instances={instances}
            schemaVersion={SAVE_SCHEMA_VERSION}
            onImport={handleImport}
          />
        </div>
      </div>

      <div className="loot-stage">
        <AnimatePresence>
          {reveal && (
            <RollReveal
              key={reveal.item.id + player.lootStats.totalRolls}
              result={reveal}
              sprites={sprites}
              onDone={() => setReveal(null)}
            />
          )}
        </AnimatePresence>
        {!reveal && (
          <div className="empty-state">
            這是 vertical-slice demo · 真實的閱讀計時、SRS、boss 戰 UI 在後續 milestone 開發
            <div className="loot-stats">
              背包：{instances.length} 件 · 徽章：{player.badges.length} 枚
            </div>
          </div>
        )}
      </div>

      {inventoryFor !== null && (
        <InventoryModal
          filterSlot={inventoryFor === 'all' ? null : (inventoryFor as EquipSlot)}
          inventory={instances}
          catalog={catalog}
          sprites={sprites}
          onClose={() => setInventoryFor(null)}
          onPickInstance={handlePickInstance}
        />
      )}

      {quizOpen && content && (
        <QuizModal
          pool={content.questions}
          subjectFilter="藥理學"
          count={5}
          dueQuestionIds={dueQuestionIds}
          onClose={onQuizComplete}
        />
      )}

      {reviewOpen && content && (
        <QuizModal
          pool={content.questions}
          subjectFilter="藥理學"
          mode="review"
          dueQuestionIds={dueQuestionIds}
          onClose={onQuizComplete}
        />
      )}

      {bossOpen && content && (
        <BossModal
          pool={content.questions}
          subject="藥理學"
          onClose={onBossComplete}
        />
      )}

      {mentorOpen && mentorBacklog && content && (() => {
        const headId = mentorBacklog.questionIds[0]
        const question = content.questions.find((q) => q.id === headId)
        if (!question) {
          // Orphaned ID — silently pop and close
          const { rest } = consumeBacklog(mentorBacklog)
          saveBacklog(rest).catch((err) => console.error('[mentor] orphan pop failed:', err))
          setMentorBacklog(rest)
          setMentorOpen(false)
          return null
        }
        return (
          <MentorDialog
            question={question}
            backlogRemaining={mentorBacklog.questionIds.length}
            showMasteredHint={mentorPickMode === 'random'}
            sprites={sprites}
            suppressSkipConfirm={suppressSkipConfirm}
            onFirstSkipConfirm={() => setSuppressSkipConfirm(true)}
            onAnswered={async ({ questionId, correct, elapsedMs }) => {
              // 1. Compute reward
              const today = getTaipeiToday()
              setPlayer((p) => {
                // increment quiz-answered counter + maybe check-in
                let next = incrementQuestionsAnswered(p, today, 1)
                if (hasMetCheckInThreshold(next, today)) {
                  next = applyCheckIn(next, today)
                }
                const multiplier = getStreakMultiplier(next.currentStreak)
                const reward = computeMentorReward(correct, elapsedMs, multiplier)
                let stats = next.stats
                for (const delta of reward.statDeltas) {
                  stats = addStat(stats, delta.name, delta.delta)
                }
                next = applyXp({ ...next, stats }, reward.xpGain).player
                return next
              })
              // 2. Write SRS card for wrong answer (mirror QuizModal pattern)
              if (!correct) {
                const db = getDB()
                const now = Date.now()
                try {
                  const existing = await db.srs.get(questionId)
                  if (!existing) await db.srs.put(newCard(questionId, now))
                } catch (err) {
                  console.error('[mentor] srs enqueue failed:', err)
                }
              }
              // 3. Emit cross-app event (二階 listener may be registered)
              if (correct) quizEvents.emit('correct-answer')
              // 4. Record attempt
              try {
                await getDB().attempts.put({
                  id: `mentor-${Date.now()}`,
                  questionId,
                  ts: Date.now(),
                  picked: correct ? question.answer : 'wrong',
                  correct,
                  msTaken: elapsedMs,
                  mode: 'daily',
                })
              } catch (err) {
                console.error('[mentor] attempt persist failed:', err)
              }
              // 5. Pop backlog (after dialog auto-close / user click "繼續" / "關閉")
              const { rest } = consumeBacklog(mentorBacklog)
              await saveBacklog(rest)
              setMentorBacklog(rest)
            }}
            onSkipped={async () => {
              // Skip = NO streak increment, NO XP, just pop the question
              const { rest } = consumeBacklog(mentorBacklog)
              await saveBacklog(rest)
              setMentorBacklog(rest)
            }}
            onClose={() => setMentorOpen(false)}
          />
        )
      })()}
    </>
  )

  const currentToast = skillToasts[0]
  return (
    <div className="app">
      <header className="app-header">
        <h1>一階國考 RPG</h1>
        <div className="tag">study-rpg · pixel-medical · medexam-tw</div>
        <StreakChip
          currentStreak={player.currentStreak}
          longestStreak={player.longestStreak}
        />
      </header>

      <Routes>
        <Route path="/" element={homeView} />
        <Route
          path="/skills"
          element={
            <SkillTreeRoute
              content={skillTreeContent}
              statSchema={STAT_SCHEMA}
              stats={player.stats}
              sprites={sprites}
            />
          }
        />
        {content && (
          <Route path="/mock" element={<MockPickerRoute content={content} />} />
        )}
        {content && (
          <Route
            path="/mock/run/:paperId"
            element={
              <MockRunnerRoute
                content={content}
                player={player}
                setPlayer={setPlayer}
                onGuaranteedSRRoll={() => doRoll('mock')}
              />
            }
          />
        )}
        {content && (
          <Route path="/mock/result/:attemptId" element={<MockResultRoute content={content} />} />
        )}
        <Route
          path="/dorm"
          element={
            <DormRoute
              player={player}
              setPlayer={setPlayer}
              instances={instances}
              setInstances={setInstances}
              catalog={COSMETIC_CATALOG}
              sprites={sprites}
              defaultCharacterSpriteKey={CHARACTER_VARIANTS[0]}
            />
          }
        />
      </Routes>

      <AnimatePresence>
        {currentToast && (
          <SkillUnlockToast
            key={currentToast.id}
            node={currentToast.node}
            spriteUrl={sprites[currentToast.node.spriteKey]}
            onDone={() => setSkillToasts((q) => q.slice(1))}
          />
        )}
        {streakBreakToast && (
          <StreakBreakToast
            key="streak-break"
            onDone={() => setStreakBreakToast(false)}
          />
        )}
        {cosmeticUnlockToasts[0] && (
          <CosmeticUnlockToast
            key={cosmeticUnlockToasts[0].id}
            cosmetic={cosmeticUnlockToasts[0].cosmetic}
            spriteUrl={sprites[cosmeticUnlockToasts[0].cosmetic.artKey]}
            onDone={() => setCosmeticUnlockToasts((q) => q.slice(1))}
          />
        )}
      </AnimatePresence>

      {gateState === 'migration-upload' && (
        <MigrationUploadPrompt
          email={authUser?.email ?? null}
          onChoose={resolveUploadPrompt}
        />
      )}

      {(gateState === 'conflict-chooser' || gateState === 'paused') && gateSnapshot && (
        <ConflictChooserModal
          email={authUser?.email ?? null}
          localMaxUpdatedAt={gateSnapshot.localMaxUpdatedAt}
          cloudMaxUpdatedAt={gateSnapshot.cloudMaxUpdatedAt}
          hasSettingsEntry
          onChoose={resolveConflictChooser}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          email={authUser?.email ?? null}
          status={syncStatus}
          lastPushAt={lastPushAt}
          lastPullAt={lastPullAt}
          gateState={gateState}
          onSignOut={async () => {
            await signOut()
            setSettingsOpen(false)
          }}
          onReopenConflictChooser={async () => {
            await reopenConflictChooser()
            setSettingsOpen(false)
          }}
          onResetMigrationPreference={resetMigrationPreference}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <footer className="credits">
        Question bank © 中華民國考選部 / 詳解 © <a href="https://sites.google.com/view/ymmedexam/ans" target="_blank" rel="noreferrer">陽明國考考古題小組</a> (CC-BY-NC)
        <br />
        Engine + theme: AGPL-3.0 · <a href="https://github.com/fireman333/study-rpg" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  )
}
