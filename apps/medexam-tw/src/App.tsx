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
  type Player,
  type RollResult,
  type EquipSlot,
  type ItemInstance,
  type Item,
  type ContentPack,
} from '@study-rpg/core'
import { THEME_PIXEL_MEDICAL } from '@study-rpg/theme-pixel-medical'
import { getContentPack } from '@study-rpg/content-medexam-tw'
import { CharCard } from './components/CharCard'
import { InventoryModal } from './components/InventoryModal'
import { RollReveal } from './components/RollReveal'
import { QuizModal, type QuizResult } from './components/QuizModal'

const STAT_SCHEMA = DEFAULT_STAT_SCHEMA
const STARTER_NAME = '見習醫師'

/** Ordered list of character sprite variants the player can cycle through. */
const CHARACTER_VARIANTS = ['character-base', 'character-base-female'] as const

export default function App() {
  const [player, setPlayer] = useState<Player>(() =>
    newPlayer('p1', STARTER_NAME, STAT_SCHEMA.order),
  )
  const [instances, setInstances] = useState<ItemInstance[]>([])
  const [reveal, setReveal] = useState<RollResult | null>(null)
  const [inventoryFor, setInventoryFor] = useState<EquipSlot | null | 'all'>(null)
  const [readMs, setReadMs] = useState(0)
  const [reading, setReading] = useState(false)
  const [content, setContent] = useState<ContentPack | null>(null)
  const [quizOpen, setQuizOpen] = useState(false)

  // Load content pack at mount
  useEffect(() => {
    getContentPack('/study-rpg/content/medexam-tw')
      .then(setContent)
      .catch((err) => {
        console.error('Failed to load content pack:', err)
      })
  }, [])

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

  // Reading timer — every 10s simulated minute → +5 XP, +1 stamina
  useEffect(() => {
    if (!reading) return
    const t = setInterval(() => setReadMs((m) => m + 1000), 1000)
    return () => clearInterval(t)
  }, [reading])

  useEffect(() => {
    if (readMs > 0 && readMs % 10_000 === 0) {
      setPlayer((p) => {
        const stats = addStat(p.stats, REWARD.readPerMinute.stat.name, REWARD.readPerMinute.stat.delta)
        return applyXp({ ...p, stats }, REWARD.readPerMinute.xp).player
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readMs])

  function doRoll(source: 'read' | 'quiz' | 'boss-mini') {
    setPlayer((p) => {
      const r = rollLoot(catalog, p.lootStats)
      if (!r) return p
      const inst = instanceFromRoll(r, source)
      setInstances((prev) => [...prev, inst.instance])
      setReveal(r)
      return {
        ...p,
        lootStats: r.newStats,
        inventory: [...p.inventory, inst.instance.id],
      }
    })
  }

  /** Batched reward calculation for a multi-Q quiz session. */
  function onQuizComplete(results: QuizResult[]) {
    setQuizOpen(false)
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
  }

  function fightMiniBoss() {
    const correctCount = Math.round(30 * 0.7)
    setPlayer((p) => ({
      ...applyXp(p, REWARD.bossMiniPass.xp).player,
      badges: [...p.badges, 'boss:藥理學:mini'],
    }))
    for (let i = 0; i < 3; i++) setTimeout(() => doRoll('boss-mini'), i * 200)
    alert(`Mini-boss 通關！答對 ${correctCount}/30，獲得 3 次抽卡。`)
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
          <button onClick={() => setReading((r) => !r)}>
            <span className="label">{reading ? '⏸ 暫停閱讀' : '📖 開始閱讀'}</span>
            <span className="hint">
              {reading
                ? `已累積 ${Math.floor(readMs / 1000)} s (demo: 10s = 1 min)`
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

          <button onClick={fightMiniBoss}>
            <span className="label">⚔ 挑戰 mini-boss（藥理學）</span>
            <span className="hint">demo：直接通關 + 3 次抽卡</span>
          </button>

          <button onClick={() => doRoll('read')}>
            <span className="label">🎲 手動測試一次抽卡</span>
            <span className="hint">總抽卡：{player.lootStats.totalRolls} · 距下次 SR 保底：{30 - player.lootStats.rollsSinceLastSR}</span>
          </button>

          <button onClick={() => setInventoryFor('all')} disabled={instances.length === 0}>
            <span className="label">🎒 開啟背包</span>
            <span className="hint">{instances.length} 件 · 點 item 裝備到對應 slot</span>
          </button>
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
          onClose={onQuizComplete}
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
