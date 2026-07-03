/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build target — 'desktop' selects the Tauri backend; unset/other = web. */
  readonly VITE_TARGET?: string
  /** Referrer-restricted, NON-secret Google Drive API key for原始詳解 PDF auto-fetch. */
  readonly VITE_GDRIVE_API_KEY?: string
  /** Base URL for lofi radio BGM audio files (R2 custom domain in prod; falls back to `${BASE_URL}bgm/`). */
  readonly VITE_BGM_BASE_URL?: string
}
