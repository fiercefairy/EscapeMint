module.exports = {
  apps: [
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
        PORT: 5551,
        DATA_DIR: '../../data'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5551,
        DATA_DIR: '../../data'
      }
    },
    {
      name: 'escapemint-web',
      cwd: './packages/web',
      script: 'npx',
      args: 'vite --host',
      watch: false, // Vite handles its own HMR
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
}
