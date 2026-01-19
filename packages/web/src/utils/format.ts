export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Compact currency format for chart axes: $1.2M, $50K, $500
 */
export const formatCurrencyCompact = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

export const formatPercent = (value: number) => {
  // Handle edge cases
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return '--'
  }
  // Clamp extremely large values
  const clamped = Math.max(-9999, Math.min(9999, value))
  const pct = clamped * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
}

/**
 * Simple percent format for allocations: 45.2%
 */
export const formatPercentSimple = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Format date in local timezone as YYYY-MM-DD
 * Use this instead of toISOString() to avoid UTC timezone issues
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Detect if a value change looks like a digit error (missing or extra digit)
 * Returns 'extra' if user likely added a digit, 'missing' if likely removed one, null if ok
 */
export function detectDigitError(newValue: number, priorValue: number): 'extra' | 'missing' | null {
  // Skip if either value is 0 or negative
  if (newValue <= 0 || priorValue <= 0) return null

  // Calculate the ratio
  const ratio = newValue / priorValue

  // Check for ~10x increase (extra digit)
  // Range 8-12 allows ~20% variance around 10x to catch values like $1,200 -> $11,000 (9.17x)
  // while avoiding false positives from more modest legitimate gains
  if (ratio >= 8 && ratio <= 12) {
    return 'extra'
  }

  // Check for ~0.1x decrease (missing digit)
  // Range 0.08-0.12 is the inverse of 8-12, catching values like $12,000 -> $1,200 (0.1x)
  if (ratio >= 0.08 && ratio <= 0.12) {
    return 'missing'
  }

  return null
}

/**
 * Get the expected current equity from a list of fund entries
 * Used for digit error detection when entering new equity values
 * Calculates equity AFTER the last action (since value is BEFORE action)
 */
export const getPriorEquity = (entries: {
  date: string
  value?: number
  action?: string
  amount?: number
  dividend?: number
  cash_interest?: number
}[]): number | null => {
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const lastEntry = sorted[sorted.length - 1]
  if (!lastEntry || lastEntry.value === undefined) return null

  let equity = lastEntry.value
  const amount = lastEntry.amount ?? 0

  // Calculate expected equity AFTER the last action
  // value is the equity BEFORE the action was taken
  switch (lastEntry.action) {
    case 'BUY':
    case 'DEPOSIT':
      equity += Math.abs(amount)
      break
    case 'SELL':
    case 'WITHDRAW':
      // Use Math.abs because cash fund WITHDRAW amounts may be stored as negative
      equity -= Math.abs(amount)
      break
    // HOLD, MARGIN, derivatives actions: no simple amount-based change
  }

  // Add dividend and interest income (these are always additions)
  equity += lastEntry.dividend ?? 0
  equity += lastEntry.cash_interest ?? 0

  return equity
}

/**
 * Check if the US stock market is closed on the given date.
 *
 * This check is performed using US Eastern Time (America/New_York),
 * independent of the user's local browser timezone. Returns true for
 * weekends and major US stock market holidays.
 */
export function isStockMarketClosed(date: Date = new Date()): boolean {
  // Normalize the provided date to US Eastern Time calendar components
  const usEasternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short'
  })

  const parts = usEasternFormatter.formatToParts(date)

  let year: number | undefined
  let month: number | undefined
  let day: number | undefined
  let weekday: string | undefined

  for (const part of parts) {
    if (part.type === 'year') {
      year = Number(part.value)
    } else if (part.type === 'month') {
      month = Number(part.value)
    } else if (part.type === 'day') {
      day = Number(part.value)
    } else if (part.type === 'weekday') {
      weekday = part.value
    }
  }

  // Fallback to local-time behavior if parsing fails for any reason
  if (!year || !month || !day || !weekday) {
    const localDayOfWeek = date.getDay()
    if (localDayOfWeek === 0 || localDayOfWeek === 6) {
      return true
    }
    return isUSMarketHoliday(date)
  }

  // Weekend check in US Eastern Time (Saturday/Sunday)
  if (weekday === 'Sat' || weekday === 'Sun') {
    return true
  }

  // Construct a synthetic Date corresponding to the US Eastern calendar date.
  // Using UTC here ensures isUSMarketHoliday operates on the correct year/month/day
  // regardless of the user's local timezone offset.
  const usEasternDate = new Date(Date.UTC(year, month - 1, day))

  // Check for US stock market holidays
  return isUSMarketHoliday(usEasternDate)
}

/**
 * Check if date is a US stock market holiday
 * Includes: New Year's Day, MLK Day, Presidents Day, Good Friday,
 * Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas
 */
function isUSMarketHoliday(date: Date): boolean {
  const year = date.getFullYear()
  const month = date.getMonth() // 0-indexed
  const day = date.getDate()

  // Helper to get observed date for fixed holidays
  // If falls on Saturday, observed Friday. If Sunday, observed Monday.
  // Uses Date arithmetic to safely handle month boundaries.
  const getObservedDate = (m: number, d: number): { month: number; day: number } => {
    const holiday = new Date(year, m, d)
    const dow = holiday.getDay()
    if (dow === 6) {
      // Saturday -> observed on previous Friday
      const observed = new Date(holiday)
      observed.setDate(observed.getDate() - 1)
      return { month: observed.getMonth(), day: observed.getDate() }
    }
    if (dow === 0) {
      // Sunday -> observed on next Monday
      const observed = new Date(holiday)
      observed.setDate(observed.getDate() + 1)
      return { month: observed.getMonth(), day: observed.getDate() }
    }
    return { month: m, day: d }
  }

  // Helper to get nth weekday of month (e.g., 3rd Monday)
  const getNthWeekdayOfMonth = (m: number, weekday: number, n: number): number => {
    const firstDay = new Date(year, m, 1)
    const firstWeekday = firstDay.getDay()
    const daysUntilWeekday = (weekday - firstWeekday + 7) % 7
    return 1 + daysUntilWeekday + (n - 1) * 7
  }

  // Helper to get last weekday of month
  const getLastWeekdayOfMonth = (m: number, weekday: number): number => {
    const lastDay = new Date(year, m + 1, 0).getDate()
    const lastDayOfWeek = new Date(year, m, lastDay).getDay()
    const daysBack = (lastDayOfWeek - weekday + 7) % 7
    return lastDay - daysBack
  }

  // New Year's Day (January 1, observed)
  const newYears = getObservedDate(0, 1)
  if (month === newYears.month && day === newYears.day) return true

  // Martin Luther King Jr. Day (3rd Monday of January)
  if (month === 0 && day === getNthWeekdayOfMonth(0, 1, 3)) return true

  // Presidents Day (3rd Monday of February)
  if (month === 1 && day === getNthWeekdayOfMonth(1, 1, 3)) return true

  // Good Friday (Friday before Easter)
  const easter = calculateEaster(year)
  const goodFriday = new Date(easter)
  goodFriday.setDate(goodFriday.getDate() - 2)
  if (month === goodFriday.getMonth() && day === goodFriday.getDate()) return true

  // Memorial Day (Last Monday of May)
  if (month === 4 && day === getLastWeekdayOfMonth(4, 1)) return true

  // Juneteenth (June 19, observed)
  const juneteenth = getObservedDate(5, 19)
  if (month === juneteenth.month && day === juneteenth.day) return true

  // Independence Day (July 4, observed)
  const july4 = getObservedDate(6, 4)
  if (month === july4.month && day === july4.day) return true

  // Labor Day (1st Monday of September)
  if (month === 8 && day === getNthWeekdayOfMonth(8, 1, 1)) return true

  // Thanksgiving (4th Thursday of November)
  if (month === 10 && day === getNthWeekdayOfMonth(10, 4, 4)) return true

  // Christmas (December 25, observed)
  const christmas = getObservedDate(11, 25)
  if (month === christmas.month && day === christmas.day) return true

  return false
}

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function calculateEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}
