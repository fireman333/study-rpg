import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  rollLoot,
  instanceFromRoll,
  newPlayer,
  applyXp,
  addStat,
  REWARD,
  DEFAULT_STAT_SCHEMA,
  getDB,
  newCard,
  reviewCard,
  type Player,
  type RollResult,
  type EquipSlot,
  type ItemInstance,
  type Item,
  type ContentPack,
  type QuestionId,
} from '@study-rpg/core'
import { THEME_PIXEL_MEDICAL } from '@study-rpg/theme-pixel-medical'
import { getContentPack } from '@study-rpg/content-medexam-tw'
import { CharCard } from './components/CharCard'
import { InventoryModal } from './components/InventoryModal'
import { RollReveal } from './components/RollReveal'
import { QuizModal, REVIEW_BATCH_SIZE, type QuizResult, type QuestionResult } from './components/QuizModal'
import { BossModal, type BossRunResult } from './components/BossModal'
import { PersistenceButtons } from './components/PersistenceButtons'

const STAT_SCHEMA = DEFAULT_STAT_SCHEMA
const STARTER_NAME = '見習醫師'
const PLAYER_ID = 'p1'
const SAVE_SCHEMA_VERSION = 1

/** Ordered list of character sprite variants the player can cycle through. */
const CHARACTER_VARIANTS = ['character-base', 'character-base-female'] as const

/** Per-tick reward cap. Demo: 10s = "1 minute"; M2 prod can bump to 60_000. */
const READING_TICK_MS = 10_000
/** Idle pause threshold (no mousemove/keydown/touchstart). */
const READING_IDLE_TIMEOUT_MS = 90_000

type PauseReason = 'manual' | 'visibility' | 'idle' | null

export default function App() {
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

  const catalog = useMemo(() => THEME_PIXEL_MEDICAL.itemCatalog, [])
  const sprites = useMemo(() => THEME_PIXEL_MEDICAL.sprites, [])

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

  // Reading timer — tick every 1s while reading; pause clears reason on resume
  useEffect(() => {
    if (!reading) return
    setPauseReason(null)
    const t = setInterval(() => setReadMs((m) => m + 1000), 1000)
    return () => clearInterval(t)
  }, [reading])

  // Per-READING_TICK_MS reward (per-minute cap enforced via modulo)
  useEffect(() => {
    if (readMs > 0 && readMs % READING_TICK_MS === 0) {
      setPlayer((p) => {
        const stats = addStat(p.stats, REWARD.readPerMinute.stat.name, REWARD.readPerMinute.stat.delta)
        return applyXp({ ...p, stats }, REWARD.readPerMinute.xp).player
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

  function doRoll(source: 'read' | 'quiz' | 'boss-mini') {
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
    setQuizOpen(false)
    setReviewOpen(false)
    if (results.length === 0) return
    setPlayer((p) => {
      let next = p
      for (const r of results) {
        const reward = r.correct ? REWARD.quizCorrect : REWARD.quizWrong
        const stats = 'stat' in reward && reward.stat
          ? addStat(next.stats, reward.stat.name, reward.stat.delta)
          : next.stats
        next = applyXp({ ...next, stats }, reward.xp).player
      }
      return next
    })
    const correctCount = results.filter((r) => r.correct).length
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>一階國考 RPG</h1>
        <div className="tag">study-rpg · pixel-medical · medexam-tw</div>
      </header>

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

      <footer className="credits">
        Question bank © 中華民國考選部 / 詳解 © <a href="https://sites.google.com/view/ymmedexam/ans" target="_blank" rel="noreferrer">陽明國考考古題小組</a> (CC-BY-NC)
        <br />
        Engine + theme: AGPL-3.0 · <a href="https://github.com/fireman333/study-rpg" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  )
}
