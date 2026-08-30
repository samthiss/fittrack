import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { registerServiceWorker } from './data/push.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)

// Registered on every boot, not only when the user enables reminders: iOS drops the service
// worker along with the Home Screen icon, so a reinstall has to pick it back up on its own.
registerServiceWorker()
