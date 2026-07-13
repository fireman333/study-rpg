import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_DEPLOY_BASE || '/',
  plugins: [react()],
  server: { port: 5175 },
})
