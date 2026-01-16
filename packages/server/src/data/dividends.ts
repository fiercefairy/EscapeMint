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

// Historical dividend data for SPY (ex-dividend dates and amounts per share)
export const SPY_DIVIDENDS: DividendPayment[] = [
  { exDate: '2021-03-19', amount: 1.27779 },
  { exDate: '2021-06-18', amount: 1.37588 },
  { exDate: '2021-09-17', amount: 1.42812 },
  { exDate: '2021-12-17', amount: 1.63643 },
  { exDate: '2022-03-18', amount: 1.36601 },
  { exDate: '2022-06-17', amount: 1.57687 },
  { exDate: '2022-09-16', amount: 1.5964 },
  { exDate: '2022-12-16', amount: 1.7814 },
  { exDate: '2023-03-17', amount: 1.5062 },
  { exDate: '2023-06-16', amount: 1.63837 },
  { exDate: '2023-09-15', amount: 1.58317 },
  { exDate: '2023-12-15', amount: 1.90607 },
  { exDate: '2024-03-15', amount: 1.59494 },
  { exDate: '2024-06-21', amount: 1.75902 },
  { exDate: '2024-09-20', amount: 1.74553 },
  { exDate: '2024-12-20', amount: 1.96555 },
  { exDate: '2025-03-21', amount: 1.69553 },
  { exDate: '2025-06-20', amount: 1.76112 },
  { exDate: '2025-09-19', amount: 1.83111 },
  { exDate: '2025-12-19', amount: 1.99337 }
]
