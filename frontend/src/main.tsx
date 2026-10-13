import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter — из сборки, а не с Google Fonts: у терминалов нет интернета. Отдельные начертания, а не
// вариативный шрифт — надёжнее для Chrome 103 на Windows 7. Кириллица с казахскими буквами включена.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
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
