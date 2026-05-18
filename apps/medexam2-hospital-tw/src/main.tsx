import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth/AuthContext'
import { initConsoleErrorBuffer } from './services/console-error-buffer'
import './styles.css'

initConsoleErrorBuffer()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
