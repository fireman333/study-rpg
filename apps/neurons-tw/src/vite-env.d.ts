/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Referrer-restricted, NON-secret Google Drive API key for原始詳解 PDF auto-fetch. */
  readonly VITE_GDRIVE_API_KEY?: string
  /** Root of the Lofi像素電台 site whose tracks.json + audio/ feed the radio (default `/lofi/`, same origin in prod). */
  readonly VITE_LOFI_RADIO_URL?: string
}
