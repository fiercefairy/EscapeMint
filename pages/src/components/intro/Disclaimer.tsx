interface DisclaimerProps {
  variant?: 'banner' | 'footer'
}

export function Disclaimer({ variant = 'banner' }: DisclaimerProps) {
  if (variant === 'footer') {
    return (
      <div className="text-center text-xs text-slate-500 py-2 border-t border-slate-800">
        Not investment advice. Do your own research.
      </div>
    )
  }

  return (
    <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-xl flex-shrink-0">!</span>
        <div className="text-sm">
          <p className="font-semibold text-amber-200 mb-1">Not Investment Advice</p>
          <p className="text-amber-100/80">
            This is an open-source tool created by an individual investor to track their personal fund strategy.
            The sample funds (TQQQ, SPXL, BTC) are examples and not financial advice.
          </p>
          <p className="text-amber-200 font-medium mt-2">
            Do your own research. Choice of platforms, assets, timeline, and risk tolerance is entirely up to you.
          </p>
        </div>
      </div>
    </div>
  )
}
