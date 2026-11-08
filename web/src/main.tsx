// Entry point: fonts, the design system, then the app.
import '@fontsource-variable/inter'
import '@fontsource/fredoka/latin-600.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
