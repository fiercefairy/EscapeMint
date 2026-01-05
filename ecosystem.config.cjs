// =============================================================================
// Port Configuration - All ports defined here as single source of truth
// =============================================================================
const PORTS = {
  WEB: 5550,      // Vite dev server (UI)
  API: 5551,      // Express API server
  CDP: 5549       // Chrome DevTools Protocol (browser automation)
}

const BROWSER_USER_DATA_DIR = './.browser'

module.exports = {
  // Export ports for other configs to import
  PORTS,

  apps: [
    {
      name: 'escapemint-browser',
      script: './scripts/launch-browser.sh',
      interpreter: '/bin/bash',
      autorestart: false,  // Don't auto-restart browser if user closes it
      watch: false,
      env: {
        CDP_PORT: PORTS.CDP,
        BROWSER_DIR: BROWSER_USER_DATA_DIR
      }
    },
    {
      name: 'escapemint-api',
      cwd: './packages/server',
      script: 'dist/index.js',
      watch: [
        'packages/server/dist',
        'packages/engine/dist',
        'packages/storage/dist'
      ],
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'data'
      ],
      env: {
        NODE_ENV: 'development',
        PORT: PORTS.API,
        DATA_DIR: '../../data',
        CDP_PORT: PORTS.CDP
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: PORTS.API,
        DATA_DIR: '../../data',
        CDP_PORT: PORTS.CDP
      }
    },
    {
      name: 'escapemint-web',
      cwd: './packages/web',
      script: 'npx',
      args: 'vite --host',
      watch: false, // Vite handles its own HMR
      env: {
        NODE_ENV: 'development',
        VITE_PORT: PORTS.WEB,
        VITE_API_PORT: PORTS.API,
        VITE_CDP_PORT: PORTS.CDP
      }
    }
  ]
}
