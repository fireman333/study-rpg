import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import { useEffect, useState } from 'react'

function App() {
  const [packStatus, setPackStatus] = useState<string>('loading...')

  useEffect(() => {
    getContentPack()
      .then((pack) => {
        setPackStatus(`${pack.meta.displayName} — ${pack.questions.length} Q, ${pack.subjects.length} subjects`)
      })
      .catch((err) => {
        setPackStatus(`error: ${err.message}`)
      })
  }, [])

  return (
    <main className="scaffold-shell">
      <h1>二階國考經營 RPG</h1>
      <p className="scaffold-status">M_2nd scaffold — 9 changes 中第 1 個（add-hospital-mode-scaffold）</p>

      <section className="scaffold-section">
        <h2>Wired</h2>
        <ul>
          <li>Theme: <code>{THEME_PIXEL_HOSPITAL.meta.displayName}</code> ({THEME_PIXEL_HOSPITAL.meta.id})</li>
          <li>Content: {packStatus}</li>
        </ul>
      </section>

      <section className="scaffold-section">
        <h2>Pending</h2>
        <ul>
          <li>ingest-medexam2-tw-corpus（資料攝取 ~12,160 Q）</li>
          <li>wire-recruitment-gacha（抽卡 + 親密度 binary gate）</li>
          <li>wire-hospital-tycoon-engine（diagrams + tycoon tick）</li>
          <li>wire-hospital-reputation（評鑑公式）</li>
          <li>wire-clinic-level-up（三階段升級）</li>
          <li>add-doctor-sprite-roster（14 科 × P1–P5 sprite）</li>
          <li>add-medexam2-gh-pages-deploy（GH Pages workflow）</li>
        </ul>
      </section>
    </main>
  )
}

export default App
