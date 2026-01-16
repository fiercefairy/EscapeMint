import { useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { INTRO_STEPS, TOTAL_STEPS } from '../../data/intro-content'
import { IntroStep } from './IntroStep'
import { StepNavigation } from './StepNavigation'
import { ProgressIndicator } from './ProgressIndicator'
import { Disclaimer } from './Disclaimer'

const INTRO_COMPLETED_KEY = 'escapemint-intro-completed'

export function IntroWizard() {
  const navigate = useNavigate()
  const { step } = useParams<{ step?: string }>()
  const location = useLocation()

  // Determine base path from current location
  const basePath = location.pathname.startsWith('/backtest/intro') ? '/backtest/intro' : '/intro'

  // Parse step from URL or default to 1
  const currentStep = step ? Math.min(Math.max(1, parseInt(step, 10) || 1), TOTAL_STEPS) : 1
  const currentStepData = INTRO_STEPS[currentStep - 1]

  const goToStep = useCallback((stepNum: number) => {
    if (stepNum >= 1 && stepNum <= TOTAL_STEPS) {
      navigate(`${basePath}/${stepNum}`)
    }
  }, [navigate, basePath])

  const handlePrev = useCallback(() => {
    if (currentStep > 1) {
      goToStep(currentStep - 1)
    }
  }, [currentStep, goToStep])

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1)
    }
  }, [currentStep, goToStep])

  const handleSkip = useCallback(() => {
    // Mark intro as completed and go to backtest
    localStorage.setItem(INTRO_COMPLETED_KEY, 'true')
    navigate('/backtest')
  }, [navigate])

  const handleComplete = useCallback(() => {
    // Mark intro as completed and go to backtest
    localStorage.setItem(INTRO_COMPLETED_KEY, 'true')
    navigate('/backtest')
  }, [navigate])

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">EscapeMint</h1>
              <p className="text-xs text-slate-500">Introduction Guide</p>
            </div>
            <div className="text-sm text-slate-400">
              Step {currentStep} of {TOTAL_STEPS}
            </div>
          </div>
        </div>
      </header>

      {/* Progress indicator */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/30">
        <div className="container mx-auto px-4">
          <ProgressIndicator
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            onStepClick={goToStep}
          />
        </div>
      </div>

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 sm:py-8 max-w-3xl">
          <IntroStep step={currentStepData} />
        </div>
      </main>

      {/* Fixed bottom navigation and disclaimer */}
      <footer className="flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 max-w-3xl">
          <StepNavigation
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            onPrev={handlePrev}
            onNext={handleNext}
            onSkip={handleSkip}
            onComplete={handleComplete}
          />
        </div>
        <Disclaimer variant="footer" />
      </footer>
    </div>
  )
}
