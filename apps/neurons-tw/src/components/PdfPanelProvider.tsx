/**
 * PdfPanelProvider — global state for the docked PDF panel (rework-neurons-pdf-viewer-docked-panel).
 *
 * One provider owns {open,url,page,file,width}; the three button sites just call openPdf().
 * It writes a `--pdf-panel-width` CSS variable on :root (panel width when open, 0px when
 * closed) so the app shell + full-screen modals reflow beside the (non-modal) panel, and it
 * persists the player's chosen width. Keeping docking/width here (vs the renderer) keeps the
 * future Tauri reuse clean: platform code resolves a URL → openPdf renders + docks it.
 *
 * Responsive (add-neurons-pdf-drive-autofetch): below MOBILE_MQ the panel becomes a full-screen
 * overlay instead of a docked side panel — so the reflow var stays 0 (content is covered, not
 * crushed). `narrow` is the SINGLE breakpoint source of truth (a JS matchMedia flag); the host's
 * CSS class + the reflow var both key off it, so the breakpoint is defined exactly once.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { releaseExplanationUrl } from '../platform'

const WIDTH_KEY = 'neurons.pdfPanel.width.v1'
const MIN_W = 360
const DEFAULT_W = 520
// Below this the docked side-by-side layout has no room → full-screen overlay (matches the
// project's mobile cutoff). 767.98 so it never overlaps a 768px tablet width.
const MOBILE_MQ = '(max-width: 767.98px)'

function matchNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_MQ).matches
    : false
}

function maxW(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  return Math.min(900, Math.floor(vw * 0.7))
}
export function clampPanelWidth(w: number): number {
  return Math.max(MIN_W, Math.min(maxW(), w))
}
function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(v) && v >= MIN_W) return clampPanelWidth(v)
  } catch {
    /* ignore */
  }
  return DEFAULT_W
}
function setVar(px: number): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--pdf-panel-width', `${px}px`)
  }
}

interface PanelState {
  open: boolean
  url: string | null
  page: number
  file: string
}
interface PdfPanelCtx extends PanelState {
  width: number
  /** True on narrow (phone) viewports → host renders a full-screen overlay, no content reflow. */
  narrow: boolean
  openPdf: (s: { url: string; page: number; file: string }) => void
  closePdf: () => void
  setWidth: (w: number) => void
}

const Ctx = createContext<PdfPanelCtx | null>(null)

export function usePdfPanel(): PdfPanelCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePdfPanel must be used within <PdfPanelProvider>')
  return c
}

export function PdfPanelProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<PanelState>({ open: false, url: null, page: 1, file: '' })
  const [width, setWidthState] = useState<number>(() => (typeof window !== 'undefined' ? loadWidth() : DEFAULT_W))
  const [narrow, setNarrow] = useState<boolean>(matchNarrow)
  const urlRef = useRef<string | null>(null)
  urlRef.current = state.url

  // Track the mobile breakpoint (also fires on orientation change crossing it).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(MOBILE_MQ)
    const onChange = (): void => setNarrow(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Reflow var: push content beside the panel only when DOCKED (desktop). On narrow it's a
  // full-screen overlay → keep 0 so content/quiz/mock surfaces stay full-width (just covered).
  useEffect(() => {
    setVar(state.open && !narrow ? width : 0)
    return () => setVar(0)
  }, [state.open, width, narrow])

  const openPdf = useCallback((s: { url: string; page: number; file: string }) => {
    setState((prev) => {
      if (prev.url && prev.url !== s.url) releaseExplanationUrl(prev.url)
      return { open: true, url: s.url, page: s.page, file: s.file }
    })
  }, [])

  const closePdf = useCallback(() => {
    setState((prev) => {
      if (prev.url) releaseExplanationUrl(prev.url)
      return { open: false, url: null, page: 1, file: '' }
    })
  }, [])

  const setWidth = useCallback((w: number) => {
    const c = clampPanelWidth(w)
    setWidthState(c)
    setVar(c)
    try {
      localStorage.setItem(WIDTH_KEY, String(c))
    } catch {
      /* ignore */
    }
  }, [])

  // Release the object URL if the whole app unmounts with the panel open.
  useEffect(() => () => {
    if (urlRef.current) releaseExplanationUrl(urlRef.current)
  }, [])

  // DEV-only debug handle (mirrors the app's __srs/__sync convention; stripped from prod
  // builds). Lets a smoke test open the panel with a served PDF without the native folder
  // picker, e.g. __pdfPanel.openPdf({url:'/__dev_test.pdf',page:2,file:'__dev_test.pdf'}).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(globalThis as Record<string, unknown>).__pdfPanel = { openPdf, closePdf, setWidth }
  }, [openPdf, closePdf, setWidth])

  return (
    <Ctx.Provider value={{ ...state, width, narrow, openPdf, closePdf, setWidth }}>{children}</Ctx.Provider>
  )
}
