import { Routes, Route } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { FundDetail } from './pages/FundDetail'
import { AuditTrail } from './pages/AuditTrail'
import { Platforms } from './pages/Platforms'
import { Settings } from './pages/Settings'
import { Layout } from './components/Layout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="fund/:id" element={<FundDetail />} />
        <Route path="fund/:id/edit" element={<FundDetail />} />
        <Route path="fund/:id/add" element={<FundDetail />} />
        <Route path="audit" element={<AuditTrail />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
