import { useEffect, useState } from 'react';
import { GREEN } from '../constants';
import { PressBtn } from '../PressBtn';
import { CheckIcon, HomeIcon } from '../icons';
import { useI18n } from '../i18n';

// Легаси OfferTakeСard: 15 секунд, чтобы забрать карту, — отсчёт виден посетителю,
// последние секунды красным; по нулю киоск сам уходит на главную.
const TAKE_CARD_SECONDS = 15;
const WARN_SECONDS = 5;
const RED = '#E1574C';

export function SuccessScreen({
  accent,
  onHome,
}: {
  accent: string;
  onHome: () => void;
}) {
  const { t } = useI18n();
  const [left, setLeft] = useState(TAKE_CARD_SECONDS);

  useEffect(() => {
    if (left <= 0) {
      onHome();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onHome]);

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
      <div
        style={{
          width: 168,
          height: 168,
          borderRadius: '50%',
          background: GREEN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'ringPulse 2.2s ease-out 1, popIn .5s both',
        }}
      >
        <CheckIcon size={92} sw={2.6} />
      </div>

      <h1
        style={{
          fontSize: 68,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: '-.02em',
          marginTop: 44,
          textAlign: 'center',
          animation: 'popIn .5s .05s both',
        }}
      >
        {t.success.title}
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
        {t.success.desc}
      </p>

      <p
        style={{
          fontSize: 34,
          lineHeight: 1.4,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: left <= WARN_SECONDS ? RED : 'var(--ink)',
          transition: 'color .3s',
          maxWidth: 1100,
          textAlign: 'center',
          marginTop: 28,
          animation: 'popIn .5s .13s both',
        }}
      >
        {t.success.takeWithin(left)}
      </p>

      <div style={{ marginTop: 56, animation: 'popIn .5s .16s both' }}>
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