interface StepNavigationProps {
  currentStep: number
  totalSteps: number
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onComplete: () => void
}

export function StepNavigation({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSkip,
  onComplete
}: StepNavigationProps) {
  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === totalSteps

  return (
    <div className="flex items-center justify-between py-3 sm:py-4 gap-2">
      <div className="flex-shrink-0">
        {!isFirstStep && (
          <button
            onClick={onPrev}
            className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← <span className="hidden sm:inline">Previous</span><span className="sm:hidden">Back</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onSkip}
          className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          <span className="hidden sm:inline">Skip to Backtest</span>
          <span className="sm:hidden">Skip</span>
        </button>

        {isLastStep ? (
          <button
            onClick={onComplete}
            className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <span className="hidden sm:inline">Launch Backtest →</span>
            <span className="sm:hidden">Launch →</span>
          </button>
        ) : (
          <button
            onClick={onNext}
            className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  )
}
