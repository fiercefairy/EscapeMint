import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SettingsProvider } from './contexts/SettingsContext'
import App from './App'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <App />
        <Toaster position="top-right" richColors />
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
)
