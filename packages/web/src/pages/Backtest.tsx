export function Backtest() {
  // In development: embed local dev server via iframe
  // In production: redirect to standalone GitHub Pages deployment
  // Port configured in ecosystem.config.cjs (PORTS.PAGES)
  const pagesPort = import.meta.env.VITE_PAGES_PORT || '5561'
  const devUrl = `http://localhost:${pagesPort}`
  const prodUrl = 'https://atomantic.github.io/EscapeMint/'

  if (!import.meta.env.DEV) {
    // In production, redirect to standalone app
    window.location.href = prodUrl
    return null
  }

  return (
    <div className="bg-slate-950 min-h-screen -mt-4 sm:-m-6 sm:-mt-4">
      <iframe
        src={devUrl}
        className="w-full h-screen border-0"
        title="EscapeMint Backtest"
      />
    </div>
  )
}
