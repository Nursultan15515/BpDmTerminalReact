import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { ACCENT } from './constants';

const HOLD_MS = 3000;

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000 * 20);
    return () => clearInterval(id);
  }, []);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {hh}:{mm}
    </span>
  );
}

export function StatusBar({ show, onHold }: { show: boolean; onHold?: () => void }) {
  const { t } = useI18n();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  const start = () => {
    if (!onHold) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onHold();
    }, HOLD_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!show) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 0,
        right: 0,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0 56px',
        color: 'var(--ink-faint)',
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '.01em',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      {/* Удержание 3 с открывает настройку разрешения. Слушает только этот блок,
          чтобы не перехватывать тап по переключателю языков справа. */}
      <div
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          pointerEvents: onHold ? 'auto' : 'none',
          cursor: onHold ? 'pointer' : 'default',
          touchAction: 'none',
          userSelect: 'none',
          // Во время удержания плавно перекрашиваемся в акцент ровно за HOLD_MS,
          // так наладчик видит прогресс; отпустил раньше — быстрый возврат.
          color: holding ? ACCENT : 'var(--ink-faint)',
          transition: holding ? `color ${HOLD_MS}ms linear` : 'color .2s ease',
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: '#3FD17A',
            boxShadow: '0 0 0 4px rgba(63,209,122,.16)',
          }}
        />
        {t.status.ready}
        <span style={{ opacity: 0.6 }}>·</span>
        <Clock />
      </div>
    </div>
  );
}
