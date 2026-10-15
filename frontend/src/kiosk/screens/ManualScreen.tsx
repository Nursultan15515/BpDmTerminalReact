import { useEffect, useState } from 'react';
import { PressBtn } from '../PressBtn';
import { Keyboard, type KbMode } from '../Keyboard';
import { Arrow, BackIcon, SearchIcon } from '../icons';
import { useI18n } from '../i18n';

// Брошенный ручной ввод сам уходит на главную — и не оставляет набранный номер на экране.
// Отсчёт начинается заново с каждого касания экрана.
const IDLE_MS = 60000;

export function ManualScreen({
  accent,
  onBack,
  onHome,
  onSearch,
}: {
  accent: string;
  /** Кнопка «Назад» — к выбору способа (или на главную, если сканировать нечем). */
  onBack: () => void;
  /** Брошенный ввод — сразу на главную. */
  onHome: () => void;
  onSearch: (value: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<KbMode>('num');
  const [touches, setTouches] = useState(0);
  const max = 12;

  useEffect(() => {
    const id = setTimeout(onHome, IDLE_MS);
    return () => clearTimeout(id);
  }, [touches, onHome]);

  const addChar = (c: string) => setValue((v) => (v.length >= max ? v : v + c));
  const back = () => setValue((v) => v.slice(0, -1));
  const clear = () => setValue('');
  const canSearch = value.trim().length >= 4;

  return (
    <div
      className="screen"
      onPointerDown={() => setTouches((n) => n + 1)}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '108px 80px 56px',
      }}
    >
      {/* Распорки забирают только свободную высоту: на 16:9 их почти нет (контент
          как есть), на высоких 4:3/5:4 делят запас 2:3 — группа чуть выше центра. */}
      <div style={{ flex: 2, minHeight: 0 }} />

      <div style={{ width: 1200, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 24, marginBottom: 22 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {t.manual.title}
          </div>
        </div>
      </div>

      <div style={{ width: 1200, maxWidth: '100%' }}>
        <label style={{ display: 'block', fontSize: 24, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 12 }}>
          {t.manual.label}
        </label>
        <div
          style={{
            height: 110,
            borderRadius: 22,
            background: 'var(--surface)',
            border: '2px solid ' + (value ? accent : 'var(--line)'),
            boxShadow: value ? '0 0 0 5px ' + accent + '14' : 'var(--shadow-press)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 32px',
            transition: 'border-color .15s, box-shadow .15s',
          }}
        >
          {value ? (
            <span
              style={{
                fontSize: 50,
                fontWeight: 700,
                letterSpacing: '.06em',
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value}
            </span>
          ) : (
            <span style={{ fontSize: 40, fontWeight: 600, color: 'var(--ink-faint)' }}>{t.manual.placeholder}</span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--ink-faint)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value.length}/{max}
          </span>
          <PressBtn
            onClick={back}
            style={{
              marginLeft: 20,
              width: 84,
              height: 76,
              flexShrink: 0,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              background: '#EFF2F6',
              border: '1.5px solid var(--line)',
              pointerEvents: value ? 'auto' : 'none',
              opacity: value ? 1 : 0.45,
              transition: 'opacity .15s',
            }}
          >
            <BackIcon />
          </PressBtn>
        </div>
      </div>

      <div style={{ width: 1200, maxWidth: '100%', marginTop: 30 }}>
        <Keyboard mode={mode} setMode={setMode} onChar={addChar} onClear={clear} />
      </div>

      <div style={{ width: 1200, maxWidth: '100%', marginTop: 26, position: 'relative' }}>
        {/* Вынесена влево от колонки и центрирована по вертикали с «Найти». */}
        <PressBtn
          onClick={onBack}
          style={{
            position: 'absolute',
            left: -280,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 64,
            padding: '0 26px 0 18px',
            borderRadius: 18,
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--ink-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          <Arrow dir="left" color="#5A6675" size={26} /> {t.manual.back}
        </PressBtn>
        <PressBtn
          onClick={() => canSearch && onSearch(value)}
          style={{
            height: 116,
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            fontSize: 40,
            fontWeight: 800,
            color: '#fff',
            background: canSearch ? accent : '#C2CCD8',
            boxShadow: canSearch ? '0 16px 34px -14px ' + accent : 'none',
            pointerEvents: canSearch ? 'auto' : 'none',
            transition: 'background .15s',
          }}
        >
          <SearchIcon /> {t.manual.search}
        </PressBtn>
      </div>

      <div style={{ flex: 3, minHeight: 0 }} />
    </div>
  );
}
