import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/study-rpg-m2/',
  plugins: [react()],
  server: { port: 5174 },
})
