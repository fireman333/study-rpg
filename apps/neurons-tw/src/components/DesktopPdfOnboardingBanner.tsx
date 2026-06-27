/**
 * DesktopPdfOnboardingBanner — desktop-only first-run card teaching the two-step setup for
 * 「看原始詳解 PDF」: (1) download your PDFs from the publisher's official links, (2) grant the
 * folder for read-only access (add-neurons-guided-pdf-onboarding, task 4). Shows only on the
 * Tauri build while no folder is granted; dismissible; never appears on web.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { isDesktop, getStatus, grantFolder, type PlatformStatus } from '../platform'
import { BookletDownloadList } from './BookletDownloadList'

const DISMISS_KEY = 'neurons.desktop.onboardingDismissed.v1'

export function DesktopPdfOnboardingBanner(): JSX.Element | null {
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [showList, setShowList] = useState(false)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (isDesktop()) getStatus().then(setStatus)
  }, [])

  // Web build, already granted, still loading, or dismissed → render nothing.
  if (!isDesktop() || dismissed || status === null || status === 'ready') return null

  async function onGrant(): Promise<void> {
    setStatus(await grantFolder())
  }
  function onDismiss(): void {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={bannerStyle}>
      <button type="button" onClick={onDismiss} style={closeStyle} aria-label="關閉">
        ×
      </button>
      <strong style={titleStyle}>📄 啟用「看原始詳解 PDF」（桌面版）</strong>
      <p style={textStyle}>
        桌面版可以開啟你本機的陽明國考詳解 PDF、跳到該題所在頁。兩個步驟就好：
      </p>
      <ol style={listStyle}>
        <li>
          下載你要的年份 PDF：
          <button type="button" style={linkBtnStyle} onClick={() => setShowList((v) => !v)}>
            {showList ? '收合下載清單' : '展開全部官方下載連結'}
          </button>
        </li>
        <li>
          授權 App 唯讀讀取那個資料夾：
          <button type="button" style={grantBtnStyle} onClick={onGrant}>
            📂 選擇資料夾
          </button>
        </li>
      </ol>
      {showList && <BookletDownloadList />}
      <span style={creditStyle}>App 不提供 PDF、只連到官方來源（陽明國考考古題小組）。下載後存到你授權的資料夾即可。</span>
    </div>
  )
}

const bannerStyle: CSSProperties = {
  position: 'relative',
  margin: '0.75rem auto',
  maxWidth: 720,
  padding: '0.8rem 1rem',
  border: '1px solid #c9ad7f',
  borderRadius: 8,
  background: '#f6efde',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}
const closeStyle: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 8,
  border: 'none',
  background: 'transparent',
  color: '#8a7a5a',
  fontSize: '1.1rem',
  lineHeight: 1,
  cursor: 'pointer',
}
const titleStyle: CSSProperties = { color: '#3a2a1a', fontFamily: 'var(--font-legible)', fontSize: '0.92rem' }
const textStyle: CSSProperties = { margin: 0, color: '#4a3a25', fontFamily: 'var(--font-legible)', fontSize: '0.82rem' }
const listStyle: CSSProperties = {
  margin: '0.2rem 0',
  paddingLeft: '1.2rem',
  color: '#4a3a25',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  lineHeight: 1.9,
}
const baseBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #b8893a',
  borderRadius: 999,
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.1rem 0.6rem',
  marginLeft: '0.3rem',
}
const linkBtnStyle: CSSProperties = { ...baseBtn, background: '#f4ecd8', color: '#6b5436' }
const grantBtnStyle: CSSProperties = { ...baseBtn, background: '#dfe9cf', color: '#3a2a1a', borderColor: '#9bb37f' }
const creditStyle: CSSProperties = { fontSize: '0.72rem', color: '#6a5a45', fontFamily: 'var(--font-legible)' }
