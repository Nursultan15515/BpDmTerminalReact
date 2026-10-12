import { useEffect } from 'react';
import { PressBtn } from '../PressBtn';
import { ErrorGlyph, HomeIcon } from '../icons';
import { useI18n } from '../i18n';

const AUTO_RETURN_MS = 20000;

export function ErrorScreen({
  accent,
  title,
  desc,
  onHome,
  onRetry,
}: {
  accent: string;
  // По умолчанию — тексты сбоя поиска; экран выдачи карты передаёт свои.
  title?: string;
  desc?: string;
  onHome: () => void;
  // Без onRetry кнопки «Попробовать снова» нет (после сбоя выдачи карту заново не выдаём).
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  // Брошенный киоск сам возвращается на главную, чтобы не зависнуть на экране ошибки.
  useEffect(() => {
    const id = setTimeout(onHome, AUTO_RETURN_MS);
    return () => clearTimeout(id);
  }, [onHome]);
  return (
    <div
      className="screen"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 80px 80px',
      }}
    >
      <div style={{ animation: 'popIn .5s both' }}>
        <ErrorGlyph />
      </div>

      <h1
        style={{
          fontSize: 68,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: '-.02em',
          marginTop: 44,
          whiteSpace: 'nowrap',
          animation: 'popIn .5s .05s both',
        }}
      >
        {title ?? t.error.title}
      </h1>

      <p
        style={{
          fontSize: 30,
          lineHeight: 1.45,
          color: 'var(--ink-soft)',
          fontWeight: 500,
          maxWidth: 880,
          textAlign: 'center',
          marginTop: 20,
          textWrap: 'pretty',
          animation: 'popIn .5s .1s both',
        }}
      >
        {desc ?? t.error.desc}
      </p>

      <div style={{ display: 'flex', gap: 24, marginTop: 56, animation: 'popIn .5s .16s both' }}>
        {onRetry && (
          <PressBtn
            onClick={onRetry}
            style={{
              height: 100,
              padding: '0 48px',
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--ink-soft)',
              background: 'var(--surface)',
              border: '1.5px solid var(--line)',
              boxShadow: 'var(--shadow-press)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.common.retry}
          </PressBtn>
        )}
        <PressBtn
          onClick={onHome}
          style={{
            height: 100,
            padding: '0 56px',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            fontSize: 34,
            fontWeight: 800,
            color: '#fff',
            background: accent,
            boxShadow: '0 16px 34px -14px ' + accent,
            whiteSpace: 'nowrap',
          }}
        >
          <HomeIcon /> {t.common.home}
        </PressBtn>
      </div>
    </div>
  );
}
