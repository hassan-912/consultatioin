import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import { captureReferral } from './data/referral'
import { SiteAnalytics } from './analytics/SiteAnalytics'

// Sales referral link (?ref=CODE): remember it before the router reads the address.
captureReferral()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
      <SiteAnalytics />
    </HashRouter>
  </StrictMode>,
)
