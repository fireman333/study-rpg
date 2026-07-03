// Lofi radio audio engine — framework-agnostic singleton.
// Ported from music-lab/radio-mockup.html (dogfood-validated). Web Audio gapless loop
// (AudioBufferSourceNode.loop) + equal-power crossfade + per-track loudness normalization
// (gainmap) + memory-bounded decode cache (≤3) + station selection (RANDOM / 7 styles /
// pop-borrow / OFF). Its own AudioContext — independent of MazeGrid SFX.

import stationsRaw from './stations.json'
import gainmapRaw from './gainmap.json'

const STATIONS = stationsRaw as Record<string, string[]>
const GAIN = gainmapRaw as Record<string, { gain: number }>

// Display metadata per style (labels/zh only; track lists come from stations.json).
const STATION_META: Record<string, { label: string; zh: string }> = {
  jazzhop: { label: 'JAZZHOP', zh: '咖啡爵士' },
  'rain-piano': { label: 'RAIN PIANO', zh: '雨天鋼琴' },
  boombap: { label: 'BOOM-BAP', zh: '唸書嘻哈' },
  binaural: { label: 'BINAURAL', zh: '雙耳氛圍' },
  lofihouse: { label: 'LO-FI HOUSE', zh: '軟脈動' },
  musicbox: { label: 'MUSIC BOX', zh: '音樂盒' },
  lofigirl: { label: 'LOFI GIRL', zh: '讀書電台' },
  'pop-borrow': { label: 'POP BORROW', zh: '流行借用' },
}

const STYLE_IDS = Object.keys(STATIONS)
const MODES = ['RANDOM', ...STYLE_IDS, 'OFF'] as const
const SET_SECONDS = 180 // auto-advance interval per track
const XFADE = 6 // crossfade seconds when enabled
const XFADE_OFF = 0.25 // quick micro-join when crossfade off
const CACHE_CAP = 3 // decoded-buffer memory bound (iOS-safe)

const BGM_BASE = (import.meta.env.VITE_BGM_BASE_URL as string | undefined)?.replace(/\/?$/, '/') ||
  `${import.meta.env.BASE_URL}bgm/`

export type RadioStat = 'STANDBY' | 'ON AIR' | 'PAUSED'
export interface RadioState {
  mode: string // current MODES value
  label: string // display label (RANDOM / style label / OFF)
  zh: string // chinese subtitle ('' for RANDOM/OFF handled by UI)
  stat: RadioStat
  playing: boolean // a mode other than OFF is active
  paused: boolean
  trackId: string | null
  volume: number
  crossfadeOn: boolean
  selectedStyles: string[] // which styles feed RANDOM
  styleIds: string[] // all style ids (for chips)
  modes: readonly string[]
}

const shuffle = <T>(a: T[]): T[] => {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] }
  return r
}

interface Deck { src: AudioBufferSourceNode; gain: GainNode; id: string; timer: ReturnType<typeof setTimeout> }

class RadioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0)

  private modeIdx = MODES.indexOf('OFF')
  private gen = 0
  private deck: Deck | null = null
  private paused = false
  private volume = 0.55
  private crossfadeOn = false
  private selected = new Set<string>(STYLE_IDS)

  private bag: string[] = []
  private history: string[] = []
  private hpos = -1
  private cache = new Map<string, AudioBuffer>()
  private listeners = new Set<() => void>()

  private curMode(): string { return MODES[this.modeIdx] }

  // ── public state / subscription ──
  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb) }
  private emit(): void { this.listeners.forEach((cb) => cb()) }

  getState(): RadioState {
    const m = this.curMode()
    const meta = STATION_META[m]
    return {
      mode: m,
      label: m === 'RANDOM' ? 'RANDOM' : m === 'OFF' ? 'OFF' : meta?.label ?? m,
      zh: m === 'RANDOM' || m === 'OFF' ? '' : meta?.zh ?? '',
      stat: m === 'OFF' ? 'STANDBY' : this.paused ? 'PAUSED' : 'ON AIR',
      playing: m !== 'OFF',
      paused: this.paused,
      trackId: this.deck?.id ?? null,
      volume: this.volume,
      crossfadeOn: this.crossfadeOn,
      selectedStyles: [...this.selected],
      styleIds: STYLE_IDS,
      modes: MODES,
    }
  }

  /** Real-time VU levels (0..1) for the analyser — poll from rAF. */
  getVU(bars: number): number[] {
    if (!this.analyser || !this.deck || this.paused) return new Array(bars).fill(0.06)
    this.analyser.getByteFrequencyData(this.freq)
    const out: number[] = []
    for (let i = 0; i < bars; i++) out.push(Math.max(0.06, (this.freq[i + 1] || 0) / 255))
    return out
  }

  // ── audio graph ──
  private ensureCtx(): void {
    if (this.ctx) return
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 64
    this.freq = new Uint8Array(this.analyser.frequencyBinCount)
    this.master.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
  }

  private async decode(id: string): Promise<AudioBuffer> {
    const hit = this.cache.get(id)
    if (hit) return hit
    const r = await fetch(`${BGM_BASE}${id}.ogg`)
    const buf = await this.ctx!.decodeAudioData(await r.arrayBuffer())
    this.cache.set(id, buf)
    if (this.cache.size > CACHE_CAP) this.cache.delete(this.cache.keys().next().value as string)
    return buf
  }

  private trackGain(id: string): number { return GAIN[id]?.gain ?? 1 }

  private refillBag(): void {
    const m = this.curMode()
    if (m === 'RANDOM') {
      let all: string[] = []
      for (const s of this.selected) all = all.concat(STATIONS[s] || [])
      this.bag = shuffle(all)
    } else if (m !== 'OFF') {
      this.bag = shuffle(STATIONS[m] || [])
    } else this.bag = []
  }

  private drawNext(): string | null {
    if (!this.bag.length) this.refillBag()
    if (!this.bag.length) return null
    let id = this.bag.shift() as string
    if (this.history.length && id === this.history[this.hpos] && this.bag.length) { this.bag.push(id); id = this.bag.shift() as string }
    return id
  }

  private async play(id: string | null, crossfade = true): Promise<void> {
    if (!id) return
    this.ensureCtx()
    if (this.ctx!.state === 'suspended') { try { await this.ctx!.resume() } catch { /* gesture pending */ } }
    const myGen = this.gen
    let buf: AudioBuffer
    try { buf = await this.decode(id) } catch { return }
    if (myGen !== this.gen) return
    const src = this.ctx!.createBufferSource()
    src.buffer = buf
    src.loop = true
    const g = this.ctx!.createGain()
    g.connect(this.master!)
    src.connect(g)
    const t = this.ctx!.currentTime
    const tg = this.trackGain(id)
    const old = this.deck
    const xf = this.crossfadeOn ? XFADE : XFADE_OFF
    if (crossfade && old) {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(tg, t + xf)
      try {
        old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), t)
        old.gain.gain.exponentialRampToValueAtTime(0.0001, t + xf)
        old.src.stop(t + xf + 0.1)
      } catch { /* already stopped */ }
      clearTimeout(old.timer)
      src.start(t)
    } else {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(tg, t + 0.5)
      src.start(t)
    }
    const timer = setTimeout(() => { if (myGen === this.gen) this.next() }, SET_SECONDS * 1000)
    this.deck = { src, gain: g, id, timer }
    if (this.bag.length) this.decode(this.bag[0]).catch(() => { /* prefetch best-effort */ })
    this.paused = false
    this.emit()
  }

  private stopAll(): void {
    this.gen++
    if (this.deck && this.ctx) {
      try {
        const t = this.ctx.currentTime
        this.deck.gain.gain.setValueAtTime(Math.max(0.0001, this.deck.gain.gain.value), t)
        this.deck.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1)
        this.deck.src.stop(t + 1.2)
      } catch { /* already stopped */ }
      clearTimeout(this.deck.timer)
    }
    this.deck = null
  }

  // ── public controls ──
  next(): void {
    if (this.curMode() === 'OFF') return
    this.gen++
    if (this.hpos < this.history.length - 1) { this.hpos++; void this.play(this.history[this.hpos]) }
    else { const id = this.drawNext(); if (!id) return; this.history.push(id); this.hpos = this.history.length - 1; void this.play(id) }
  }

  prev(): void {
    if (this.curMode() === 'OFF') return
    this.gen++
    if (this.hpos > 0) { this.hpos--; void this.play(this.history[this.hpos]) }
    else if (this.deck) void this.play(this.history[this.hpos])
  }

  setMode(i: number): void {
    this.modeIdx = ((i % MODES.length) + MODES.length) % MODES.length
    const m = this.curMode()
    this.history = []; this.hpos = -1; this.bag = []; this.gen++
    if (m === 'OFF') { this.stopAll(); this.emit(); return }
    this.refillBag()
    const id = this.drawNext()
    if (id) { this.history.push(id); this.hpos = 0; void this.play(id, !!this.deck) }
    this.emit()
  }

  nextMode(): void { this.setMode(this.modeIdx + 1) }
  prevMode(): void { this.setMode(this.modeIdx - 1) }

  togglePlay(): void {
    if (this.curMode() === 'OFF') return
    this.ensureCtx()
    if (!this.deck) { this.next(); return }
    if (this.paused) { void this.ctx!.resume(); this.paused = false } else { void this.ctx!.suspend(); this.paused = true }
    this.emit()
  }

  setVolume(v: number): void { this.volume = v; if (this.master) this.master.gain.value = v; this.emit() }

  toggleCrossfade(): void { this.crossfadeOn = !this.crossfadeOn; this.emit() }

  /** Toggle a style in the RANDOM pool (keeps at least one selected). */
  setStyleSelected(style: string, on: boolean): void {
    if (on) this.selected.add(style)
    else if (this.selected.size > 1) this.selected.delete(style)
    if (this.curMode() === 'RANDOM') this.bag = []
    this.emit()
  }
}

export const radio = new RadioEngine()
