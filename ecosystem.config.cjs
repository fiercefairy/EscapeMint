module.exports = {
  apps: [
    {
      name: 'escapemint-api',
      cwd: './packages/server',
      script: 'npx',
      args: 'tsx watch src/index.ts',
      watch: false, // tsx watch handles its own file watching
      env: {
        NODE_ENV: 'development',
        PORT: 3301,
        DATA_DIR: '../../data'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3301,
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
