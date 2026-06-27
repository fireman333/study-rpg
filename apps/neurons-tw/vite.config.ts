import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Desktop (Tauri) build loads assets from the local filesystem under tauri://localhost,
// so it needs a relative base. The web build keeps its deploy base (CF-Pages subpath)
// completely unchanged. (add-neurons-tauri-shell)
const isDesktop = process.env.VITE_TARGET === 'desktop'

export default defineConfig({
  base: isDesktop ? './' : process.env.VITE_DEPLOY_BASE || '/',
  plugins: [react()],
  // strictPort under desktop so Vite never silently moves off the port Tauri's devUrl expects.
  server: { port: 5175, strictPort: isDesktop },
})
