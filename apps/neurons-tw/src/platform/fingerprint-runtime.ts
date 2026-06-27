/**
 * Runtime (browser) side of the content fingerprint: load a PDF's bytes with the BUNDLED pdfjs
 * and compute the same fingerprint the build-time manifest stores (add-neurons-guided-pdf-
 * onboarding, design D2). Used only on the desktop build (dynamically imported behind
 * `isDesktop()`), so it never enters the web bundle.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
// Worker as a bundled Vite asset (offline / Tauri safe), same one PdfDocumentView uses.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { computeFingerprint, type Fingerprint } from './fingerprint'

if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = workerUrl

/** SubtleCrypto SHA-256 → lowercase hex (same digest the Node build script produces). */
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Fingerprint a PDF from its raw bytes. Copies the buffer for pdfjs (which detaches `data`) so
 * the caller's ArrayBuffer stays usable for the blob URL when this file turns out to be the match.
 */
export async function fingerprintBytes(bytes: ArrayBuffer): Promise<Fingerprint> {
  const pdf = await getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise
  try {
    return await computeFingerprint(pdf, sha256hex)
  } finally {
    await pdf.destroy()
  }
}
