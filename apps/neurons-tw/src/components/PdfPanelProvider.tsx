/**
 * PdfPanelProvider — global state for the docked PDF panel (rework-neurons-pdf-viewer-docked-panel).
 *
 * One provider owns {open,url,page,file,width}; the three button sites just call openPdf().
 * It writes a `--pdf-panel-width` CSS variable on :root (panel width when open, 0px when
 * closed) so the app shell + full-screen modals reflow beside the (non-modal) panel, and it
 * persists the player's chosen width. Keeping docking/width here (vs the renderer) keeps the
 * future Tauri reuse clean: platform code resolves a URL → openPdf renders + docks it.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { releaseExplanationUrl } from '../platform'

const WIDTH_KEY = 'neurons.pdfPanel.width.v1'
const MIN_W = 360
const DEFAULT_W = 520

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
  const urlRef = useRef<string | null>(null)
  urlRef.current = state.url

  // Keep the CSS variable in sync with open/width so other surfaces reflow.
  useEffect(() => {
    setVar(state.open ? width : 0)
    return () => setVar(0)
  }, [state.open, width])

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
    <Ctx.Provider value={{ ...state, width, openPdf, closePdf, setWidth }}>{children}</Ctx.Provider>
  )
}
