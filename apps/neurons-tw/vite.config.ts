import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_DEPLOY_BASE || '/',
  plugins: [react()],
  server: {
    port: 5175,
    // Lofi radio: tracks.json + audio live on the Lofi像素電台 site (same origin in prod).
    proxy: { '/lofi': { target: 'https://med-study-rpg.com', changeOrigin: true } },
  },
})
