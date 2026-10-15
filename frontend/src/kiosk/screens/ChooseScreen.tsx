import { useEffect, type ReactNode } from 'react';
import { sharedOcr } from '../../idscan/ocr';
import { PressBtn } from '../PressBtn';
import { Arrow, IdCardGlyph, KeyboardGlyph } from '../icons';
import { useI18n } from '../i18n';

// Брошенный выбор сам уходит на главную.
const IDLE_MS = 60000;

function Option({
  primary,
  accent,
  glyph,
  title,
  desc,
  onClick,
}: {
  primary?: boolean;
  accent: string;
  glyph: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <PressBtn
      onClick={onClick}
      style={{
        width: 620,
        height: 440,
        borderRadius: 36,
        padding: '0 52px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 22,
        background: primary ? `linear-gradient(180deg, rgba(255,255,255,.14), rgba(0,0,0,.1)), ${accent}` : 'var(--surface)',
        border: primary ? `2px solid ${accent}` : '1.5px solid var(--line)',
        boxShadow: primary ? `0 24px 48px -18px ${accent}` : 'var(--shadow)',
      }}
    >
      {glyph}
      <div style={{ fontSize: 40, fontWeight: 800, color: primary ? '#fff' : 'var(--ink)', letterSpacing: '-.01em', lineHeight: 1.15 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.45, color: primary ? 'rgba(255,255,255,.85)' : 'var(--ink-soft)', textWrap: 'pretty' }}>
        {desc}
      </div>
    </PressBtn>
  );
}

// После «Начать»: сканировать удостоверение или набрать номер вручную. Показывается, только если у терминала есть камера.
export function ChooseScreen({
  accent,
  onScan,
  onManual,
  onBack,
}: {
  accent: string;
  onScan: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();

  // Распознавание загружается несколько секунд — запускаем, пока посетитель выбирает.
  // Не загрузилось — ошибку покажет экран сканирования (он попробует снова).
  useEffect(() => {
    sharedOcr().catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(onBack, IDLE_MS);
    return () => clearTimeout(id);
  }, [onBack]);

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
        padding: '108px 80px 56px',
      }}
    >
      <h1 style={{ fontSize: 60, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em', textAlign: 'center', animation: 'popIn .5s both' }}>
        {t.choose.title}
      </h1>
      <p style={{ fontSize: 28, color: 'var(--ink-soft)', fontWeight: 500, marginTop: 16, textAlign: 'center', animation: 'popIn .5s .05s both' }}>
        {t.choose.sub}
      </p>

      <div style={{ display: 'flex', gap: 48, marginTop: 60, animation: 'popIn .5s .1s both' }}>
        <Option primary accent={accent} glyph={<IdCardGlyph size={176} />} title={t.choose.scan} desc={t.choose.scanDesc} onClick={onScan} />
        <Option accent={accent} glyph={<KeyboardGlyph size={176} color={accent} />} title={t.choose.manual} desc={t.choose.manualDesc} onClick={onManual} />
      </div>

      {/* Анимация — на обёртке: на самой кнопке её transform перебил бы «нажатие». */}
      <div style={{ marginTop: 52, animation: 'popIn .5s .16s both' }}>
        <PressBtn
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 72,
            padding: '0 30px 0 22px',
            borderRadius: 20,
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--ink-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          <Arrow dir="left" color="#5A6675" size={28} /> {t.manual.back}
        </PressBtn>
      </div>
    </div>
  );
}
