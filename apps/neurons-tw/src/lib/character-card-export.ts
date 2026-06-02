/**
 * Character-card export layer (add-neurons-og-share).
 *
 * Turns a rendered canvas into a PNG and delivers it via file download or the
 * Web Share sheet. Export failures are surfaced (thrown) for the modal to show —
 * never silently swallowed (No Silent Errors). Browser-only.
 *
 * Capability spec: openspec/specs/neurons-character-card/spec.md
 */

export const CARD_FILENAME = 'neurons-character-card.png'

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('無法將角色卡轉成圖片（canvas.toBlob 回傳空值）')
  return blob
}

/** Whether the platform can share an image file via the Web Share API. */
export function canShareCardFile(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
    return false
  }
  try {
    const probe = new File([new Blob([], { type: 'image/png' })], CARD_FILENAME, {
      type: 'image/png',
    })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/** Download the canvas as a PNG file. Throws if the blob cannot be produced. */
export async function downloadCardPng(
  canvas: HTMLCanvasElement,
  filename: string = CARD_FILENAME,
): Promise<void> {
  const blob = await canvasToPngBlob(canvas)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has been handled (immediate revoke can cancel the download).
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ShareCardOptions {
  filename?: string
  title?: string
  text?: string
}

/**
 * Share the canvas PNG via the Web Share API. Returns 'cancelled' when the user
 * dismisses the share sheet; throws on any real failure (caller surfaces it).
 */
export async function shareCardPng(
  canvas: HTMLCanvasElement,
  opts: ShareCardOptions = {},
): Promise<'shared' | 'cancelled'> {
  const share = typeof navigator !== 'undefined' ? navigator.share : undefined
  if (typeof share !== 'function') throw new Error('此裝置不支援分享功能')
  const blob = await canvasToPngBlob(canvas)
  const file = new File([blob], opts.filename ?? CARD_FILENAME, { type: 'image/png' })
  try {
    await share.call(navigator, { files: [file], title: opts.title, text: opts.text })
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    throw err
  }
}
