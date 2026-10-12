import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Сенсорный киоск: в боевой сборке курсор мыши скрыт, как в легаси (_Layout.cshtml). В dev — виден.
if (import.meta.env.PROD) document.documentElement.classList.add('hide-cursor')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
