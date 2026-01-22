interface WelcomePanelProps {
  onCreateFund: () => void
  onImport: () => void
}

const SUPPORTED_PLATFORMS = [
  {
    name: 'Robinhood',
    description: 'Stocks, ETFs, and crypto with cash interest',
    fundTypes: ['Stock', 'Crypto'],
    referralUrl: 'https://join.robinhood.com/adame110/',
    color: 'green'
  },
  {
    name: 'M1 Finance',
    description: 'Automated investing with dividend reinvestment',
    fundTypes: ['Stock'],
    referralUrl: 'https://m1.finance/OGMwOZn__m2e',
    color: 'teal'
  },
  {
    name: 'Coinbase',
    description: 'Crypto spot trading and perpetual futures',
    fundTypes: ['Crypto', 'Derivatives'],
    referralUrl: 'https://advanced.coinbase.com/join/XWJ3U4F',
    color: 'blue'
  },
  {
    name: 'Crypto.com',
    description: 'Crypto spot trading',
    fundTypes: ['Crypto'],
    referralUrl: 'https://crypto.com/app/iwmcxzu8n5',
    color: 'purple'
  }
]

export function WelcomePanel({ onCreateFund, onImport }: WelcomePanelProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 sm:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Welcome to EscapeMint
        </h2>
        <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
          A local-first capital allocation engine for rules-based fund management.
          Track your investments, get DCA recommendations, and monitor performance across all your accounts.
        </p>
      </div>

      {/* Quick Start Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
        <button
          onClick={onCreateFund}
          className="px-6 py-3 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors font-medium text-sm sm:text-base"
        >
          Create Your First Fund
        </button>
        <button
          onClick={onImport}
          className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium text-sm sm:text-base"
        >
          Import Existing Data
        </button>
      </div>

      {/* Supported Platforms */}
      <div className="border-t border-slate-700 pt-6">
        <h3 className="text-lg font-semibold text-white mb-4 text-center">
          Supported Platforms
        </h3>
        <p className="text-slate-400 text-sm text-center mb-4">
          EscapeMint has specific handling for these brokerages. Referral links support the project.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SUPPORTED_PLATFORMS.map(platform => (
            <a
              key={platform.name}
              href={platform.referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-mint-500/50 hover:bg-slate-700/50 transition-all group"
            >
              <div className="font-medium text-white group-hover:text-mint-400 transition-colors">
                {platform.name}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {platform.fundTypes.join(' • ')}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                {platform.description}
              </div>
            </a>
          ))}
        </div>
        <p className="text-slate-500 text-xs text-center mt-4">
          You can also use EscapeMint with any brokerage by creating a custom platform name.
        </p>
      </div>

      {/* Getting Started Steps */}
      <div className="border-t border-slate-700 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-white mb-4 text-center">
          Getting Started
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-mint-600/20 text-mint-400 flex items-center justify-center mx-auto mb-2 text-lg font-bold">
              1
            </div>
            <h4 className="text-white font-medium text-sm mb-1">Create a Fund</h4>
            <p className="text-slate-400 text-xs">
              Set up a fund with your platform, ticker, and target APY
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-mint-600/20 text-mint-400 flex items-center justify-center mx-auto mb-2 text-lg font-bold">
              2
            </div>
            <h4 className="text-white font-medium text-sm mb-1">Log Entries</h4>
            <p className="text-slate-400 text-xs">
              Record your buys, sells, and equity snapshots
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-mint-600/20 text-mint-400 flex items-center justify-center mx-auto mb-2 text-lg font-bold">
              3
            </div>
            <h4 className="text-white font-medium text-sm mb-1">Get Recommendations</h4>
            <p className="text-slate-400 text-xs">
              Follow DCA advice based on your target growth
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
