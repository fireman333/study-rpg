import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@study-rpg/theme-pixel-medical/styles/global.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/study-rpg/">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
