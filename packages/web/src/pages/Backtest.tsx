export function Backtest() {
  // In development: embed local dev server via iframe
  // In production: redirect to standalone GitHub Pages deployment
  const devUrl = 'http://localhost:5552'
  const prodUrl = 'https://atomantic.github.io/EscapeMint/'

  if (!import.meta.env.DEV) {
    // In production, redirect to standalone app
    window.location.href = prodUrl
    return null
  }

  return (
    <div className="bg-slate-950 min-h-screen -m-6 -mt-4">
      <iframe
        src={devUrl}
        className="w-full h-screen border-0"
        title="EscapeMint Backtest"
      />
    </div>
  )
}
