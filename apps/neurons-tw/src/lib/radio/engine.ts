// Lofi radio audio engine — framework-agnostic singleton.
// Plays the Lofi像素電台 library (med-study-rpg.com/lofi/): the station → track list is read at
// runtime from `<VITE_LOFI_RADIO_URL>tracks.json`, so tracks added on the Lofi side show up here
// without a redeploy. Full ~3.5 min tracks are streamed through two persistent <audio> decks
// (A/B) instead of being decoded into AudioBuffers (~70 MB each — unsafe on mobile). Each track
// plays to the end, then the next one starts; with crossfade on, the last XFADE seconds overlap.
// Decks are routed through Web Audio (gain ramps + analyser for the VU), so the source must be
// same-origin (prod: /lofi/; dev: Vite proxy) or send CORS headers — otherwise MediaElementSource
// outputs silence. (Web Audio rather than el.volume also because el.volume is read-only on iOS.)
// Its own AudioContext — independent of MazeGrid SFX. Loudness is normalized on the Lofi side
// (loudnorm −16 LUFS / −1.5 dBTP), so there is no per-track gain here.

interface Track { id: string; src: string; group?: string }

// Display names per station (mirrors the Lofi repo's site/js/scenes.js). Stations missing here
// still play, labelled by their key.
const STATION_META: Record<string, { label: string; zh: string }> = {
  library: { label: 'LIBRARY', zh: '圖書館午後' },
  rainywindow: { label: 'RAINY WINDOW', zh: '窗邊雨天' },
  morningcoffee: { label: 'MORNING COFFEE', zh: '早晨咖啡' },
  latenight: { label: 'LATE NIGHT', zh: '深夜書桌' },
  citynight: { label: 'CITY NIGHT', zh: '城市夜景' },
  sunday: { label: 'SUNDAY', zh: '週日午後' },
}

const XFADE = 6 // crossfade seconds when enabled
const XFADE_OFF = 0.25 // quick micro-join when crossfade off
const MAX_LOAD_ERRORS = 3 // consecutive failed tracks before giving up

const LOFI_BASE = new URL(
  ((import.meta.env.VITE_LOFI_RADIO_URL as string | undefined) || '/lofi/').replace(/\/?$/, '/'),
  window.location.href,
)

export type RadioStat = 'STANDBY' | 'ON AIR' | 'PAUSED'
export interface RadioState {
  mode: string // current MODES value
  label: string // display label (RANDOM / station label / OFF)
  zh: string // chinese subtitle ('' for RANDOM/OFF handled by UI)
  stat: RadioStat
  playing: boolean // a mode other than OFF is active
  paused: boolean
  loading: boolean // fetching the track list or buffering the first audio of a track
  error: string | null // shown on the LCD; cleared by the next successful play
  trackId: string | null
  volume: number
  crossfadeOn: boolean
  selectedStyles: string[] // which stations feed RANDOM
  styleIds: string[] // all station ids (for chips)
  styleZh: Record<string, string> // station id → chinese name (for chips)
  modes: readonly string[]
}

const shuffle = <T>(a: T[]): T[] => {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]] }
  return r
}

/** Parse Lofi's tracks.json: {station: [{src: "audio/<station>/<file>.mp3", dur?, g?}]}. */
function parseLibrary(raw: unknown): Record<string, Track[]> {
  const out: Record<string, Track[]> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [station, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    const tracks: Track[] = []
    for (const t of list as Array<{ src?: unknown; g?: unknown }>) {
      if (typeof t?.src !== 'string') continue
      const id = t.src.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '')
      tracks.push({ id, src: t.src, group: t.g === undefined || t.g === null ? undefined : `${station}:${String(t.g)}` })
    }
    if (tracks.length) out[station] = tracks
  }
  return out
}

interface Deck {
  el: HTMLAudioElement
  gain: GainNode
  track: Track | null
  stopTimer: ReturnType<typeof setTimeout> | null
}

class RadioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  private decks: Deck[] = []
  private cur = 0 // index of the active deck

  private lib: Record<string, Track[]> | null = null
  private libLoad: Promise<void> | null = null

  private mode = 'OFF'
  private gen = 0
  private paused = false
  private loading = false
  private error: string | null = null
  private loadErrors = 0
  private xfStarted = false
  private volume = 0.55
  private crossfadeOn = false
  private deselected = new Set<string>()

  private bag: Track[] = []
  private history: Track[] = []
  private hpos = -1
  private listeners = new Set<() => void>()

  // ── station list (from tracks.json) ──
  private styleIds(): string[] {
    if (!this.lib) return Object.keys(STATION_META)
    const known = Object.keys(STATION_META).filter((s) => this.lib![s])
    return known.concat(Object.keys(this.lib).filter((s) => !STATION_META[s]))
  }

  private modes(): string[] { return ['RANDOM', ...this.styleIds(), 'OFF'] }

  private selected(): string[] { return this.styleIds().filter((s) => !this.deselected.has(s)) }

  /** Fetch the track list (once). The widget calls this on expand so a later tap can play at once. */
  preload(): Promise<void> {
    if (this.lib) return Promise.resolve()
    if (this.libLoad) return this.libLoad
    this.libLoad = fetch(`${LOFI_BASE}tracks.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`tracks.json ${r.status}`); return r.json() })
      .then((raw) => {
        const lib = parseLibrary(raw)
        if (!Object.keys(lib).length) throw new Error('tracks.json empty')
        this.lib = lib
        this.error = null
        this.emit()
      })
      .catch((e: unknown) => { this.libLoad = null; throw e })
    return this.libLoad
  }

  // ── public state / subscription ──
  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb) }
  private emit(): void { this.listeners.forEach((cb) => cb()) }

  getState(): RadioState {
    const m = this.mode
    const meta = STATION_META[m]
    const special = m === 'RANDOM' || m === 'OFF'
    const styleIds = this.styleIds()
    const styleZh: Record<string, string> = {}
    for (const s of styleIds) styleZh[s] = STATION_META[s]?.zh ?? s
    return {
      mode: m,
      label: special ? m : meta?.label ?? m.toUpperCase(),
      zh: special ? '' : meta?.zh ?? '',
      stat: m === 'OFF' ? 'STANDBY' : this.paused ? 'PAUSED' : 'ON AIR',
      playing: m !== 'OFF',
      paused: this.paused,
      loading: this.loading,
      error: this.error,
      trackId: this.decks[this.cur]?.track?.id ?? null,
      volume: this.volume,
      crossfadeOn: this.crossfadeOn,
      selectedStyles: this.selected(),
      styleIds,
      styleZh,
      modes: this.modes(),
    }
  }

  /** Real-time VU levels (0..1) for the analyser — poll from rAF. */
  getVU(bars: number): number[] {
    const d = this.decks[this.cur]
    if (!this.analyser || !d?.track || this.paused || this.loading || this.mode === 'OFF') return new Array(bars).fill(0.06)
    this.analyser.getByteFrequencyData(this.freq)
    const out: number[] = []
    for (let i = 0; i < bars; i++) out.push(Math.max(0.06, (this.freq[i + 1] || 0) / 255))
    return out
  }

  // ── audio graph ──
  private ensureAudio(): void {
    if (this.ctx) return
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = (this.ctx = new Ctor())
    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 64
    this.freq = new Uint8Array(this.analyser.frequencyBinCount)
    this.master.connect(this.analyser)
    this.analyser.connect(ctx.destination)
    for (let i = 0; i < 2; i++) {
      const el = new Audio()
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      const gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(el).connect(gain)
      gain.connect(this.master)
      const deck: Deck = { el, gain, track: null, stopTimer: null }
      el.addEventListener('playing', () => this.onPlaying(deck))
      el.addEventListener('waiting', () => { if (this.isActive(deck) && !this.loading) { this.loading = true; this.emit() } })
      el.addEventListener('timeupdate', () => this.onTime(deck))
      el.addEventListener('ended', () => { if (this.isActive(deck)) this.advance(false) })
      el.addEventListener('error', () => this.onError(deck))
      this.decks.push(deck)
    }
  }

  private resumeCtx(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => { /* gesture pending */ })
  }

  private isActive(d: Deck): boolean { return this.decks[this.cur] === d && this.mode !== 'OFF' }

  /** Ramp a deck's gain to `to` (0..1) over `secs` on an equal-power curve; secs <= 0 jumps. */
  private fade(d: Deck, to: number, secs: number): void {
    const t = this.ctx!.currentTime
    const p = d.gain.gain
    const from = p.value // where an interrupted ramp actually is
    p.cancelScheduledValues(t)
    if (secs <= 0) { p.setValueAtTime(to, t); return }
    const curve = new Float32Array(32)
    for (let i = 0; i < 32; i++) {
      const x = i / 31
      // equal-power: sin for fade-in, cos for fade-out, scaled between from and to
      const w = to > from ? Math.sin((x * Math.PI) / 2) : 1 - Math.cos((x * Math.PI) / 2)
      curve[i] = from + (to - from) * w
    }
    try { p.setValueCurveAtTime(curve, t, secs) } catch { p.value = to }
  }

  /** Fade a deck out, then pause it and drop its buffered data. */
  private retire(d: Deck, secs: number): void {
    if (d.stopTimer) clearTimeout(d.stopTimer)
    this.fade(d, 0, secs)
    d.stopTimer = setTimeout(() => {
      d.stopTimer = null
      if (this.isActive(d)) return // reused as the active deck meanwhile
      d.el.pause()
      d.el.removeAttribute('src')
      d.el.load()
      d.track = null
    }, secs * 1000 + 150)
  }

  private play(t: Track, crossfade: boolean): void {
    this.ensureAudio()
    this.resumeCtx()
    const old = this.decks[this.cur]
    const nextIdx = old.track ? 1 - this.cur : this.cur
    const d = this.decks[nextIdx]
    if (d.stopTimer) { clearTimeout(d.stopTimer); d.stopTimer = null }
    if (d !== old && old.track) this.retire(old, crossfade && this.crossfadeOn ? XFADE : XFADE_OFF)
    this.cur = nextIdx
    d.track = t
    this.fade(d, 0, 0)
    d.el.src = new URL(t.src, LOFI_BASE).href
    this.xfStarted = false
    this.paused = false
    this.loading = true
    void d.el.play().catch(() => { /* autoplay blocked or load error — 'error' handles the latter */ })
    this.fade(d, 1, crossfade && this.crossfadeOn && d !== old ? XFADE : 0.5)
    this.emit()
  }

  private clearError(): void { this.error = null; this.loadErrors = 0 }

  private onPlaying(d: Deck): void {
    if (!this.isActive(d)) return
    this.clearError()
    this.loading = false
    this.emit()
  }

  private onTime(d: Deck): void {
    if (!this.isActive(d) || !this.crossfadeOn || this.xfStarted || this.paused) return
    const left = d.el.duration - d.el.currentTime
    if (Number.isFinite(left) && left <= XFADE) { this.xfStarted = true; this.advance(true) }
  }

  private onError(d: Deck): void {
    if (!this.isActive(d) || !d.track) return
    this.loadErrors++
    if (this.loadErrors >= MAX_LOAD_ERRORS) {
      this.error = '電台連線失敗'
      this.loading = false
      this.paused = true
      d.el.pause()
      this.emit()
      return
    }
    this.advance(false)
  }

  private stopAll(): void {
    for (const d of this.decks) if (d.track) this.retire(d, 1)
    this.loading = false
    this.paused = false
  }

  private refillBag(): void {
    if (!this.lib) { this.bag = []; return }
    if (this.mode === 'RANDOM') this.bag = shuffle(this.selected().flatMap((s) => this.lib![s] || []))
    else if (this.mode !== 'OFF') this.bag = shuffle(this.lib[this.mode] || [])
    else this.bag = []
  }

  /** Draw from the shuffle bag, skipping the current track and its near-duplicate group. */
  private drawNext(): Track | null {
    if (!this.bag.length) this.refillBag()
    if (!this.bag.length) return null
    const last = this.history[this.hpos]
    let i = 0
    if (last) {
      const k = this.bag.findIndex((t) => t.id !== last.id && (!last.group || t.group !== last.group))
      if (k >= 0) i = k
    }
    return this.bag.splice(i, 1)[0]
  }

  /** Next track: forward through history if we stepped back, else a fresh draw. */
  private advance(crossfade: boolean): void {
    if (this.mode === 'OFF' || !this.lib) return
    if (this.hpos < this.history.length - 1) { this.hpos++; this.play(this.history[this.hpos], crossfade); return }
    const t = this.drawNext()
    if (!t) return
    this.history.push(t)
    this.hpos = this.history.length - 1
    this.play(t, crossfade)
  }

  /** Start the current mode, loading the track list first if needed. */
  private start(): void {
    this.ensureAudio()
    this.resumeCtx()
    this.clearError()
    if (this.lib) { this.advance(true); return }
    const myGen = this.gen
    this.loading = true
    this.emit()
    this.preload().then(() => {
      if (myGen !== this.gen || this.mode === 'OFF') return
      this.loading = false
      this.refillBag()
      this.advance(true)
    }).catch(() => {
      if (myGen !== this.gen) return
      this.loading = false
      this.error = '電台連線失敗'
      this.emit()
    })
  }

  // ── public controls ──
  next(): void {
    if (this.mode === 'OFF') return
    if (!this.lib) { this.start(); return }
    this.clearError()
    this.advance(true)
  }

  prev(): void {
    if (this.mode === 'OFF' || !this.lib) return
    if (this.hpos > 0) this.hpos--
    if (this.history[this.hpos]) this.play(this.history[this.hpos], true)
  }

  setMode(i: number): void {
    const modes = this.modes()
    this.mode = modes[((i % modes.length) + modes.length) % modes.length]
    this.history = []; this.hpos = -1; this.bag = []; this.gen++
    if (this.mode === 'OFF') { this.stopAll(); this.emit(); return }
    this.refillBag()
    this.start()
    this.emit()
  }

  nextMode(): void { this.setMode(this.modes().indexOf(this.mode) + 1) }
  prevMode(): void { this.setMode(this.modes().indexOf(this.mode) - 1) }

  togglePlay(): void {
    if (this.mode === 'OFF') return
    this.ensureAudio()
    const d = this.decks[this.cur]
    if (!d.track || this.error) { this.next(); return }
    if (this.paused) {
      this.resumeCtx()
      void d.el.play().catch(() => { /* gesture pending */ })
      this.paused = false
    } else {
      // a crossfade in progress collapses to the incoming track on resume
      for (const x of this.decks) { if (x !== d && x.track) this.retire(x, 0.05); x.el.pause() }
      this.paused = true
    }
    this.emit()
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
    this.emit()
  }

  toggleCrossfade(): void { this.crossfadeOn = !this.crossfadeOn; this.emit() }

  /** Toggle a station in the RANDOM pool (keeps at least one selected). */
  setStyleSelected(style: string, on: boolean): void {
    if (on) this.deselected.delete(style)
    else if (this.selected().length > 1) this.deselected.add(style)
    if (this.mode === 'RANDOM') this.bag = []
    this.emit()
  }
}

export const radio = new RadioEngine()
