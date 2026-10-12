import { useState, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from './i18n';

export type KbMode = 'num' | 'abc';

const KB_NUM = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];
const KB_ABC = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

function Key({
  children,
  onTap,
  variant = 'default',
  wide,
  basis,
}: {
  children: ReactNode;
  onTap?: () => void;
  variant?: 'default' | 'func';
  wide?: number;
  basis?: string;
}) {
  const [down, setDown] = useState(false);
  const base: CSSProperties = {
    flex: basis ? `0 0 ${basis}` : wide ? `0 0 ${wide}px` : '1 1 0',
    minWidth: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    cursor: 'pointer',
    userSelect: 'none',
    borderRadius: 18,
    transition: 'transform .06s ease, box-shadow .12s ease, background .12s ease',
    transform: down ? 'translateY(2px)' : 'translateY(0)',
  };
  const variants: Record<'default' | 'func', CSSProperties> = {
    default: {
      background: '#FFFFFF',
      color: 'var(--ink)',
      fontSize: 44,
      border: '1.5px solid var(--line)',
      boxShadow: down ? 'var(--shadow-press)' : '0 2px 0 #E3E8EF, 0 6px 16px -8px rgba(20,33,51,.22)',
    },
    func: {
      background: '#EFF2F6',
      color: 'var(--ink-soft)',
      fontSize: 30,
      border: '1.5px solid var(--line)',
      boxShadow: down ? 'var(--shadow-press)' : '0 2px 0 #DCE2EA',
    },
  };
  return (
    <div
      style={{ ...base, ...variants[variant] }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => {
        setDown(false);
        onTap?.();
      }}
      onPointerLeave={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
    >
      {children}
    </div>
  );
}

export function Keyboard({
  onChar,
  onClear,
  mode,
  setMode,
}: {
  onChar: (c: string) => void;
  onClear: () => void;
  mode: KbMode;
  setMode: (m: KbMode) => void;
}) {
  const { t } = useI18n();
  const rowGap = 14;
  const rowH = mode === 'num' ? 108 : 92;
  // Ширина одной буквенной клавиши = как в первом ряду (10 клавиш, 9 промежутков).
  const keyBasis = `calc((100% - ${9 * rowGap}px) / 10)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap, width: '100%' }}>
      {mode === 'num' ? (
        <>
          {KB_NUM.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: rowGap, height: rowH }}>
              {row.map((k) => (
                <Key key={k} onTap={() => onChar(k)}>
                  {k}
                </Key>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: rowGap, height: rowH }}>
            <Key variant="func" onTap={() => setMode('abc')}>
              АБВ
            </Key>
            <Key onTap={() => onChar('0')}>0</Key>
            <Key variant="func" onTap={onClear}>
              C
            </Key>
          </div>
        </>
      ) : (
        <>
          {KB_ABC.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: rowGap, height: rowH, justifyContent: 'center' }}>
              {row.map((k) => (
                <Key key={k} basis={keyBasis} onTap={() => onChar(k)}>
                  {k}
                </Key>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: rowGap, height: rowH }}>
            <Key variant="func" wide={200} onTap={() => setMode('num')}>
              123
            </Key>
            <Key onTap={() => onChar(' ')}>
              <span style={{ fontSize: 26, color: 'var(--ink-faint)', fontWeight: 600 }}>{t.keyboard.space}</span>
            </Key>
            <Key variant="func" wide={200} onTap={onClear}>
              C
            </Key>
          </div>
        </>
      )}
    </div>
  );
}
