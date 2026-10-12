import { useEffect, useRef, useState } from 'react';
import { ACCENT, resolveCanvas, type ResultType, type Screen, type VisitorCard } from './constants';
import { errorText, getCardStatus, reportCardStatus, reportError, searchVisitor } from './api';
import { StatusBar } from './StatusBar';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ManualScreen } from './screens/ManualScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ConfirmScreen } from './screens/ConfirmScreen';
import { FoundScreen } from './screens/FoundScreen';
import { GiveCardScreen } from './screens/GiveCardScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { NoCardsScreen } from './screens/NoCardsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// Откуда пришёл поиск — для кнопки «Повторить» на экранах результата/ошибки.
type Source = 'scan' | 'manual';

export function KioskApp() {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Соотношение холста фиксируем один раз на монтировании (экран киоска не меняется).
  const canvasSize = useRef(resolveCanvas());
  const [screen, setScreen] = useState<Screen>('welcome');
  const [query, setQuery] = useState('');
  const [resultType, setResultType] = useState<ResultType>('loading');
  const [card, setCard] = useState<VisitorCard | null>(null);
  const [source, setSource] = useState<Source>('scan');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Каждые 10 возвратов на главный экран перезагружаем страницу целиком — сбрасываем
  // накопленные за сутки утечки (в т.ч. от камеры), чтобы киоск не деградировал до зависания.
  const homeVisits = useRef(0);
  const RELOAD_EVERY = 10;

  const goHome = () => {
    homeVisits.current += 1;
    if (homeVisits.current >= RELOAD_EVERY) {
      window.location.reload();
      return;
    }
    setCard(null);
    setScreen('welcome');
  };

  // «Начать» (ручной поиск): как в старом терминале сначала проверяем, есть ли карты
  // в диспенсере. Нет карт — сразу сообщаем, не пуская посетителя в бесполезный путь.
  // Статус уходит и на бэкенд: он сам решает, сообщать ли в SOAP, что карты заканчиваются.
  const handleStart = () => {
    setResultType('loading');
    setScreen('result');
    getCardStatus()
      .then((s) => {
        reportCardStatus(s.status);
        setScreen(s.status === 0 ? 'nocards' : 'manual');
      })
      .catch((e) => {
        reportError(`card-status: ${errorText(e)}`, 'Start');
        setResultType('error');
      });
  };

  const runSearch = (input: string, from: Source) => {
    const value = input.trim();
    setSource(from);
    setQuery(value);
    setResultType('loading');
    setScreen('result');
    searchVisitor(value)
      .then((r) => {
        if (r.kind === 'found') {
          setCard(r.card);
          // Найдено — экран подтверждения данных (как Search.cshtml в старом терминале).
          setScreen('confirm');
        } else {
          setResultType('notfound');
        }
      })
      .catch(() => setResultType('error'));
  };

  // Масштабируем фиксированный холст (соотношение из resolveCanvas) под вьюпорт (letterbox).
  useEffect(() => {
    const fit = () => {
      const el = canvasRef.current;
      if (!el) return;
      const { width, height } = canvasSize.current;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      const s = Math.min(window.innerWidth / width, window.innerHeight / height);
      el.style.transform = `scale(${s})`;
    };
    window.addEventListener('resize', fit);
    fit();
    return () => window.removeEventListener('resize', fit);
  }, []);

  const retryScreen = () => setScreen(source === 'manual' ? 'manual' : 'welcome');

  return (
    <div id="stage">
      <div id="canvas" ref={canvasRef}>
        <StatusBar show onHold={() => setSettingsOpen(true)} />

        {screen === 'welcome' && (
          <WelcomeScreen
            accent={ACCENT}
            onStart={handleStart}
            onScan={(v) => runSearch(v, 'scan')}
          />
        )}
        {screen === 'manual' && (
          <ManualScreen
            accent={ACCENT}
            onBack={() => setScreen('welcome')}
            onSearch={(v) => runSearch(v, 'manual')}
          />
        )}
        {screen === 'result' && resultType === 'loading' && <LoadingScreen accent={ACCENT} />}
        {screen === 'result' && resultType === 'notfound' && (
          <ResultScreen accent={ACCENT} value={query} onHome={goHome} onRetry={retryScreen} />
        )}
        {screen === 'result' && resultType === 'error' && (
          <ErrorScreen accent={ACCENT} onHome={goHome} onRetry={retryScreen} />
        )}
        {screen === 'confirm' && card && (
          <ConfirmScreen
            accent={ACCENT}
            card={card}
            onYes={() => setScreen(card.needPhoto ? 'photo' : 'giveCard')}
            onNo={goHome}
          />
        )}
        {screen === 'nocards' && <NoCardsScreen accent={ACCENT} onHome={goHome} />}
        {screen === 'photo' && card && (
          <FoundScreen
            accent={ACCENT}
            card={card}
            onHome={goHome}
            onComplete={() => setScreen('giveCard')}
          />
        )}
        {screen === 'giveCard' && card && (
          <GiveCardScreen accent={ACCENT} card={card} onDone={() => setScreen('success')} onHome={goHome} />
        )}
        {screen === 'success' && <SuccessScreen accent={ACCENT} onHome={goHome} />}

        {settingsOpen && <SettingsScreen accent={ACCENT} onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
