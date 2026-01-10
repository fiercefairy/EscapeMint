#!/usr/bin/env npx tsx
/**
 * Generate HTML Coverage Report
 *
 * This script generates a visual HTML report showing feature test coverage.
 * Run with: npm run test:coverage-report
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { FEATURE_COVERAGE, calculateCoverageStats, getUntestedFeatures } from './coverage-matrix.js'

const OUTPUT_DIR = join(process.cwd(), 'coverage-report')
const OUTPUT_FILE = join(OUTPUT_DIR, 'index.html')

function getStatusColor(percentage: number): string {
  if (percentage >= 80) return '#22c55e' // green
  if (percentage >= 50) return '#eab308' // yellow
  if (percentage >= 25) return '#f97316' // orange
  return '#ef4444' // red
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return '#ef4444'
    case 'high': return '#f97316'
    case 'medium': return '#eab308'
    case 'low': return '#6b7280'
    default: return '#9ca3af'
  }
}

function generateHTML(): string {
  const stats = calculateCoverageStats()
  const untestedCritical = getUntestedFeatures('critical')
  const untestedHigh = getUntestedFeatures('high')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EscapeMint Test Coverage Report</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #f8fafc;
    }
    .subtitle {
      color: #94a3b8;
      margin-bottom: 2rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      border: 1px solid #334155;
    }
    .stat-label {
      font-size: 0.875rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0.25rem 0;
    }
    .stat-detail {
      font-size: 0.875rem;
      color: #64748b;
    }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      margin-top: 0.5rem;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .section {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border: 1px solid #334155;
    }
    .section-title {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .section-badge {
      font-size: 0.875rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
    }
    .category {
      margin-bottom: 1.5rem;
    }
    .category:last-child {
      margin-bottom: 0;
    }
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border-radius: 0.5rem;
      margin-bottom: 0.75rem;
      cursor: pointer;
    }
    .category-header:hover {
      background: #1e3a5f;
    }
    .category-name {
      font-weight: 600;
      color: #e2e8f0;
    }
    .category-stats {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .feature-list {
      display: grid;
      gap: 0.5rem;
      padding-left: 1rem;
    }
    .feature {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: #0f172a;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    .feature-name {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .feature-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .feature-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .priority-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .spec-link {
      color: #60a5fa;
      text-decoration: none;
      font-size: 0.75rem;
    }
    .spec-link:hover {
      text-decoration: underline;
    }
    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }
    .alert-critical {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .alert-warning {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
    }
    .alert-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .alert-list {
      list-style: none;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .alert-list li {
      padding: 0.25rem 0;
    }
    .timestamp {
      text-align: center;
      color: #64748b;
      font-size: 0.875rem;
      margin-top: 2rem;
    }
    .priority-legend {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>EscapeMint Test Coverage Report</h1>
    <p class="subtitle">Feature-level test coverage tracking for E2E tests</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Overall Coverage</div>
        <div class="stat-value" style="color: ${getStatusColor(stats.overall.percentage)}">${stats.overall.percentage}%</div>
        <div class="stat-detail">${stats.overall.tested} of ${stats.overall.total} features tested</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${stats.overall.percentage}%; background: ${getStatusColor(stats.overall.percentage)}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Critical Priority</div>
        <div class="stat-value" style="color: ${getStatusColor(stats.byPriority.critical.percentage)}">${stats.byPriority.critical.percentage}%</div>
        <div class="stat-detail">${stats.byPriority.critical.tested} of ${stats.byPriority.critical.total} critical features</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${stats.byPriority.critical.percentage}%; background: ${getStatusColor(stats.byPriority.critical.percentage)}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">High Priority</div>
        <div class="stat-value" style="color: ${getStatusColor(stats.byPriority.high.percentage)}">${stats.byPriority.high.percentage}%</div>
        <div class="stat-detail">${stats.byPriority.high.tested} of ${stats.byPriority.high.total} high priority</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${stats.byPriority.high.percentage}%; background: ${getStatusColor(stats.byPriority.high.percentage)}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Medium Priority</div>
        <div class="stat-value" style="color: ${getStatusColor(stats.byPriority.medium.percentage)}">${stats.byPriority.medium.percentage}%</div>
        <div class="stat-detail">${stats.byPriority.medium.tested} of ${stats.byPriority.medium.total} medium priority</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${stats.byPriority.medium.percentage}%; background: ${getStatusColor(stats.byPriority.medium.percentage)}"></div>
        </div>
      </div>
    </div>

    ${untestedCritical.length > 0 ? `
    <div class="alert alert-critical">
      <div class="alert-title" style="color: #ef4444">
        <span>&#9888;</span> Untested Critical Features (${untestedCritical.length})
      </div>
      <ul class="alert-list">
        ${untestedCritical.map(f => `<li>${f.category}: <strong>${f.feature}</strong></li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${untestedHigh.length > 0 ? `
    <div class="alert alert-warning">
      <div class="alert-title" style="color: #eab308">
        <span>&#9888;</span> Untested High Priority Features (${untestedHigh.length})
      </div>
      <ul class="alert-list">
        ${untestedHigh.slice(0, 10).map(f => `<li>${f.category}: <strong>${f.feature}</strong></li>`).join('')}
        ${untestedHigh.length > 10 ? `<li><em>...and ${untestedHigh.length - 10} more</em></li>` : ''}
      </ul>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">
        Feature Coverage by Category
        <span class="priority-legend">
          <span class="legend-item"><span class="legend-dot" style="background: #22c55e"></span> Tested</span>
          <span class="legend-item"><span class="legend-dot" style="background: #ef4444"></span> Not Tested</span>
        </span>
      </div>

      ${Object.entries(FEATURE_COVERAGE).map(([categoryId, category]) => {
        const catStats = stats.byCategory[categoryId]
        return `
        <div class="category">
          <div class="category-header">
            <span class="category-name">${category.name}</span>
            <div class="category-stats">
              <span style="color: ${getStatusColor(catStats.percentage)}">${catStats.percentage}%</span>
              <span style="color: #64748b">(${catStats.tested}/${catStats.total})</span>
            </div>
          </div>
          <div class="feature-list">
            ${Object.entries(category.features).map(([featureId, feature]) => `
            <div class="feature">
              <div class="feature-name">
                <span class="feature-status" style="background: ${feature.tested ? '#22c55e' : '#ef4444'}"></span>
                <span>${featureId}</span>
              </div>
              <div class="feature-meta">
                <span class="priority-badge" style="background: ${getPriorityColor(feature.priority)}20; color: ${getPriorityColor(feature.priority)}">${feature.priority}</span>
                ${feature.spec ? `<a class="spec-link" href="#">${feature.spec}</a>` : '<span style="color: #64748b; font-size: 0.75rem">no spec</span>'}
              </div>
            </div>
            `).join('')}
          </div>
        </div>
        `
      }).join('')}
    </div>

    <p class="timestamp">Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`
}

// Main execution
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

const html = generateHTML()
writeFileSync(OUTPUT_FILE, html)

const stats = calculateCoverageStats()
console.log('\n📊 Test Coverage Report Generated\n')
console.log(`   Overall: ${stats.overall.percentage}% (${stats.overall.tested}/${stats.overall.total} features)`)
console.log(`   Critical: ${stats.byPriority.critical.percentage}% (${stats.byPriority.critical.tested}/${stats.byPriority.critical.total})`)
console.log(`   High: ${stats.byPriority.high.percentage}% (${stats.byPriority.high.tested}/${stats.byPriority.high.total})`)
console.log(`   Medium: ${stats.byPriority.medium.percentage}% (${stats.byPriority.medium.tested}/${stats.byPriority.medium.total})`)
console.log(`   Low: ${stats.byPriority.low.percentage}% (${stats.byPriority.low.tested}/${stats.byPriority.low.total})`)
console.log(`\n   Report: ${OUTPUT_FILE}\n`)
