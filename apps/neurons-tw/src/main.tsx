import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { db } from './lib/db'
import '@study-rpg/theme-pixel-neurons/styles/global.css'
import './styles.css'

if (import.meta.env.DEV) {
  db.open().then(async () => {
    const [variantCount, profileCount] = await Promise.all([
      db.neuronVariants.count(),
      db.leaderboardProfile.count(),
    ])
    console.info(
      `[neurons-tw] Dexie v${db.verno} ready · ${variantCount} neuronVariant row${variantCount === 1 ? '' : 's'} · ${profileCount} leaderboardProfile row${profileCount === 1 ? '' : 's'}`,
    )
  })
  ;(globalThis as unknown as { __db?: typeof db }).__db = db
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
