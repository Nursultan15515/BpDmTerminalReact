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

const params = new URLSearchParams(window.location.search)

// Сенсорный киоск: в боевой сборке курсор мыши скрыт, как в легаси (_Layout.cshtml). В dev — виден.
// На странице распознавания удостоверения курсор нужен: рамку карты рисуют и мышью.
if (import.meta.env.PROD && !params.has('idscan')) document.documentElement.classList.add('hide-cursor')

const root = createRoot(document.getElementById('root')!)

// ?idscan — тестовая страница распознавания удостоверения. Есть и в боевой сборке (на терминале на ней выбирают
// камеру документа и рамку для экрана сканирования), грузится отдельным куском — киоску сама страница не нужна.
if (params.has('idscan')) {
  import('./idscan/IdScanPage').then(({ IdScanPage }) => root.render(<IdScanPage />))
} else if (import.meta.env.DEV && params.has('gallery')) {
  // Стенд (только dev): ?gallery — все экраны на всех языках и сценарии заглушек.
  import('./dev/Gallery').then(({ Gallery }) => root.render(<Gallery />))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
