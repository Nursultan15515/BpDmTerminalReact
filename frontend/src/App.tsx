import { KioskApp } from './kiosk/KioskApp'
import { I18nProvider } from './kiosk/i18n'

function App() {
  return (
    <I18nProvider>
      <KioskApp />
    </I18nProvider>
  )
}

export default App
