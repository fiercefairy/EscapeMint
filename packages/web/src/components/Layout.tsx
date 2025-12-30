import { useState, useEffect, useMemo } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { fetchFunds, FUNDS_CHANGED_EVENT, type FundSummary } from '../api/funds'
import { fetchPlatforms, type Platform } from '../api/platforms'

const SIDEBAR_COLLAPSED_KEY = 'escapemint-sidebar-collapsed'
const EXPANDED_PLATFORMS_KEY = 'escapemint-expanded-platforms'
const API_BASE = '/api'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/audit', label: 'Audit Trail', icon: '📋' },
  { path: '/platforms', label: 'Platforms', icon: '🏦' },
  { path: '/settings', label: 'Settings', icon: '⚙️' }
]

interface GroupedFunds {
  platform: Platform
  funds: FundSummary[]
}

export function Layout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    return saved === 'true'
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [funds, setFunds] = useState<FundSummary[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [version, setVersion] = useState<string>('')
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(EXPANDED_PLATFORMS_KEY)
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem(EXPANDED_PLATFORMS_KEY, JSON.stringify([...expandedPlatforms]))
  }, [expandedPlatforms])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Load funds and platforms
  const loadFundsAndPlatforms = () => {
    fetchFunds().then(result => {
      if (result.data) setFunds(result.data)
    })
    fetchPlatforms().then(result => {
      if (result.data) setPlatforms(result.data)
    })
  }

  // Fetch funds, platforms, and version on mount
  useEffect(() => {
    loadFundsAndPlatforms()
    fetch(`${API_BASE}/version`)
      .then(res => res.json())
      .then(data => setVersion(data.version))
      .catch(() => {})
  }, [])

  // Listen for funds changed event
  useEffect(() => {
    const handleFundsChanged = () => loadFundsAndPlatforms()
    window.addEventListener(FUNDS_CHANGED_EVENT, handleFundsChanged)
    return () => window.removeEventListener(FUNDS_CHANGED_EVENT, handleFundsChanged)
  }, [])

  // Group funds by platform, separating active from closed
  const { activeFunds, closedFunds } = useMemo(() => {
    const platformMap = new Map<string, Platform>()
    for (const p of platforms) {
      platformMap.set(p.id, p)
    }

    const activeGroups = new Map<string, FundSummary[]>()
    const closedGroups = new Map<string, FundSummary[]>()

    for (const fund of funds) {
      const platformId = fund.platform.toLowerCase()
      // Use explicit status if set, otherwise fall back to fund_size_usd === 0 for backwards compatibility
      const isClosed = fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)
      const groups = isClosed ? closedGroups : activeGroups

      if (!groups.has(platformId)) {
        groups.set(platformId, [])
      }
      groups.get(platformId)!.push(fund)
    }

    // Sort funds within each group by ticker
    for (const fundList of [...activeGroups.values(), ...closedGroups.values()]) {
      fundList.sort((a, b) => a.ticker.localeCompare(b.ticker))
    }

    const toGroupedFunds = (groups: Map<string, FundSummary[]>): GroupedFunds[] =>
      Array.from(groups.entries())
        .map(([platformId, platformFunds]) => ({
          platform: platformMap.get(platformId) || { id: platformId, name: platformId.charAt(0).toUpperCase() + platformId.slice(1) },
          funds: platformFunds
        }))
        .sort((a, b) => a.platform.name.localeCompare(b.platform.name))

    return {
      activeFunds: toGroupedFunds(activeGroups),
      closedFunds: toGroupedFunds(closedGroups)
    }
  }, [funds, platforms])

  const togglePlatform = (platformId: string) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(platformId)) {
        next.delete(platformId)
      } else {
        next.add(platformId)
      }
      return next
    })
  }

  const isActiveFund = (fundId: string) => location.pathname === `/fund/${fundId}`
  const isPlatformActive = (platformId: string) => {
    return funds.some(f => f.platform.toLowerCase() === platformId && isActiveFund(f.id))
  }

  const renderFundNav = (showLabels: boolean, groups: GroupedFunds[], keyPrefix = '') => (
    <div className={`${showLabels ? 'mt-1' : 'mt-1'} space-y-1`}>
      {groups.map(({ platform, funds: platformFunds }) => {
        const expandKey = keyPrefix + platform.id
        const isExpanded = expandedPlatforms.has(expandKey)
        const hasActiveFund = isPlatformActive(platform.id)

        return (
          <div key={expandKey}>
            {/* Platform Header */}
            <button
              onClick={() => togglePlatform(expandKey)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded text-xs transition-colors ${
                hasActiveFund
                  ? 'text-mint-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={!showLabels ? platform.name : undefined}
            >
              <span className="flex-shrink-0 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
              {showLabels ? (
                <span className="truncate font-medium">{platform.name}</span>
              ) : (
                <span className="font-medium">{platform.name.charAt(0)}</span>
              )}
            </button>

            {/* Fund Links */}
            {isExpanded && (
              <div className={`${showLabels ? 'ml-4' : ''} space-y-0.5`}>
                {platformFunds.map(fund => (
                  <Link
                    key={fund.id}
                    to={`/fund/${fund.id}`}
                    className={`flex items-center gap-2 px-3 py-1 mx-1 rounded text-xs transition-colors ${
                      isActiveFund(fund.id)
                        ? 'bg-slate-700 text-mint-400'
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                    }`}
                    title={!showLabels ? fund.ticker.toUpperCase() : undefined}
                  >
                    {showLabels ? (
                      <span className="uppercase truncate">{fund.ticker}</span>
                    ) : (
                      <span className="uppercase text-[10px]">{fund.ticker.slice(0, 4)}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="h-screen bg-slate-900 flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden md:flex flex-col h-screen sticky top-0 bg-slate-800 border-r border-slate-700 transition-all duration-200 ${
          collapsed ? 'w-14' : 'w-48'
        }`}
      >
        {/* Logo */}
        <div className="h-11 flex-shrink-0 flex items-center px-3 border-b border-slate-700">
          <Link to="/" className="flex items-center gap-2 overflow-hidden">
            <span className="text-lg flex-shrink-0">💸</span>
            {!collapsed && <span className="text-sm font-bold text-mint-400 whitespace-nowrap">EscapeMint</span>}
          </Link>
        </div>

        {/* Nav Items */}
        <nav className="py-2 flex-shrink-0">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-2 mx-1 rounded text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-slate-700 text-mint-400'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-3 flex-shrink-0 border-t border-slate-700" />

        {/* Fund Navigation - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-slate-700">
          {!collapsed && (
            <div className="px-3 py-1 text-[10px] text-slate-600 uppercase tracking-wider">
              Sub-Funds
            </div>
          )}
          {renderFundNav(!collapsed, activeFunds)}

          {/* Closed Funds Section */}
          {closedFunds.length > 0 && (
            <>
              <div className="mx-3 my-2 border-t border-slate-700" />
              {!collapsed && (
                <div className="px-3 py-1 text-[10px] text-slate-600 uppercase tracking-wider">
                  Closed
                </div>
              )}
              {renderFundNav(!collapsed, closedFunds, 'closed:')}
            </>
          )}
        </div>

        {/* Version & Collapse Toggle - Fixed Footer */}
        <div className="flex-shrink-0 border-t border-slate-700">
          {/* Version */}
          {version && (
            <div className={`px-3 py-1 text-[10px] text-slate-600 ${collapsed ? 'text-center' : ''}`}>
              {collapsed ? `v${version}` : `EscapeMint v${version}`}
            </div>
          )}
          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 w-56 flex flex-col bg-slate-800 border-r border-slate-700 z-50 transform transition-transform md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-11 flex-shrink-0 flex items-center justify-between px-3 border-b border-slate-700">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg">💸</span>
            <span className="text-sm font-bold text-mint-400">EscapeMint</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="text-slate-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        {/* Nav Items */}
        <nav className="py-2 flex-shrink-0">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-2 mx-1 rounded text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-slate-700 text-mint-400'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-3 flex-shrink-0 border-t border-slate-700" />

        {/* Fund Navigation - Mobile */}
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          <div className="px-3 py-1 text-[10px] text-slate-600 uppercase tracking-wider">
            Sub-Funds
          </div>
          {renderFundNav(true, activeFunds)}

          {/* Closed Funds Section - Mobile */}
          {closedFunds.length > 0 && (
            <>
              <div className="mx-3 my-2 border-t border-slate-700" />
              <div className="px-3 py-1 text-[10px] text-slate-600 uppercase tracking-wider">
                Closed
              </div>
              {renderFundNav(true, closedFunds, 'closed:')}
            </>
          )}
        </div>

        {/* Version - Mobile */}
        {version && (
          <div className="flex-shrink-0 px-3 py-2 border-t border-slate-700 text-[10px] text-slate-600">
            EscapeMint v{version}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile Header */}
        <header className="md:hidden h-11 flex-shrink-0 bg-slate-800 border-b border-slate-700 flex items-center px-3 gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-slate-400 hover:text-white p-1"
          >
            ☰
          </button>
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg">💸</span>
            <span className="text-sm font-bold text-mint-400">EscapeMint</span>
          </Link>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 p-2 md:p-3 lg:p-4 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
