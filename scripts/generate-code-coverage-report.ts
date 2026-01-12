#!/usr/bin/env npx tsx
/**
 * Generate Combined Code Coverage Report
 *
 * This script combines coverage data from all packages and generates:
 * 1. A summary report showing coverage by package
 * 2. An HTML report combining all package coverage
 * 3. Identification of files with low/no coverage (potential dead code)
 *
 * Run with: npm run test:coverage
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'fs'
import { join } from 'path'

interface PackageCoverage {
  name: string
  lines: { total: number; covered: number; pct: number }
  statements: { total: number; covered: number; pct: number }
  functions: { total: number; covered: number; pct: number }
  branches: { total: number; covered: number; pct: number }
}

interface FileCoverage {
  package: string
  file: string
  lines: number
  statements: number
  functions: number
  branches: number
}

const PACKAGES = [
  { name: 'engine', path: 'packages/engine' },
  { name: 'storage', path: 'packages/storage' },
  { name: 'server', path: 'packages/server' },
  { name: 'web', path: 'packages/web' }
]

const OUTPUT_DIR = join(process.cwd(), 'packages/web/public/code-coverage')
const OUTPUT_FILE = join(OUTPUT_DIR, 'index.html')

function readPackageCoverage(packagePath: string): PackageCoverage | null {
  const summaryPath = join(packagePath, 'coverage', 'coverage-summary.json')

  if (!existsSync(summaryPath)) {
    return null
  }

  const data = JSON.parse(readFileSync(summaryPath, 'utf-8'))
  const total = data.total

  return {
    name: packagePath.split('/').pop() || packagePath,
    lines: total.lines,
    statements: total.statements,
    functions: total.functions,
    branches: total.branches
  }
}

function findLowCoverageFiles(packagePath: string, threshold = 50): FileCoverage[] {
  const summaryPath = join(packagePath, 'coverage', 'coverage-summary.json')

  if (!existsSync(summaryPath)) {
    return []
  }

  const data = JSON.parse(readFileSync(summaryPath, 'utf-8'))
  const lowCoverage: FileCoverage[] = []
  const packageName = packagePath.split('/').pop() || packagePath

  for (const [filePath, coverage] of Object.entries(data)) {
    if (filePath === 'total') continue

    const cov = coverage as any
    const avgCoverage = (
      cov.lines.pct +
      cov.statements.pct +
      cov.functions.pct +
      cov.branches.pct
    ) / 4

    if (avgCoverage < threshold) {
      lowCoverage.push({
        package: packageName,
        file: filePath.replace(/.*\/packages\/[^/]+\//, ''),
        lines: cov.lines.pct,
        statements: cov.statements.pct,
        functions: cov.functions.pct,
        branches: cov.branches.pct
      })
    }
  }

  return lowCoverage.sort((a, b) => {
    const avgA = (a.lines + a.statements + a.functions + a.branches) / 4
    const avgB = (b.lines + b.statements + b.functions + b.branches) / 4
    return avgA - avgB
  })
}

function getStatusColor(percentage: number): string {
  if (percentage >= 80) return '#22c55e' // green
  if (percentage >= 60) return '#eab308' // yellow
  if (percentage >= 40) return '#f97316' // orange
  return '#ef4444' // red
}

function generateHTML(packages: PackageCoverage[], lowCoverage: FileCoverage[]): string {
  const totalLines = packages.reduce((sum, pkg) => sum + pkg.lines.covered, 0)
  const totalLinesPossible = packages.reduce((sum, pkg) => sum + pkg.lines.total, 0)
  const totalStatements = packages.reduce((sum, pkg) => sum + pkg.statements.covered, 0)
  const totalStatementsPossible = packages.reduce((sum, pkg) => sum + pkg.statements.total, 0)
  const totalFunctions = packages.reduce((sum, pkg) => sum + pkg.functions.covered, 0)
  const totalFunctionsPossible = packages.reduce((sum, pkg) => sum + pkg.functions.total, 0)
  const totalBranches = packages.reduce((sum, pkg) => sum + pkg.branches.covered, 0)
  const totalBranchesPossible = packages.reduce((sum, pkg) => sum + pkg.branches.total, 0)

  const overallLineCoverage = totalLinesPossible > 0 ? (totalLines / totalLinesPossible * 100).toFixed(2) : '0.00'
  const overallStmtCoverage = totalStatementsPossible > 0 ? (totalStatements / totalStatementsPossible * 100).toFixed(2) : '0.00'
  const overallFuncCoverage = totalFunctionsPossible > 0 ? (totalFunctions / totalFunctionsPossible * 100).toFixed(2) : '0.00'
  const overallBranchCoverage = totalBranchesPossible > 0 ? (totalBranches / totalBranchesPossible * 100).toFixed(2) : '0.00'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EscapeMint Code Coverage Report</title>
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
      max-width: 1400px;
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
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
      margin-bottom: 1.5rem;
      color: #f8fafc;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      padding: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
      border-bottom: 2px solid #334155;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #334155;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .package-name {
      font-weight: 600;
      color: #f8fafc;
    }
    .coverage-cell {
      font-weight: 600;
      text-align: right;
    }
    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .alert-warning {
      background: rgba(234, 179, 8, 0.1);
      border: 1px solid rgba(234, 179, 8, 0.3);
    }
    .alert-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #eab308;
    }
    .file-list {
      font-size: 0.875rem;
      color: #94a3b8;
      max-height: 400px;
      overflow-y: auto;
    }
    .file-item {
      display: grid;
      grid-template-columns: 1fr 1fr 4fr;
      padding: 0.5rem 0;
      border-bottom: 1px solid #334155;
    }
    .file-item:last-child {
      border-bottom: none;
    }
    .file-package {
      color: #60a5fa;
      font-weight: 600;
    }
    .file-coverage {
      color: #64748b;
    }
    .timestamp {
      text-align: center;
      color: #64748b;
      font-size: 0.875rem;
      margin-top: 2rem;
    }
    .links {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .link {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      color: #60a5fa;
      text-decoration: none;
      font-size: 0.875rem;
      transition: all 0.2s;
    }
    .link:hover {
      background: #334155;
      border-color: #60a5fa;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>EscapeMint Code Coverage Report</h1>
    <p class="subtitle">Lines, statements, functions, and branches covered by unit tests</p>

    <div class="links">
      <a href="engine/index.html" class="link">📦 Engine Coverage</a>
      <a href="storage/index.html" class="link">📦 Storage Coverage</a>
      <a href="server/index.html" class="link">📦 Server Coverage</a>
      <a href="web/index.html" class="link">📦 Web Coverage</a>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Lines</div>
        <div class="stat-value" style="color: ${getStatusColor(parseFloat(overallLineCoverage))}">${overallLineCoverage}%</div>
        <div class="stat-detail">${totalLines} of ${totalLinesPossible} lines</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${overallLineCoverage}%; background: ${getStatusColor(parseFloat(overallLineCoverage))}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Statements</div>
        <div class="stat-value" style="color: ${getStatusColor(parseFloat(overallStmtCoverage))}">${overallStmtCoverage}%</div>
        <div class="stat-detail">${totalStatements} of ${totalStatementsPossible} statements</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${overallStmtCoverage}%; background: ${getStatusColor(parseFloat(overallStmtCoverage))}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Functions</div>
        <div class="stat-value" style="color: ${getStatusColor(parseFloat(overallFuncCoverage))}">${overallFuncCoverage}%</div>
        <div class="stat-detail">${totalFunctions} of ${totalFunctionsPossible} functions</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${overallFuncCoverage}%; background: ${getStatusColor(parseFloat(overallFuncCoverage))}"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Branches</div>
        <div class="stat-value" style="color: ${getStatusColor(parseFloat(overallBranchCoverage))}">${overallBranchCoverage}%</div>
        <div class="stat-detail">${totalBranches} of ${totalBranchesPossible} branches</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${overallBranchCoverage}%; background: ${getStatusColor(parseFloat(overallBranchCoverage))}"></div>
        </div>
      </div>
    </div>

    ${lowCoverage.length > 0 ? `
    <div class="alert alert-warning">
      <div class="alert-title">⚠ Files with Low Coverage (&lt;50%) - ${lowCoverage.length} files</div>
      <div class="file-list">
        ${lowCoverage.slice(0, 20).map(f => `
        <div class="file-item">
          <span class="file-package">${f.package}</span>
          <span class="file-coverage">${((f.lines + f.statements + f.functions + f.branches) / 4).toFixed(1)}%</span>
          <span>${f.file}</span>
        </div>
        `).join('')}
        ${lowCoverage.length > 20 ? `<div style="padding: 0.5rem 0; color: #64748b;"><em>...and ${lowCoverage.length - 20} more files</em></div>` : ''}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Coverage by Package</div>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th style="text-align: right">Lines</th>
            <th style="text-align: right">Statements</th>
            <th style="text-align: right">Functions</th>
            <th style="text-align: right">Branches</th>
          </tr>
        </thead>
        <tbody>
          ${packages.map(pkg => `
          <tr>
            <td class="package-name">${pkg.name}</td>
            <td class="coverage-cell" style="color: ${getStatusColor(pkg.lines.pct)}">
              ${pkg.lines.pct.toFixed(2)}%
              <span style="color: #64748b; font-weight: normal; font-size: 0.875rem">(${pkg.lines.covered}/${pkg.lines.total})</span>
            </td>
            <td class="coverage-cell" style="color: ${getStatusColor(pkg.statements.pct)}">
              ${pkg.statements.pct.toFixed(2)}%
              <span style="color: #64748b; font-weight: normal; font-size: 0.875rem">(${pkg.statements.covered}/${pkg.statements.total})</span>
            </td>
            <td class="coverage-cell" style="color: ${getStatusColor(pkg.functions.pct)}">
              ${pkg.functions.pct.toFixed(2)}%
              <span style="color: #64748b; font-weight: normal; font-size: 0.875rem">(${pkg.functions.covered}/${pkg.functions.total})</span>
            </td>
            <td class="coverage-cell" style="color: ${getStatusColor(pkg.branches.pct)}">
              ${pkg.branches.pct.toFixed(2)}%
              <span style="color: #64748b; font-weight: normal; font-size: 0.875rem">(${pkg.branches.covered}/${pkg.branches.total})</span>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <p class="timestamp">Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`
}

// Main execution
console.log('\n📊 Generating Code Coverage Report\n')

const coverageData: PackageCoverage[] = []
const allLowCoverage: FileCoverage[] = []

for (const pkg of PACKAGES) {
  const coverage = readPackageCoverage(pkg.path)
  if (coverage) {
    coverageData.push(coverage)
    console.log(`   ✓ ${pkg.name}: ${coverage.lines.pct.toFixed(2)}% lines, ${coverage.statements.pct.toFixed(2)}% statements`)

    const lowCov = findLowCoverageFiles(pkg.path)
    allLowCoverage.push(...lowCov)

    // Copy individual package coverage to public directory
    const pkgCoverageDir = join(pkg.path, 'coverage')
    const publicCoverageDir = join(OUTPUT_DIR, pkg.name)
    if (existsSync(pkgCoverageDir)) {
      mkdirSync(publicCoverageDir, { recursive: true })
      cpSync(pkgCoverageDir, publicCoverageDir, { recursive: true })
      console.log(`   📦 Copied ${pkg.name} coverage to public directory`)
    }
  } else {
    console.log(`   ✗ ${pkg.name}: No coverage data found`)
  }
}

if (coverageData.length === 0) {
  console.error('\n❌ No coverage data found. Run "npm run test:coverage:unit" first.\n')
  process.exit(1)
}

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

const html = generateHTML(coverageData, allLowCoverage)
writeFileSync(OUTPUT_FILE, html)

console.log(`\n   📄 Combined report: ${OUTPUT_FILE}`)
console.log(`   ⚠  Low coverage files: ${allLowCoverage.length}`)
console.log('')
