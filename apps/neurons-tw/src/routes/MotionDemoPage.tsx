/**
 * Self-verify demo for neurons-motion-library. One trigger button per
 * exported primitive — enables `/opsx:apply` to verify the change end-to-end
 * without depending on any future capability ship.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Self-verify /motion-demo route SHALL trigger each exported primitive
 *    in isolation for apply-time verification"
 */

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  AchievementUnlockModal,
  AmbientFiring,
  AnswerFeedbackFlash,
  CelebrationHalo,
  NumberTickUp,
  RARITY_TIMINGS,
  RarityRevealModal,
  SignalOscillation,
  SpikeTrainFiring,
  SPIKE_TRAIN_TIMING,
  OSCILLATION_TIMING,
  Toast,
  useRespectsReducedMotion,
  type Rarity,
} from '../lib/motion'
import { SynapseDemoSvg } from '../components/connectome/SynapseDemoSvg'
import { SpriteSheetPlayer, type SpriteState } from '../components/SpriteSheetPlayer'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'

type ActiveDemo =
  | { kind: 'none' }
  | { kind: 'toast' }
  | { kind: 'tickup'; nonce: number }
  | { kind: 'reveal'; rarity: Rarity }
  | { kind: 'achievement' }
  | { kind: 'spike'; nonce: number }
  | { kind: 'flash'; outcome: 'correct' | 'incorrect'; nonce: number }
  | { kind: 'halo'; intensity: number; nonce: number }

export default function MotionDemoPage(): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const [active, setActive] = useState<ActiveDemo>({ kind: 'none' })
  const [hero, setHero] = useState<{ state: SpriteState; nonce: number }>({ state: 'idle', nonce: 0 })
  const close = (): void => setActive({ kind: 'none' })

  return (
    <section style={{ padding: '0.5rem 0' }}>
      <h2 style={{ marginTop: 0 }}>🎬 Motion library demo</h2>
      <p style={{ color: '#5a3f29', fontStyle: 'italic' }}>
        Self-verify route for <code>neurons-motion-library</code> capability.
        每個按鈕觸發一個 primitive；切系統 a11y 「prefers-reduced-motion」可比對 soft mode。
        <br />
        目前偵測到 prefers-reduced-motion = <strong>{reduced ? 'reduce' : 'no-preference'}</strong>
      </p>

      <h3 style={h3Style}>🧬 Hero 立繪三段動畫（add-neurons-sprite-animation-slice）</h3>
      <p style={{ margin: '0 0 0.5rem', color: '#5a3f29' }}>
        藥理學 slot 3「突觸快樂使者」· sprite-sheet（CSS steps，非逐幀 JS）· idle loop / correct 一次 / evolve 一次
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.2rem', marginBottom: '0.6rem' }}>
        <SpriteSheetPlayer
          key={`hero-${hero.state}-${hero.nonce}`}
          spriteKeyBase="variant:藥理學:3"
          state={hero.state}
          size={192}
          onComplete={() => setHero((h) => ({ state: 'idle', nonce: h.nonce + 1 }))}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button style={btnStyle} onClick={() => setHero((h) => ({ state: 'idle', nonce: h.nonce + 1 }))}>
            🔁 idle loop
          </button>
          <button style={btnStyle} onClick={() => setHero((h) => ({ state: 'correct', nonce: h.nonce + 1 }))}>
            ⚡ correct（答對反應，播一次）
          </button>
          <button style={btnStyle} onClick={() => setHero((h) => ({ state: 'evolve', nonce: h.nonce + 1 }))}>
            ✦ evolve（變體進化，播一次）
          </button>
          <span style={{ fontSize: '0.75rem', color: '#8c6d4a' }}>目前 state：{hero.state}</span>
        </div>
      </div>

      <h3 style={h3Style}>✨ 全域 idle「活著感」CSS（套靜態立繪，非 hero）</h3>
      <p style={{ margin: '0 0 0.5rem', color: '#5a3f29' }}>
        <code>.neuron-sprite--alive</code> = 金光脈動 + 輕微擺動（不同週期錯相位）；一套 CSS 套用全部 55 隻，
        prefers-reduced-motion 自動停。
      </p>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {(['variant:藥理學:1', 'variant:免疫學:1', 'variant:病理學:1', 'variant:解剖學:1'] as const).map((k) => (
          <img
            key={k}
            className="neuron-sprite--alive"
            src={SPRITE_MAP[k] ?? SPRITE_MAP['variant:default']}
            width={96}
            height={96}
            alt=""
            style={{ imageRendering: 'pixelated' }}
          />
        ))}
      </div>

      <h3 style={h3Style}>Toast primitive</h3>
      <button style={btnStyle} onClick={() => setActive({ kind: 'toast' })}>
        🎉 觸發 celebratory toast（8s 自動消失）
      </button>

      <h3 style={h3Style}>NumberTickUp primitive</h3>
      <p>
        模擬 AP 0 → 100：
        <span
          style={{
            display: 'inline-block',
            minWidth: '3rem',
            marginLeft: '0.5rem',
            fontWeight: 700,
          }}
        >
          {active.kind === 'tickup' ? (
            <NumberTickUp key={active.nonce} from={0} to={100} durationMs={900} />
          ) : (
            '—'
          )}
        </span>
      </p>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'tickup', nonce: Date.now() })}
      >
        🔢 觸發 number tick-up 0 → 100
      </button>

      <h3 style={h3Style}>RarityRevealModal × 5 rarities</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {(['P5', 'P4', 'P3', 'P2', 'P1'] as Rarity[]).map((r) => (
          <button
            key={r}
            style={{ ...btnStyle, marginBottom: 0 }}
            onClick={() => setActive({ kind: 'reveal', rarity: r })}
          >
            🎴 {r}（{RARITY_TIMINGS[r].total}ms）
          </button>
        ))}
      </div>

      <h3 style={h3Style}>AchievementUnlockModal (P1 full-screen)</h3>
      <button style={btnStyle} onClick={() => setActive({ kind: 'achievement' })}>
        🏆 觸發 P1 鑽石解鎖
      </button>

      <h3 style={h3Style}>EEG spike-train firing（答對 firing）</h3>
      <p style={{ margin: '0 0 0.4rem' }}>
        模擬答對時的 spike-train burst（{SPIKE_TRAIN_TIMING.spikes} spikes ·{' '}
        {SPIKE_TRAIN_TIMING.burst + SPIKE_TRAIN_TIMING.settle}ms）：
        <span
          style={{
            display: 'inline-block',
            minWidth: 160,
            height: 32,
            marginLeft: '0.5rem',
            verticalAlign: 'middle',
          }}
        >
          {active.kind === 'spike' && <SpikeTrainFiring key={active.nonce} width={160} />}
        </span>
      </p>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'spike', nonce: Date.now() })}
      >
        ⚡ 觸發 spike-train firing
      </button>

      <h3 style={h3Style}>Signal-oscillation（loading / pending）</h3>
      <p style={{ margin: '0 0 0.4rem' }}>
        持續 loop 的訊號震盪（{OSCILLATION_TIMING.period}ms period）：
        <span style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
          <SignalOscillation width={120} height={24} />
        </span>
      </p>

      <h3 style={h3Style}>Ambient resting-state firing（homepage hero 環境動態）</h3>
      <p style={{ margin: '0 0 0.4rem' }}>
        CSS-driven（compositor，背景分頁不凍結）的休息態 firing constellation：
        <span style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
          <AmbientFiring width={160} />
        </span>
      </p>

      <h3 style={h3Style}>Answer-feedback flash（答題即時回饋）</h3>
      <div
        style={{
          position: 'relative',
          height: 80,
          border: '2px dashed #c4a878',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5a3f29',
          marginBottom: '0.5rem',
        }}
      >
        模擬答題容器（flash 為 inset overlay，不阻擋流程）
        {active.kind === 'flash' && (
          <AnswerFeedbackFlash key={active.nonce} outcome={active.outcome} onComplete={close} />
        )}
      </div>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'flash', outcome: 'correct', nonce: Date.now() })}
      >
        🟢 答對 flash
      </button>
      <button
        style={btnStyle}
        onClick={() => setActive({ kind: 'flash', outcome: 'incorrect', nonce: Date.now() })}
      >
        🔴 答錯 flash
      </button>

      <h3 style={h3Style}>Celebration halo（獎勵增強層）</h3>
      <div
        style={{
          position: 'relative',
          height: 140,
          border: '2px dashed #c4a878',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5a3f29',
          marginBottom: '0.5rem',
          overflow: 'hidden',
        }}
      >
        增強慶祝層（疊在 reveal / celebratory toast 上）
        {active.kind === 'halo' && (
          <CelebrationHalo key={active.nonce} intensity={active.intensity} />
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {[1, 2, 3].map((lvl) => (
          <button
            key={lvl}
            style={{ ...btnStyle, marginBottom: 0 }}
            onClick={() => setActive({ kind: 'halo', intensity: lvl, nonce: Date.now() })}
          >
            ✨ halo intensity {lvl}
          </button>
        ))}
      </div>

      <h3 style={h3Style}>Synapse tree animations</h3>
      <SynapseDemoSvg />

      <AnimatePresence>
        {active.kind === 'toast' && (
          <Toast variant="celebratory" onDismiss={close}>
            <strong>新連線形成：</strong>「胚胎學」⇌「藥理學」 — wire together
          </Toast>
        )}
      </AnimatePresence>

      {active.kind === 'reveal' && (
        <RarityRevealModal
          key={`reveal-${active.rarity}`}
          rarity={active.rarity}
          title={`${active.rarity} 神經元變體`}
          onComplete={close}
        >
          {active.rarity === 'P1' ? '✦ 傳說神經元 ✦' : '示範揭曉內容'}
        </RarityRevealModal>
      )}

      {active.kind === 'achievement' && (
        <AchievementUnlockModal
          onDismiss={close}
          achievement={{
            tierLabel: 'P1 💎 鑽石',
            badge: '🧠',
            title: '11 種 NT 全家族點亮',
            description: '同一天讓 4 個 NT branch 的代表 family 各自 fire ≥ 5 次',
            rewardLabel: '稱號：神經迴路大師',
            ctaLabel: '太強了！',
          }}
        />
      )}
    </section>
  )
}

const h3Style: React.CSSProperties = {
  fontSize: '0.95rem',
  marginTop: '1.2rem',
  marginBottom: '0.4rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.2rem',
}

const btnStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.5rem 0.85rem',
  color: '#5a3f29',
  cursor: 'pointer',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  marginRight: '0.5rem',
  marginBottom: '0.5rem',
}
