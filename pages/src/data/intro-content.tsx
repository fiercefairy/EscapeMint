import type { ReactNode } from 'react'

export interface IntroStep {
  id: number
  title: string
  content: ReactNode[]
  chartType: 'growth' | 'volatility' | 'traditionalDca' | 'buySell' | 'leverage' | 'modes' | 'none'
  showDisclaimer?: boolean
}

export const INTRO_STEPS: IntroStep[] = [
  {
    id: 1,
    title: 'Getting Rich Slowly',
    content: [
      '"The stock market is a device for transferring money from the impatient to the patient... nobody wants to get rich slowly." — Warren Buffett',
      'Getting rich is easy, as long as you\'re willing to do it slowly.',
      'You don\'t need to watch the news, analyze earnings reports, or pick individual stocks.',
      'If you believe one thing:',
      'The whole stock market goes up over time.'
    ],
    chartType: 'none',
    showDisclaimer: true
  },
  {
    id: 2,
    title: 'The Market Grows',
    content: [
      'The whole stock market grows at about 10% annually (long-term average).',
      'Recently, it\'s been even higher—20-40% in some years.',
      'This is the baseline we\'re building on.'
    ],
    chartType: 'growth'
  },
  {
    id: 3,
    title: 'But It\'s Not a Straight Line',
    content: [
      'However, the market doesn\'t grow in a steady straight line.',
      <>It has volatility—wild swings up and down. <span className="px-2 py-0.5 rounded-full bg-red-600/30 text-red-400 text-sm">Recessions</span> and <span className="px-2 py-0.5 rounded-full bg-green-600/30 text-green-400 text-sm">Bubbles</span>.</>,
      'And for the long-term investor, this is actually GOOD news.'
    ],
    chartType: 'volatility'
  },
  {
    id: 4,
    title: 'Traditional DCA Falls Short',
    content: [
      'Most retirement advice centers around Dollar Cost Averaging (DCA): Invest the same amount every week/month, regardless of price.',
      'But this ignores a key opportunity: when the market is super inflated, it might be better to SELL than to buy.',
      'If you expect 20% annual growth, but you\'re clocking 50% APY... then regardless of the news, the market is overvalued relative to your target. And you can lock it in.'
    ],
    chartType: 'traditionalDca'
  },
  {
    id: 5,
    title: 'Volatility is Your Friend',
    content: [
      'For the DCA investor, higher volatility is actually BETTER:',
      '• When prices are LOW → You buy MORE shares',
      '• When prices are HIGH → You can harvest profits above your target',
      'Think of it like extracting dividends from your own growth. This also gives you a constant cash pile to resume your DCA during the next recession.'
    ],
    chartType: 'buySell'
  },
  {
    id: 6,
    title: 'DCA In AND Out',
    content: [
      'This system dollar-cost-averages in BOTH directions:',
      '• DCA into dips (buy at lower prices)',
      '• DCA out of peaks (sell when above target)',
      'Rules replace emotions. No FOMO. No panic selling.'
    ],
    chartType: 'buySell'
  },
  {
    id: 7,
    title: 'Two Modes: Harvest vs Accumulate',
    content: [
      'There are two ways to manage your fund:',
      <><span className="font-bold text-green-400">Harvest Mode:</span> For cash optimization. Fully exit when above target, then slowly rebuild. Great for volatile assets like TQQQ, SPXL. This is for optimizing cash.</>,
      <><span className="font-bold text-blue-400">Accumulate Mode:</span> For long-term retirement. Take small profits, keep building your position. Great for an M1 Finance savings fund that's backed by a margin borrowing account (so you can buy → borrow → die).</>
    ],
    chartType: 'modes'
  },
  {
    id: 8,
    title: 'Buy Recessions, Sell Bubbles',
    content: [
      'In both modes, the strategy is the same:',
      'Recession → BUY more (prices are on sale)',
      'Bubble → SELL (lock in gains above target)',
      'The system tells you exactly what to do, every week/month (intervals are configurable).'
    ],
    chartType: 'buySell'
  },
  {
    id: 9,
    title: 'Leveraged ETFs = More Volatility',
    content: [
      'Example assets used by the creator (not financial advice):',
      <><span className="font-semibold">TQQQ</span> is a 3x leveraged long on the Nasdaq-100.<br /><span className="text-xs text-slate-500">TQQQ seeks daily investment results, before fees and expenses, that correspond to three times (3x) the daily performance of the Nasdaq-100 Index.</span></>,
      <><span className="font-semibold">SPXL</span> is a 3x leveraged long on the Russell 1000 Large Cap Index.<br /><span className="text-xs text-slate-500">SPXL seeks daily investment results, before fees and expenses, of 300% of the price performance of the Russell 1000 Index. There is no guarantee the fund will meet its stated investment objective.</span></>,
      'More volatility = more opportunities to buy low and sell high.',
      'Your choice of assets depends on your risk tolerance and research.'
    ],
    chartType: 'leverage'
  },
  {
    id: 10,
    title: 'What This System Is NOT',
    content: [
      'This is NOT for:',
      '× Day trading meme stocks',
      '× Picking winners and losers',
      '× Betting against the market (shorting)',
      '× Apocalyptic hedging',
      'This is a long-term bet that the market goes up over decades.'
    ],
    chartType: 'none'
  },
  {
    id: 11,
    title: 'Your Personal Configuration',
    content: [
      'You control:',
      '• Target APY (10% = sell sooner, more taxable events → 40% = hold longer, accumulate more)',
      '• DCA amounts (how much to invest per period with tiers)',
      '• Check frequency (daily, weekly, monthly)',
      '• Which assets (indexes, bitcoin, leveraged ETFs, etc)',
      'This works for IRAs, 401ks, or regular trading accounts. Your taxes and goals determine your settings.'
    ],
    chartType: 'none'
  },
  {
    id: 12,
    title: 'Get Started',
    content: [
      'Ready to simulate your first fund?',
      'Try the backtest tool to see how this strategy would have performed with different assets and configurations.'
    ],
    chartType: 'none',
    showDisclaimer: true
  }
]

export const TOTAL_STEPS = INTRO_STEPS.length
