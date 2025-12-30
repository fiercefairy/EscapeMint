import { Router } from 'express'
import { computeFundState, computeRecommendation } from '@escapemint/engine'
import type { SubFundConfig, Trade, CashFlow, Dividend, Expense } from '@escapemint/engine'
import { badRequest } from '../middleware/error-handler.js'

export const computeRouter = Router()

interface ComputeRequest {
  config: SubFundConfig
  trades: Trade[]
  cashflows: CashFlow[]
  dividends: Dividend[]
  expenses: Expense[]
  snapshot_date: string
  equity_value_usd: number
}

computeRouter.post('/recommendation', async (req, res, next) => {
  const input = req.body as ComputeRequest

  if (!input.config) {
    return next(badRequest('config is required'))
  }
  if (!input.snapshot_date) {
    return next(badRequest('snapshot_date is required'))
  }
  if (input.equity_value_usd === undefined) {
    return next(badRequest('equity_value_usd is required'))
  }

  const state = computeFundState(
    input.config,
    input.trades ?? [],
    input.cashflows ?? [],
    input.dividends ?? [],
    input.expenses ?? [],
    input.equity_value_usd,
    input.snapshot_date
  )

  const recommendation = computeRecommendation(input.config, state)

  res.json({
    state,
    recommendation
  })
})
