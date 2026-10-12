import { useEffect } from 'react';
import { PressBtn } from '../PressBtn';
import { HomeIcon, NotFoundGlyph } from '../icons';
import { useI18n } from '../i18n';

const AUTO_RETURN_MS = 20000;

export function ResultScreen({
  accent,
  value,
  onHome,
  onRetry,
}: {
  accent: string;
  value: string;
  onHome: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  // Брошенный киоск сам возвращается на главную, чтобы не зависнуть на экране результата.
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
        <NotFoundGlyph />
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
        {t.result.title}
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
        {t.result.descPre} <b style={{ color: 'var(--ink)', fontWeight: 700 }}>«{value}»</b>{t.result.descPost}
      </p>

      <div style={{ display: 'flex', gap: 24, marginTop: 56, animation: 'popIn .5s .16s both' }}>
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
