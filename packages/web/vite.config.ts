import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Import ports from ecosystem config (single source of truth)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PORTS } = require('../../ecosystem.config.cjs')

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORTS.WEB,
    proxy: {
      '/api': {
        target: `http://localhost:${PORTS.API}`,
        changeOrigin: true
      }
    }
  }
})
