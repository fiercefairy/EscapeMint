import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Import ports from ecosystem config (single source of truth)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PORTS } = require('../../ecosystem.config.cjs')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Allow backtest page to import engine directly
      '@escapemint/engine': resolve(__dirname, '../engine/src/index.ts'),
      // Allow importing from pages directory
      '~pages': resolve(__dirname, '../../pages/src'),
      // Allow pages to import from web package
      '~web': resolve(__dirname, './src')
    }
  },
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
