interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
  onStepClick?: (step: number) => void
}

export function ProgressIndicator({ currentStep, totalSteps, onStepClick }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep

        return (
          <button
            key={stepNum}
            onClick={() => onStepClick?.(stepNum)}
            className={`
              w-2.5 h-2.5 rounded-full transition-all duration-300
              ${isActive
                ? 'bg-blue-500 w-6'
                : isCompleted
                  ? 'bg-blue-400/60 hover:bg-blue-400'
                  : 'bg-slate-600 hover:bg-slate-500'
              }
            `}
            aria-label={`Go to step ${stepNum}`}
            aria-current={isActive ? 'step' : undefined}
          />
        )
      })}
    </div>
  )
}
