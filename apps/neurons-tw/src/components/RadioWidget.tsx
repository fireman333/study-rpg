// Lofi radio widget — pixel-radio UI over the framework-agnostic `radio` engine.
// Music comes from the Lofi像素電台 library (med-study-rpg.com/lofi/); see lib/radio/engine.ts.
// Collapsible, OFF-by-default egg mounted at the bottom of OverviewPage (below the maze).
import { useEffect, useRef, useState } from 'react'
import { radio, type RadioState } from '../lib/radio/engine'
import './RadioWidget.css'

const VU_BARS = 12

export default function RadioWidget(): JSX.Element {
  const [state, setState] = useState<RadioState>(() => radio.getState())
  const [expanded, setExpanded] = useState(false)
  const [showChips, setShowChips] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [spin, setSpin] = useState<{ dir: 'l' | 'r'; n: number } | null>(null)

  // subscribe to engine state
  useEffect(() => radio.subscribe(() => setState(radio.getState())), [])

  // VU meter — poll analyser each frame while the widget is expanded
  const vuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded) return
    let raf = 0
    const tick = (): void => {
      const bars = vuRef.current?.children
      if (bars) {
        const levels = radio.getVU(VU_BARS)
        for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.height = `${(levels[i] ?? 0.06) * 100}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [expanded])

  const bump = (dir: 'l' | 'r'): void => setSpin({ dir, n: (spin?.n ?? 0) + 1 })
  const tuneL = (): void => { bump('l'); radio.prevMode() }
  const tuneR = (): void => { bump('r'); radio.nextMode() }

  const { mode, label, zh, stat, playing, paused, loading, error, trackId, volume, crossfadeOn, selectedStyles, styleIds, styleZh } = state
  const on = playing && !paused

  return (
    <div className="nradio">
      <div className={`radio${expanded ? '' : ' collapsed'}`}>
        <div className={`handle${on ? ' on' : ''}`} onClick={() => { if (!expanded) radio.preload().catch(() => { /* retried on play */ }); setExpanded((e) => !e) }}>
          <span><span className="dot" />📻 lofi 電台 · {label}</span>
          <span className="caret">{expanded ? '▾ 收起' : '▸ 展開'}</span>
        </div>
        {expanded && (
          <div className="body">
            <div className="bar">
              <div className="dials">
                <div className="lab">▚ 選台 TUNE</div>
                <div className="knobrow">
                  <div className={`knob${spin?.dir === 'l' ? ' turn-l' : ''}`} key={`l${spin?.dir === 'l' ? spin.n : ''}`} onClick={tuneL} />
                  <div className={`knob${spin?.dir === 'r' ? ' turn-r' : ''}`} key={`r${spin?.dir === 'r' ? spin.n : ''}`} onClick={tuneR} />
                </div>
              </div>
              <div className="lcd">
                <div className="lcd-top"><span>FM · LO-FI</span><span>{stat}</span></div>
                <div className="lcd-mid">
                  <span className={`mode${mode === 'OFF' ? ' off' : ''}`}>{label}</span>
                  <span className="zh">{mode === 'RANDOM' ? '混合' : zh}</span>
                  <div className="vu" ref={vuRef}>{Array.from({ length: VU_BARS }, (_, i) => <i key={i} />)}</div>
                </div>
                <div className="now">{mode === 'OFF' ? '轉左邊旋鈕選台 ►' : error ? `⚠ ${error} · 按 ►| 重試` : loading ? '♪ 調頻中…' : trackId ? `♪ ${trackId}` : '…'}</div>
              </div>
              <div className="transport">
                <div className="tbtns">
                  <button className="pb" title="上一首" onClick={() => radio.prev()}>|◄</button>
                  <button className="pb play" title="播放/暫停" onClick={() => radio.togglePlay()}>{on && trackId ? '❚❚' : '►'}</button>
                  <button className="pb" title="下一首" onClick={() => radio.next()}>►|</button>
                </div>
                <div className="vol"><span>VOL</span><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => radio.setVolume(parseFloat(e.target.value))} /></div>
              </div>
            </div>
            <div className="subbar">
              <button className={`subtog${showChips ? ' active' : ''}`} onClick={() => setShowChips((s) => !s)}>🎛 選台清單</button>
              <button className={`subtog${crossfadeOn ? ' active' : ''}`} onClick={() => radio.toggleCrossfade()}>🎚 Crossfade：{crossfadeOn ? '開 6s' : '關'}</button>
              <button className={`subtog${showHint ? ' active' : ''}`} onClick={() => setShowHint((s) => !s)}>ℹ 說明</button>
            </div>
            {showChips && (
              <div className="panel">
                <h4>▸ RANDOM 混合電台 — 點選要納入哪些台</h4>
                <div className="chiprow">
                  {styleIds.map((s) => {
                    const sel = selectedStyles.includes(s)
                    return <div key={s} className={`chip${sel ? ' on' : ''}`} onClick={() => radio.setStyleSelected(s, !sel)}>{sel ? '☑' : '☐'} {styleZh[s] ?? s}</div>
                  })}
                </div>
              </div>
            )}
            {showHint && (
              <div className="panel">
                左邊旋鈕 = 選台（RANDOM · {styleIds.length} 台 · Off）。右邊 = |◄ 上一首 / ► 播放暫停 / ►| 下一首。<br />
                曲目來自 Lofi像素電台，每首播完自動換下一首；可開 crossfade 讓曲尾交疊。各台音量已平衡。預設 OFF · 收合，塞在迷宮下方當彩蛋。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
