import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BacktestApp } from './BacktestApp'
import { IntroWizard } from './components/intro/IntroWizard'

const INTRO_COMPLETED_KEY = 'escapemint-intro-completed'

function App() {
  const introCompleted = localStorage.getItem(INTRO_COMPLETED_KEY) === 'true'

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={introCompleted ? <BacktestApp /> : <Navigate to="/intro" replace />}
        />
        <Route path="/intro" element={<IntroWizard />} />
        <Route path="/intro/:step" element={<IntroWizard />} />
        <Route path="/backtest" element={<BacktestApp />} />
        <Route path="/backtest/intro" element={<IntroWizard />} />
        <Route path="/backtest/intro/:step" element={<IntroWizard />} />
      </Routes>
    </HashRouter>
  )
}

export default App
