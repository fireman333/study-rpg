import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth/AuthContext'
import { initConsoleErrorBuffer } from './services/console-error-buffer'
import '@study-rpg/theme-pixel-medical/styles/global.css'
import './styles.css'

initConsoleErrorBuffer()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/study-rpg/">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
