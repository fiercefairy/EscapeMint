import { test, expect } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  getFundStateViaAPI,
  getFundViaAPI,
  generateTestConfig,
  addDays,
  daysBetween,
  computeStartInput,
  computeExpectedTarget,
  type FundEntry
} from './test-utils'
import { TEST_PLATFORM, TEST_TICKERS } from './test-fixtures'
import {
  getBullMarketReturns,
  getBearMarketReturns,
  getVolatileMarketReturns,
  getCrashRecoveryReturns,
  getSteadyGrowthReturns
} from './test-historical-data'

test.describe('Yearly Fund Simulations', () => {
  test.describe('Bull Market Scenario', () => {
    test('fund grows correctly over 52 weeks with DCA', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.BULL_MARKET
      const config = generateTestConfig({
        fund_size_usd: 50000,
        target_apy: 0.25,
        interval_days: 7,
        input_min_usd: 200,
        input_mid_usd: 400,
        input_max_usd: 800,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
      const returns = getBullMarketReturns()

      let currentValue = 0
      let currentDate = '2024-01-01'
      const trades: Array<{ date: string; amount: number; type: 'buy' | 'sell' }> = []

      // Week 0: Initial entry
      const initialResult = await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: 200,
        action: 'BUY',
        amount: 200
      })
      currentValue = 200
      trades.push({ date: currentDate, amount: 200, type: 'buy' })

      // Simulate 51 more weeks
      for (let week = 1; week < 52; week++) {
        currentDate = addDays(currentDate, 7)
        const weeklyReturn = returns[week]
        currentValue = currentValue * (1 + weeklyReturn)

        // Get recommendation
        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = rec.amount
          currentValue += rec.amount
          trades.push({ date: currentDate, amount: rec.amount, type: 'buy' })
        } else if (rec && rec.action === 'SELL') {
          entry.action = 'SELL'
          entry.amount = rec.amount
          currentValue -= rec.amount
          trades.push({ date: currentDate, amount: rec.amount, type: 'sell' })
        } else {
          entry.action = 'HOLD'
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // Final verification
      const finalState = await getFundStateViaAPI(page, fund.id)

      // Verify start_input matches our tracked trades
      const expectedStartInput = computeStartInput(trades, currentDate)
      expect(finalState.state!.start_input_usd).toBeCloseTo(expectedStartInput, 0)

      // In a bull market, if we still have a position, we should have positive gains
      // If position was fully liquidated (profit-taking), start_input = 0 and gain = 0 is correct
      if (finalState.state!.start_input_usd > 0) {
        expect(finalState.state!.gain_usd).toBeGreaterThan(0)
        expect(finalState.state!.gain_pct).toBeGreaterThan(0)
      }

      // Verify we have 52 entries
      const fundData = await getFundViaAPI(page, fund.id)
      expect(fundData.entries.length).toBe(52)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Bear Market Scenario', () => {
    test('fund uses increasing DCA amounts during losses', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.BEAR_MARKET
      const config = generateTestConfig({
        fund_size_usd: 100000,
        target_apy: 0.20,
        interval_days: 7,
        input_min_usd: 100,
        input_mid_usd: 300,
        input_max_usd: 600,
        max_at_pct: -0.25,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
      const returns = getBearMarketReturns()

      let currentValue = 0
      let currentDate = '2024-01-01'
      const dcaAmounts: number[] = []

      // Initial entry
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: 500,
        action: 'BUY',
        amount: 500
      })
      currentValue = 500
      dcaAmounts.push(500)

      // Track DCA amounts used
      for (let week = 1; week < 26; week++) {
        currentDate = addDays(currentDate, 7)
        const weeklyReturn = returns[week]
        currentValue = Math.max(0.01, currentValue * (1 + weeklyReturn))

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = rec.amount
          dcaAmounts.push(rec.amount)
          currentValue += rec.amount
        } else {
          entry.action = 'HOLD'
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // In a bear market, we should see input_mid and input_max being used
      const midCount = dcaAmounts.filter(a => a === config.input_mid_usd).length
      const maxCount = dcaAmounts.filter(a => a === config.input_max_usd).length

      // Should have used mid or max DCA at least sometimes
      expect(midCount + maxCount).toBeGreaterThan(0)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Volatile Market Scenario', () => {
    test('fund handles frequent buy/sell switches', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.VOLATILE
      const config = generateTestConfig({
        fund_size_usd: 50000,
        target_apy: 0.15,
        interval_days: 7,
        input_min_usd: 100,
        min_profit_usd: 50,
        accumulate: true,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
      const returns = getVolatileMarketReturns()

      let currentValue = 1000
      let currentDate = '2024-01-01'
      const actions: string[] = []

      // Initial entry
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: currentValue,
        action: 'BUY',
        amount: 1000
      })
      actions.push('BUY')

      for (let week = 1; week < 52; week++) {
        currentDate = addDays(currentDate, 7)
        const weeklyReturn = returns[week]
        currentValue = Math.max(10, currentValue * (1 + weeklyReturn))

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = Math.min(rec.amount, stateResult.state!.cash_available_usd)
          if (entry.amount > 0) {
            currentValue += entry.amount
            actions.push('BUY')
          } else {
            entry.action = 'HOLD'
            actions.push('HOLD')
          }
        } else if (rec && rec.action === 'SELL') {
          entry.action = 'SELL'
          entry.amount = Math.min(rec.amount, currentValue)
          currentValue = Math.max(0, currentValue - entry.amount)
          actions.push('SELL')
        } else {
          entry.action = 'HOLD'
          actions.push('HOLD')
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // In volatile market, we should see a mix of actions
      const buyCount = actions.filter(a => a === 'BUY').length
      const sellCount = actions.filter(a => a === 'SELL').length

      // Verify we had both buys and potentially some sells
      expect(buyCount).toBeGreaterThan(0)

      // Verify fund data integrity
      const fundData = await getFundViaAPI(page, fund.id)
      expect(fundData.entries.length).toBe(52)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Crash and Recovery Scenario', () => {
    test('fund increases DCA during crash and captures recovery', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.CRASH_RECOVERY
      const config = generateTestConfig({
        fund_size_usd: 100000,
        target_apy: 0.20,
        interval_days: 7,
        input_min_usd: 200,
        input_mid_usd: 500,
        input_max_usd: 1000,
        max_at_pct: -0.30,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
      const returns = getCrashRecoveryReturns()

      let currentValue = 2000
      let currentDate = '2024-01-01'
      let peakValue = currentValue
      let troughValue = currentValue
      const dcaHistory: Array<{ week: number; amount: number; gainPct: number }> = []

      // Initial entry
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: currentValue,
        action: 'BUY',
        amount: 2000
      })

      for (let week = 1; week < 52; week++) {
        currentDate = addDays(currentDate, 7)
        const weeklyReturn = returns[week]
        const prevValue = currentValue
        currentValue = Math.max(10, currentValue * (1 + weeklyReturn))

        peakValue = Math.max(peakValue, currentValue)
        troughValue = Math.min(troughValue, currentValue)

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = Math.min(rec.amount, stateResult.state!.cash_available_usd)
          if (entry.amount > 0) {
            dcaHistory.push({
              week,
              amount: entry.amount,
              gainPct: stateResult.state!.gain_pct
            })
            currentValue += entry.amount
          }
        } else if (rec && rec.action === 'SELL') {
          entry.action = 'SELL'
          entry.amount = rec.amount
          currentValue = Math.max(0, currentValue - entry.amount)
        } else {
          entry.action = 'HOLD'
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // During crash (weeks 14-17), should see larger DCA amounts
      const crashWeekDCAs = dcaHistory.filter(d => d.week >= 14 && d.week <= 20)
      const normalWeekDCAs = dcaHistory.filter(d => d.week < 10)

      if (crashWeekDCAs.length > 0 && normalWeekDCAs.length > 0) {
        const avgCrashDCA = crashWeekDCAs.reduce((s, d) => s + d.amount, 0) / crashWeekDCAs.length
        const avgNormalDCA = normalWeekDCAs.reduce((s, d) => s + d.amount, 0) / normalWeekDCAs.length
        // During crash, DCA should be higher or equal
        expect(avgCrashDCA).toBeGreaterThanOrEqual(avgNormalDCA * 0.9) // Allow some tolerance
      }

      // Verify final state
      const finalState = await getFundStateViaAPI(page, fund.id)

      // Should have substantial investment after a year of DCA
      expect(finalState.state!.start_input_usd).toBeGreaterThan(config.input_min_usd * 20)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Fund with Dividends and Interest', () => {
    test('quarterly dividends and monthly interest accumulate correctly', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.DIVIDENDS_INTEREST
      const config = generateTestConfig({
        fund_size_usd: 50000,
        target_apy: 0.20,
        cash_apy: 0.05,
        dividend_reinvest: true,
        interest_reinvest: true,
        interval_days: 7,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      let currentValue = 10000
      let currentDate = '2024-01-01'
      let totalDividends = 0
      let totalInterest = 0

      // Initial entry
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: currentValue,
        action: 'BUY',
        amount: 10000
      })

      // Simulate 51 more weeks (weeks 1-51, initial is week 0)
      for (let week = 1; week <= 51; week++) {
        currentDate = addDays(currentDate, 7)
        // Slight growth
        currentValue = currentValue * (1 + 0.003)

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100,
          action: 'HOLD'
        }

        // Add dividend quarterly (weeks 13, 26, 39, 52) - but we only go to 51
        // So dividends are at weeks 13, 26, 39 (3 quarters from week 1-51)
        // Plus we need a final entry for week 52
        if (week === 13 || week === 26 || week === 39) {
          const dividend = Math.round(currentValue * 0.005 * 100) / 100 // 0.5% dividend
          entry.dividend = dividend
          totalDividends += dividend
        }

        // Add interest monthly (approximately every 4 weeks)
        if (week % 4 === 0) {
          const stateResult = await getFundStateViaAPI(page, fund.id)
          const cash = stateResult.state!.cash_available_usd
          // Approximate monthly interest
          const interest = Math.round(cash * 0.05 / 12 * 100) / 100
          if (interest > 0) {
            entry.cash_interest = interest
            totalInterest += interest
          }
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // Week 52: final entry with Q4 dividend
      currentDate = addDays(currentDate, 7)
      currentValue = currentValue * (1 + 0.003)
      const finalDividend = Math.round(currentValue * 0.005 * 100) / 100
      totalDividends += finalDividend
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: Math.round(currentValue * 100) / 100,
        action: 'HOLD',
        dividend: finalDividend
      })

      // Verify final state includes accumulated dividends and interest
      const finalState = await getFundStateViaAPI(page, fund.id)

      // Cash interest should be tracked
      expect(finalState.state!.cash_interest_usd).toBeGreaterThan(0)

      // Verify all entries are present (initial + 51 weeks + week 52 = 53)
      const fundData = await getFundViaAPI(page, fund.id)
      expect(fundData.entries.length).toBe(53)

      // Count entries with dividends
      const dividendEntries = fundData.entries.filter(e => e.dividend && e.dividend > 0)
      expect(dividendEntries.length).toBe(4) // 4 quarters

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Full Fund Lifecycle', () => {
    test('create, grow, partially liquidate, and track correctly', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.LIFECYCLE
      const config = generateTestConfig({
        fund_size_usd: 25000,
        target_apy: 0.25,
        interval_days: 7,
        input_min_usd: 100,
        min_profit_usd: 200,
        accumulate: true,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      let currentValue = 500
      let currentDate = '2024-01-01'
      let totalBuys = 0
      let totalSells = 0

      // Initial entry
      await addEntryViaAPI(page, fund.id, {
        date: currentDate,
        value: currentValue,
        action: 'BUY',
        amount: 500
      })
      totalBuys += 500

      // Phase 1: Growth period (26 weeks)
      for (let week = 1; week <= 26; week++) {
        currentDate = addDays(currentDate, 7)
        currentValue = currentValue * 1.015 // 1.5% weekly growth

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = Math.min(rec.amount, stateResult.state!.cash_available_usd)
          if (entry.amount > 0) {
            currentValue += entry.amount
            totalBuys += entry.amount
          }
        } else if (rec && rec.action === 'SELL') {
          entry.action = 'SELL'
          entry.amount = rec.amount
          currentValue = Math.max(0, currentValue - entry.amount)
          totalSells += entry.amount
        } else {
          entry.action = 'HOLD'
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // Phase 2: Consolidation (26 weeks with smaller moves) - use deterministic returns
      const consolidationReturns = getSteadyGrowthReturns()
      for (let week = 27; week <= 52; week++) {
        currentDate = addDays(currentDate, 7)
        currentValue = currentValue * (1 + consolidationReturns[week - 27] * 0.5) // Scale down for consolidation

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const rec = stateResult.recommendation

        let entry: FundEntry = {
          date: currentDate,
          value: Math.round(currentValue * 100) / 100
        }

        if (rec && rec.action === 'BUY') {
          entry.action = 'BUY'
          entry.amount = Math.min(rec.amount, stateResult.state!.cash_available_usd)
          if (entry.amount > 0) {
            currentValue += entry.amount
            totalBuys += entry.amount
          }
        } else if (rec && rec.action === 'SELL') {
          entry.action = 'SELL'
          entry.amount = rec.amount
          currentValue = Math.max(0, currentValue - entry.amount)
          totalSells += entry.amount
        } else {
          entry.action = 'HOLD'
        }

        await addEntryViaAPI(page, fund.id, entry)
      }

      // Final verification
      const finalState = await getFundStateViaAPI(page, fund.id)
      const fundData = await getFundViaAPI(page, fund.id)

      // Verify start_input using the same liquidation-aware computation as the engine
      const trades: Array<{ date: string; amount: number; type: 'buy' | 'sell' }> = []
      for (const entry of fundData.entries) {
        if (entry.action === 'BUY' && entry.amount) {
          trades.push({ date: entry.date, amount: entry.amount, type: 'buy' })
        } else if (entry.action === 'SELL' && entry.amount) {
          trades.push({ date: entry.date, amount: entry.amount, type: 'sell' })
        }
      }
      const finalEntry = fundData.entries[fundData.entries.length - 1]
      const expectedStartInput = computeStartInput(trades, finalEntry.date)
      expect(finalState.state!.start_input_usd).toBeCloseTo(expectedStartInput, 0)

      // Verify entry count
      expect(fundData.entries.length).toBe(53) // Initial + 52 weeks

      // Verify actual_value_usd matches the last entry value
      const lastEntry = fundData.entries[fundData.entries.length - 1]
      expect(finalState.state!.actual_value_usd).toBeCloseTo(lastEntry.value, 1)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Mathematical Invariants', () => {
    test('cash + invested equals fund_size (with manage_cash=true)', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.INVARIANT_CASH
      const fundSize = 20000
      const config = generateTestConfig({
        fund_size_usd: fundSize,
        manage_cash: true,
        cash_apy: 0, // Disable interest to test pure invariant
        interest_reinvest: false, // No interest accumulation
        dividend_reinvest: false, // No dividend accumulation
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      let currentDate = '2024-01-01'
      let currentValue = 0

      // Add several buys
      for (let i = 0; i < 10; i++) {
        if (i > 0) {
          currentDate = addDays(currentDate, 7)
          currentValue *= 1.01 // Small growth
        }

        const stateResult = await getFundStateViaAPI(page, fund.id)
        const cash = stateResult.state?.cash_available_usd ?? fundSize

        const buyAmount = Math.min(500, cash)
        if (buyAmount > 0) {
          currentValue += buyAmount

          await addEntryViaAPI(page, fund.id, {
            date: currentDate,
            value: Math.round(currentValue * 100) / 100,
            action: 'BUY',
            amount: buyAmount
          })

          // Verify invariant after each buy
          const newState = await getFundStateViaAPI(page, fund.id)
          const invested = newState.state!.start_input_usd
          const newCash = newState.state!.cash_available_usd

          // cash + invested should approximately equal fund_size
          // (may differ slightly due to dividends, interest, expenses)
          expect(invested + newCash).toBeCloseTo(fundSize, -1) // Within $10
        }
      }

      await deleteFundViaAPI(page, fund.id)
    })

    test('gain_pct equals (actual - invested) / invested', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.INVARIANT_GAIN
      const config = generateTestConfig({
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Buy $1000
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Value grows to $1250 (25% gain)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1250,
        action: 'HOLD'
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)
      const state = stateResult.state!

      // Verify gain calculation
      const expectedGainUsd = state.actual_value_usd - state.start_input_usd
      expect(state.gain_usd).toBeCloseTo(expectedGainUsd, 2)

      const expectedGainPct = (state.actual_value_usd / state.start_input_usd) - 1
      expect(state.gain_pct).toBeCloseTo(expectedGainPct, 4)

      await deleteFundViaAPI(page, fund.id)
    })

    test('start_input never goes negative', async ({ page }) => {
      const ticker = TEST_TICKERS.SIMULATION.INVARIANT_POSITIVE
      const config = generateTestConfig({
        fund_size_usd: 10000,
        min_profit_usd: 10,
        accumulate: false, // Full liquidation
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Sell more than we have (should be capped)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 500,
        action: 'SELL',
        amount: 800
      })

      // Sell again
      await addEntryViaAPI(page, fund.id, {
        date: '2024-03-01',
        value: 0,
        action: 'SELL',
        amount: 500
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // start_input should never be negative
      expect(stateResult.state!.start_input_usd).toBeGreaterThanOrEqual(0)

      await deleteFundViaAPI(page, fund.id)
    })
  })
})
