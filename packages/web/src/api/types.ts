export interface SubFund {
  id: string
  portfolio_id: string
  name: string
  period: 'daily' | 'weekly' | 'monthly' | 'custom'
  period_custom_days?: number
  action_amount_usd: number
  starting_fund_size_usd: number
  target_growth_apy: number
  start_date: string
  tolerance_pct: number
  created_at: string
  updated_at: string
}

export interface CreateSubFundInput {
  name: string
  period: 'daily' | 'weekly' | 'monthly' | 'custom'
  period_custom_days?: number
  action_amount_usd: number
  starting_fund_size_usd: number
  target_growth_apy: number
  start_date: string
  tolerance_pct: number
}

export interface ApiResult<T> {
  data?: T
  error?: string
}
