import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/study-rpg/hospital/',
  plugins: [react()],
  server: { port: 5174 },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.VITE_APP_VERSION ?? process.env.npm_package_version ?? 'dev',
    ),
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(
      process.env.VITE_COMMIT_SHA ?? 'dev',
    ),
  },
})
