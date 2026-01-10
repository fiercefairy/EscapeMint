/**
 * Feature Coverage Matrix for E2E Tests
 *
 * This file defines all features that should be tested and tracks which
 * spec files provide coverage for each feature.
 *
 * Run `npm run test:coverage-report` to generate an HTML report.
 */

export interface FeatureTest {
  tested: boolean
  spec: string | null
  testName?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface FeatureCategory {
  name: string
  features: Record<string, FeatureTest>
}

export const FEATURE_COVERAGE: Record<string, FeatureCategory> = {
  'fund-management': {
    name: 'Fund Management',
    features: {
      'create-stock-fund': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'fund with manage_cash=true maintains cash pool',
        priority: 'critical'
      },
      'create-crypto-fund': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'fund with manage_cash=false has zero cash pool',
        priority: 'critical'
      },
      'create-cash-fund': {
        tested: true,
        spec: 'cash-funds.spec.ts',
        testName: 'can create a cash fund',
        priority: 'high'
      },
      'create-derivatives-fund': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'can create a BTC perpetual futures fund',
        priority: 'high'
      },
      'edit-fund-config': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'fund size changes propagate',
        priority: 'critical'
      },
      'delete-fund': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        priority: 'critical'
      },
      'close-fund': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'closed fund shows final metrics',
        priority: 'high'
      },
      'reopen-fund': {
        tested: false,
        spec: null,
        priority: 'medium'
      }
    }
  },

  'entry-management': {
    name: 'Entry Management',
    features: {
      'add-buy-entry': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        priority: 'critical'
      },
      'add-sell-entry': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        priority: 'critical'
      },
      'add-deposit-entry': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'cash pool reflects deposits and withdrawals',
        priority: 'high'
      },
      'add-withdraw-entry': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'cash pool reflects deposits and withdrawals',
        priority: 'high'
      },
      'add-hold-entry': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        priority: 'medium'
      },
      'add-dividend-entry': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'dividends reinvested add to cash',
        priority: 'high'
      },
      'add-expense-entry': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'expense_from_fund deducts from cash',
        priority: 'high'
      },
      'add-cash-interest': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'interest reinvested adds to cash',
        priority: 'high'
      },
      'edit-entry': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'editing buy amount recalculates subsequent entries',
        priority: 'critical'
      },
      'delete-entry': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'deleting middle entry recalculates state',
        priority: 'critical'
      },
      'entry-date-validation': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'entries maintain chronological order',
        priority: 'high'
      }
    }
  },

  'derivatives-entries': {
    name: 'Derivatives Entry Types',
    features: {
      'add-funding-entry': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'FUNDING payment affects margin balance and realized gains',
        priority: 'high'
      },
      'add-interest-entry': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'INTEREST (USDC interest) adds to realized gains',
        priority: 'high'
      },
      'add-rebate-entry': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'REBATE adds to margin balance',
        priority: 'medium'
      },
      'add-fee-entry': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'FEE reduces margin balance',
        priority: 'medium'
      }
    }
  },

  'fund-configurations': {
    name: 'Fund Configuration Flags',
    features: {
      'manage-cash-enabled': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'fund with manage_cash=true maintains cash pool',
        priority: 'high'
      },
      'manage-cash-disabled': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'fund with manage_cash=false has zero cash pool',
        priority: 'high'
      },
      'accumulate-mode-true': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'accumulate mode sells only limit amount',
        priority: 'high'
      },
      'accumulate-mode-false': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'liquidation mode sells entire position',
        priority: 'high'
      },
      'margin-enabled': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'margin access tracks borrowing',
        priority: 'high'
      },
      'margin-disabled': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'no margin maintains zero borrowed',
        priority: 'high'
      },
      'dividend-reinvest-true': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'dividends reinvested add to cash',
        priority: 'high'
      },
      'dividend-reinvest-false': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'dividends extracted add to realized gains',
        priority: 'high'
      },
      'interest-reinvest-true': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'interest reinvested adds to cash',
        priority: 'high'
      },
      'interest-reinvest-false': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'interest extracted adds to realized gains',
        priority: 'high'
      },
      'expense-from-fund-true': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'expense_from_fund deducts from cash',
        priority: 'medium'
      },
      'expense-from-fund-false': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'external expenses do not affect fund',
        priority: 'medium'
      }
    }
  },

  'dca-tiers': {
    name: 'DCA Tier Logic',
    features: {
      'dca-min-when-profitable': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'uses input_min when profitable',
        priority: 'high'
      },
      'dca-mid-when-mild-loss': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'uses input_mid when in mild loss',
        priority: 'high'
      },
      'dca-max-when-significant-loss': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'uses input_max when in significant loss',
        priority: 'high'
      },
      'dca-tier-escalation': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'bear market tracks DCA tier escalation',
        priority: 'medium'
      }
    }
  },

  'calculations': {
    name: 'Calculation Accuracy',
    features: {
      'apy-compounding': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'date edit changes expected target',
        priority: 'critical'
      },
      'start-input-calculation': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'start_input matches computed trade history',
        priority: 'critical'
      },
      'gain-percentage': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'gain_pct = (actual - invested) / invested',
        priority: 'critical'
      },
      'cash-plus-invested-equals-fund-size': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'cash + invested = fund_size',
        priority: 'critical'
      },
      'full-liquidation-reset': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'full liquidation resets and restarts',
        priority: 'high'
      },
      'share-tracking': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'share counts accumulate correctly',
        priority: 'medium'
      },
      'closed-fund-apy': {
        tested: true,
        spec: 'fund-configurations.spec.ts',
        testName: 'closed fund shows final metrics',
        priority: 'medium'
      }
    }
  },

  'derivatives-calculations': {
    name: 'Derivatives Calculations',
    features: {
      'margin-balance-tracking': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'tracks margin usage after trades',
        priority: 'high'
      },
      'leverage-calculation': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'cash constraint prevents over-leveraging',
        priority: 'high'
      },
      'liquidation-price': {
        tested: false,
        spec: null,
        priority: 'high'
        // TODO: Add test for derivatives liquidation price calculation
      },
      'funding-payment-pnl': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'funding payments affect realized P&L',
        priority: 'high'
      },
      'captured-profit': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'realized P&L accumulated from closed trades',
        priority: 'medium'
      },
      'notional-value': {
        tested: true,
        spec: 'derivatives-funds.spec.ts',
        testName: 'BUY creates a long position and tracks margin',
        priority: 'medium'
      }
    }
  },

  'market-simulations': {
    name: 'Market Scenario Simulations',
    features: {
      'bull-market': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'bull market simulation',
        priority: 'medium'
      },
      'bear-market': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'bear market simulation',
        priority: 'medium'
      },
      'volatile-market': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'volatile market simulation',
        priority: 'medium'
      },
      'crash-recovery': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'crash and recovery simulation',
        priority: 'medium'
      },
      'dividend-interest-flow': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'dividends and interest simulation',
        priority: 'medium'
      },
      'full-lifecycle': {
        tested: true,
        spec: 'yearly-simulation.spec.ts',
        testName: 'full fund lifecycle',
        priority: 'medium'
      }
    }
  },

  'edge-cases': {
    name: 'Edge Cases',
    features: {
      'zero-value-entry': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'handles zero value entries',
        priority: 'high'
      },
      'very-small-amounts': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'handles very small amounts',
        priority: 'medium'
      },
      'very-large-amounts': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'handles very large amounts',
        priority: 'medium'
      },
      'negative-values': {
        tested: true,
        spec: 'integrity-tests.spec.ts',
        testName: 'handles negative values',
        priority: 'medium'
      },
      'leap-year-dates': {
        tested: false,
        spec: null,
        priority: 'low'
      }
    }
  },

  'ui-dashboard': {
    name: 'Dashboard UI',
    features: {
      'dashboard-load': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'dashboard loads and displays fund cards',
        priority: 'critical'
      },
      'fund-cards-display': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'dashboard loads and displays fund cards',
        priority: 'critical'
      },
      'fund-card-click-navigate': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'clicking fund card navigates to fund detail',
        priority: 'critical'
      },
      'charts-toggle': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'charts toggle persists preference',
        priority: 'medium'
      },
      'platform-filter': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'platform filter shows only funds from selected platform',
        priority: 'medium'
      },
      'aggregate-metrics': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'dashboard shows aggregate metrics',
        priority: 'high'
      },
      'grid-table-toggle': {
        tested: false,
        spec: null,
        priority: 'low'
      }
    }
  },

  'ui-fund-detail': {
    name: 'Fund Detail UI',
    features: {
      'fund-detail-load': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'fund detail page loads correctly',
        priority: 'critical'
      },
      'entry-table-display': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'fund detail page loads correctly',
        priority: 'critical'
      },
      'recommendation-badge': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'recommendation badge displays correctly',
        priority: 'high'
      },
      'charts-expand-collapse': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'charts expand and collapse',
        priority: 'medium'
      },
      'chart-y-axis-clamp': {
        tested: false,
        spec: null,
        priority: 'low'
      },
      'stats-section': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'fund detail page loads correctly',
        priority: 'medium'
      }
    }
  },

  'ui-fund-crud': {
    name: 'Fund CRUD via UI',
    features: {
      'create-fund-modal-open': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can create a new fund through the create modal',
        priority: 'critical'
      },
      'create-fund-form-fill': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can create a new fund through the create modal',
        priority: 'critical'
      },
      'create-fund-submit': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can create a new fund through the create modal',
        priority: 'critical'
      },
      'edit-fund-panel': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'edit fund config panel opens',
        priority: 'high'
      },
      'delete-fund-confirm': {
        tested: false,
        spec: null,
        priority: 'high'
        // TODO: Add test for fund deletion confirmation dialog
      }
    }
  },

  'ui-entry-crud': {
    name: 'Entry CRUD via UI',
    features: {
      'add-entry-modal': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can add entry through the UI',
        priority: 'critical'
      },
      'entry-form-fill': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can add entry through the UI',
        priority: 'critical'
      },
      'entry-form-submit': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can add entry through the UI',
        priority: 'critical'
      },
      'entry-row-click-edit': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can edit entry through the UI',
        priority: 'high'
      },
      'entry-delete-confirm': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'can delete entry with confirmation',
        priority: 'high'
      }
    }
  },

  'ui-forms': {
    name: 'Form Validation',
    features: {
      'required-field-validation': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'required fields show validation errors',
        priority: 'high'
      },
      'number-bounds-validation': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'number inputs accept valid values',
        priority: 'high'
      },
      'dca-relationship-validation': {
        tested: false,
        spec: null,
        priority: 'medium'
      },
      'date-validation': {
        tested: false,
        spec: null,
        priority: 'medium'
      },
      'duplicate-ticker-prevention': {
        tested: false,
        spec: null,
        priority: 'high'
        // TODO: Add test to verify duplicate ticker prevention on same platform
      },
      'platform-id-format': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'platform ID must be lowercase with hyphens',
        priority: 'medium'
      }
    }
  },

  'ui-navigation': {
    name: 'Navigation',
    features: {
      'deep-link-fund-detail': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'deep link to fund detail works',
        priority: 'high'
      },
      'deep-link-fund-edit': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'deep link to fund edit works',
        priority: 'medium'
      },
      'deep-link-add-entry': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'deep link to add entry works',
        priority: 'medium'
      },
      'breadcrumb-navigation': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'breadcrumb navigation works',
        priority: 'medium'
      },
      'back-button-behavior': {
        tested: true,
        spec: 'ui-workflows.spec.ts',
        testName: 'browser back button works',
        priority: 'low'
      }
    }
  },

  'platform-management': {
    name: 'Platform Management',
    features: {
      'create-platform': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'can create a new platform',
        priority: 'high'
      },
      'edit-platform': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'can update platform name',
        priority: 'medium'
      },
      'delete-empty-platform': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'can delete empty platform',
        priority: 'medium'
      },
      'delete-platform-with-funds-error': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'cannot delete platform with funds',
        priority: 'high'
      },
      'platform-cash-tracking-toggle': {
        tested: true,
        spec: 'platform-management.spec.ts',
        testName: 'can enable cash tracking on platform',
        priority: 'medium'
      }
    }
  },

  'import-export': {
    name: 'Import/Export',
    features: {
      'export-all-funds': {
        tested: true,
        spec: 'import-export.spec.ts',
        testName: 'can export all funds via API',
        priority: 'high'
      },
      'import-merge-mode': {
        tested: true,
        spec: 'import-export.spec.ts',
        testName: 'can import funds in merge mode',
        priority: 'high'
      },
      'import-replace-mode': {
        tested: true,
        spec: 'import-export.spec.ts',
        testName: 'can import funds in replace mode',
        priority: 'high'
      },
      'import-preview': {
        tested: false,
        spec: null,
        priority: 'medium'
      },
      'invalid-json-handling': {
        tested: true,
        spec: 'import-export.spec.ts',
        testName: 'import handles invalid JSON gracefully',
        priority: 'medium'
      }
    }
  },

  'backup-restore': {
    name: 'Backup & Restore',
    features: {
      'create-backup': {
        tested: false,
        spec: null,
        priority: 'medium'
      },
      'list-backups': {
        tested: false,
        spec: null,
        priority: 'low'
      },
      'restore-backup': {
        tested: false,
        spec: null,
        priority: 'medium'
      },
      'restore-confirmation': {
        tested: false,
        spec: null,
        priority: 'medium'
      }
    }
  },

  'settings': {
    name: 'Settings',
    features: {
      'toggle-advanced-tools': {
        tested: false,
        spec: null,
        priority: 'low'
      },
      'toggle-test-funds': {
        tested: false,
        spec: null,
        priority: 'low'
      },
      'settings-persistence': {
        tested: false,
        spec: null,
        priority: 'low'
      }
    }
  }
}

/**
 * Calculate coverage statistics
 */
export function calculateCoverageStats() {
  let totalFeatures = 0
  let testedFeatures = 0
  const categoryStats: Record<string, { total: number; tested: number; percentage: number }> = {}

  for (const [categoryId, category] of Object.entries(FEATURE_COVERAGE)) {
    const features = Object.values(category.features)
    const total = features.length
    const tested = features.filter(f => f.tested).length
    const percentage = total > 0 ? Math.round((tested / total) * 100) : 0

    categoryStats[categoryId] = { total, tested, percentage }
    totalFeatures += total
    testedFeatures += tested
  }

  return {
    overall: {
      total: totalFeatures,
      tested: testedFeatures,
      percentage: totalFeatures > 0 ? Math.round((testedFeatures / totalFeatures) * 100) : 0
    },
    byCategory: categoryStats,
    byPriority: calculatePriorityStats()
  }
}

function calculatePriorityStats() {
  const stats: Record<string, { total: number; tested: number; percentage: number }> = {
    critical: { total: 0, tested: 0, percentage: 0 },
    high: { total: 0, tested: 0, percentage: 0 },
    medium: { total: 0, tested: 0, percentage: 0 },
    low: { total: 0, tested: 0, percentage: 0 }
  }

  for (const category of Object.values(FEATURE_COVERAGE)) {
    for (const feature of Object.values(category.features)) {
      stats[feature.priority].total++
      if (feature.tested) {
        stats[feature.priority].tested++
      }
    }
  }

  for (const priority of Object.keys(stats)) {
    const s = stats[priority]
    s.percentage = s.total > 0 ? Math.round((s.tested / s.total) * 100) : 0
  }

  return stats
}

/**
 * Get untested features by priority
 */
export function getUntestedFeatures(priority?: 'critical' | 'high' | 'medium' | 'low') {
  const untested: Array<{ category: string; feature: string; priority: string }> = []

  for (const category of Object.values(FEATURE_COVERAGE)) {
    for (const [featureId, feature] of Object.entries(category.features)) {
      if (!feature.tested && (!priority || feature.priority === priority)) {
        untested.push({
          category: category.name,
          feature: featureId,
          priority: feature.priority
        })
      }
    }
  }

  return untested
}
