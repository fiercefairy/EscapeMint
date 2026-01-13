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
      // Allow pages to import from web package
      '~web': resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split D3 into its own chunk (large library)
          d3: ['d3'],
          // Split Recharts into its own chunk
          recharts: ['recharts'],
          // Split React vendor bundle
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
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
