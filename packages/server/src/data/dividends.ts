/**
 * Historical dividend data for leveraged ETFs
 * Single source of truth - imported by test-data-generator and pages build script
 */

export interface DividendPayment {
  exDate: string  // Ex-dividend date YYYY-MM-DD
  amount: number  // Per-share dividend amount
}

// Historical dividend data for SPXL (ex-dividend dates and amounts per share)
export const SPXL_DIVIDENDS: DividendPayment[] = [
  { exDate: '2021-06-22', amount: 0.04113 },
  { exDate: '2021-12-21', amount: 0.11481 },
  { exDate: '2022-06-22', amount: 0.07763 },
  { exDate: '2022-12-20', amount: 0.12356 },
  { exDate: '2023-03-21', amount: 0.26189 },
  { exDate: '2023-06-21', amount: 0.25846 },
  { exDate: '2023-09-19', amount: 0.19445 },
  { exDate: '2023-12-21', amount: 0.30383 },
  { exDate: '2024-03-19', amount: 0.39478 },
  { exDate: '2024-06-25', amount: 0.33671 },
  { exDate: '2024-09-24', amount: 0.19251 },
  { exDate: '2024-12-23', amount: 0.3207 },
  { exDate: '2025-03-25', amount: 0.4935 },
  { exDate: '2025-06-24', amount: 0.57306 },
  { exDate: '2025-09-23', amount: 0.28356 },
  { exDate: '2025-12-23', amount: 0.17186 }
]

// Historical dividend data for TQQQ (ex-dividend dates and amounts per share)
export const TQQQ_DIVIDENDS: DividendPayment[] = [
  { exDate: '2021-12-23', amount: 0.00003 },
  { exDate: '2022-12-22', amount: 0.04896 },
  { exDate: '2023-03-22', amount: 0.0749 },
  { exDate: '2023-06-21', amount: 0.06379 },
  { exDate: '2023-09-20', amount: 0.06932 },
  { exDate: '2023-12-20', amount: 0.11172 },
  { exDate: '2024-03-20', amount: 0.10757 },
  { exDate: '2024-06-26', amount: 0.14139 },
  { exDate: '2024-09-25', amount: 0.11511 },
  { exDate: '2024-12-23', amount: 0.13771 },
  { exDate: '2025-03-26', amount: 0.09886 },
  { exDate: '2025-06-25', amount: 0.10916 },
  { exDate: '2025-09-24', amount: 0.04891 },
  { exDate: '2025-12-24', amount: 0.08554 }
]
