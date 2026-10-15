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
// На служебных страницах курсор нужен: на распознавании удостоверения рамку карты рисуют и мышью,
// диагностику открывают и на сервере через RDP.
const servicePage = params.has('idscan') || params.has('diag')
if (import.meta.env.PROD && !servicePage) document.documentElement.classList.add('hide-cursor')

const root = createRoot(document.getElementById('root')!)

// ?idscan — тестовая страница распознавания удостоверения. Есть и в боевой сборке (на терминале на ней выбирают
// камеру документа и рамку для экрана сканирования), грузится отдельным куском — киоску сама страница не нужна.
if (params.has('idscan')) {
  import('./idscan/IdScanPage').then(({ IdScanPage }) => root.render(<IdScanPage />))
} else if (params.has('diag')) {
  // ?diag — диагностика связи сервера с БД и SOAP-сервисом. Есть и в боевой сборке: открывается с экрана
  // настройки терминала или прямо на сервере. Отдельный кусок, как ?idscan.
  import('./diag/DiagPage').then(({ DiagPage }) => root.render(<DiagPage />))
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
