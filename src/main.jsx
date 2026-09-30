import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* demo pre-boot first (?lang/?reset must land before i18n and the stores read storage) */
import './demo/boot'
/* i18n MUST load before App: the stores call i18n.t while rehydrating at import time */
import './i18n'
import App from './App.jsx'
import DemoBadge from './demo/DemoBadge.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary section="Root">
      <App />
    </ErrorBoundary>
    {import.meta.env.VITE_DEMO === '1' && <DemoBadge />}
  </StrictMode>,
)
