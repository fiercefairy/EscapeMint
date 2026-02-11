import { memo } from 'react'
import type { FundSummary } from '../api/funds'
import {
  isCashFund as checkIsCashFund,
  isDerivativesFund as checkIsDerivativesFund,
  getFundTypeFeatures,
  FUND_CATEGORY_CONFIG,
  getEffectiveCategory
} from '@escapemint/engine'
import { formatPercent } from '../utils/format'
import type { FundCategory } from '../api/funds'

export interface FundCardProps {
  fund: FundSummary
  impactPct?: number | undefined
  realizedAPY?: number | undefined
  liquidAPY?: number | undefined
  realizedGains?: number | undefined
}

export const FundCard = memo(function FundCard({ fund, impactPct, realizedAPY, liquidAPY, realizedGains }: FundCardProps) {
  const hasValue = fund.latestEquity && fund.latestEquity.value > 0
  // Use latestFundSize from entries, fall back to config
  const fundSize = fund.latestFundSize ?? fund.config.fund_size_usd
  // Use explicit status if set, otherwise fall back to legacy check (undefined status + zero fund size)
  const isClosed = fund.config.status === 'closed' || (fund.config.status === undefined && fundSize === 0)
  const isCashFund = checkIsCashFund(fund.config.fund_type)
  const isDerivativesFund = checkIsDerivativesFund(fund.config.fund_type)
  const features = getFundTypeFeatures(fund.config.fund_type ?? 'stock')
  const effectiveCategory = getEffectiveCategory(
    fund.config.category as FundCategory | undefined,
    fund.config.fund_type
  )
  const categoryConfig = effectiveCategory ? FUND_CATEGORY_CONFIG[effectiveCategory] : null

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercentShort = (value: number) => (value * 100).toFixed(1) + '%'

  // Different color schemes by fund type (using config)
  const borderHoverClass = features.borderHoverClass
  const valueColorClass = `${features.textColorClass} font-medium`

  return (
    <div className={`bg-slate-800 rounded-lg p-1.5 xs:p-2 sm:p-3 border transition-all ${borderHoverClass} ${
      isClosed ? 'border-slate-700 opacity-60' : 'border-slate-700'
    } active:bg-slate-700/30`}>
      <div className="flex items-start justify-between gap-1 xs:gap-1.5 mb-1 xs:mb-1.5 sm:mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[10px] xs:text-xs sm:text-base font-bold text-white uppercase truncate leading-tight" title={fund.ticker}>{fund.ticker}</h3>
          <p className="text-[8px] xs:text-[9px] sm:text-xs text-slate-400 capitalize truncate leading-tight">{fund.platform}</p>
        </div>
        <div className="flex items-center flex-wrap justify-end gap-0.5 flex-shrink-0 max-w-[50%] xs:max-w-[55%]">
          {impactPct !== undefined && impactPct > 0 && (
            <span className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] bg-slate-700 text-slate-300 rounded whitespace-nowrap" title="Portfolio Impact %">
              {(impactPct * 100).toFixed(1)}%
            </span>
          )}
          {fund.config.audited && (
            <span className="px-0.5 xs:px-1 py-0.5 text-[8px] xs:text-[9px] sm:text-[10px] bg-green-900/50 text-green-400 rounded" title={`Audited ${fund.config.audited}`}>
              <svg className="w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {isCashFund && (
            <span className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] bg-blue-900 text-blue-400 rounded whitespace-nowrap">{features.label}</span>
          )}
          {isDerivativesFund && (
            <span className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] bg-orange-900 text-orange-400 rounded whitespace-nowrap">{features.label}</span>
          )}
          {isClosed && (
            <span className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] bg-slate-700 text-slate-400 rounded whitespace-nowrap">Closed</span>
          )}
          {!isClosed && features.allowsTrading && fund.config.accumulate && (
            <span className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] bg-mint-900 text-mint-400 rounded whitespace-nowrap">Acc</span>
          )}
          {categoryConfig && (
            <span
              className="px-1 xs:px-1.5 py-0.5 text-[7px] xs:text-[8px] sm:text-[10px] rounded whitespace-nowrap"
              style={{
                backgroundColor: `${categoryConfig.color}20`,
                color: categoryConfig.color
              }}
              title={categoryConfig.description}
            >
              {categoryConfig.shortLabel}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-0.5 xs:space-y-1 text-[8px] xs:text-[9px] sm:text-xs">
        {!features.allowsTrading ? (
          // Cash fund display - show balance, P&L, and realized APY (interest earnings)
          <>
            <div className="flex justify-between gap-1 xs:gap-2">
              <span className="text-slate-400 truncate">Balance</span>
              <span className={`${hasValue ? valueColorClass : 'text-slate-500'} truncate text-right font-medium`}>
                {hasValue ? formatCurrency(fund.latestEquity!.value) : '-'}
              </span>
            </div>
            {realizedGains !== undefined && (
              <div className="flex justify-between gap-1 xs:gap-2">
                <span className="text-slate-400 truncate">Interest</span>
                <span className={`truncate text-right ${realizedGains >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {realizedGains >= 0 ? '+' : ''}{formatCurrency(realizedGains)}
                </span>
              </div>
            )}
            {realizedAPY !== undefined && (
              <div className="flex justify-between gap-1 xs:gap-2">
                <span className="text-slate-400 truncate">APY</span>
                <span className="text-slate-300 truncate text-right">{formatPercent(realizedAPY)}</span>
              </div>
            )}
          </>
        ) : (
          // Trading fund display
          <>
            <div className="flex justify-between gap-1 xs:gap-2">
              <span className="text-slate-400 truncate">{features.supportsContracts ? 'Margin' : 'Size'}</span>
              <span className="text-white font-medium truncate text-right">{formatCurrency(fundSize)}</span>
            </div>

            <div className="flex justify-between gap-1 xs:gap-2">
              <span className="text-slate-400 truncate">Value</span>
              <span className={`${hasValue ? valueColorClass : 'text-slate-500'} truncate text-right font-medium`}>
                {hasValue ? formatCurrency(fund.latestEquity!.value) : '-'}
              </span>
            </div>

            {realizedAPY !== undefined && liquidAPY !== undefined ? (
              <>
                <div className="flex justify-between gap-1 xs:gap-2">
                  <span className="text-slate-400 truncate">Realized</span>
                  <span className="text-slate-300 truncate text-right">{formatPercent(realizedAPY)}</span>
                </div>
                <div className="flex justify-between gap-1 xs:gap-2">
                  <span className="text-slate-400 truncate">Liquid</span>
                  <span className="text-slate-300 truncate text-right">{formatPercent(liquidAPY)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-1 xs:gap-2">
                <span className="text-slate-400 truncate">APY</span>
                <span className="text-slate-300 truncate text-right">{formatPercentShort(fund.config.target_apy)} / {fund.config.interval_days}d</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-1 xs:mt-1.5 sm:mt-2 pt-1 xs:pt-1.5 sm:pt-2 border-t border-slate-700">
        <div className="flex justify-between text-[7px] xs:text-[8px] sm:text-[10px]">
          <span className="text-slate-500">{fund.entryCount} entries</span>
          {fund.latestEquity && (
            <span className="text-slate-500 truncate ml-1">
              {fund.firstEntryDate && fund.firstEntryDate !== fund.latestEquity.date
                ? `${fund.firstEntryDate} → ${fund.latestEquity.date}`
                : fund.latestEquity.date}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
