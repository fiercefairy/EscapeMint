import { useEffect, useCallback, type ReactNode } from 'react'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  /** Whether to allow closing by clicking the backdrop */
  closeOnBackdrop?: boolean
  /** Whether to allow closing by pressing Escape */
  closeOnEscape?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true
}: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && closeOnEscape) {
      onClose()
    }
  }, [onClose, closeOnEscape])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className={`bg-slate-800 rounded-lg w-full ${sizeClasses[size]} border border-slate-700 max-h-[90vh] flex flex-col`}>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-slate-700 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
