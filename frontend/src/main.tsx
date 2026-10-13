import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Сенсорный киоск: в боевой сборке курсор мыши скрыт, как в легаси (_Layout.cshtml). В dev — виден.
if (import.meta.env.PROD) document.documentElement.classList.add('hide-cursor')

const root = createRoot(document.getElementById('root')!)

// Стенд (только dev): ?gallery — все экраны на всех языках и сценарии заглушек.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('gallery')) {
  import('./dev/Gallery').then(({ Gallery }) => root.render(<Gallery />))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
