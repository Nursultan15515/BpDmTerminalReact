import { KioskApp } from './kiosk/KioskApp'
import { I18nProvider } from './kiosk/i18n'
import { readDevLang } from './kiosk/devStart'

function App() {
  return (
    <I18nProvider initialLang={readDevLang()}>
      <KioskApp />
    </I18nProvider>
  )
}

export default App
