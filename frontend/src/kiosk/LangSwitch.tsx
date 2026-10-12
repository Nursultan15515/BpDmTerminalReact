import { PressBtn } from './PressBtn';
import { LANGS, type Lang } from './i18n';

// Сегментированный контрол: все три языка видны сразу (без выпадающего списка).
// Активный фон — единый «бегунок», плавно переезжающий под выбранный сегмент.
export function LangSwitch({
  accent,
  value,
  onChange,
}: {
  accent: string;
  value: Lang;
  onChange: (lang: Lang) => void;
}) {
  const idx = Math.max(0, LANGS.findIndex((l) => l.id === value));

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 999,
        padding: 4,
        boxShadow: '0 8px 20px -12px rgba(27,43,62,.34)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc((100% - 8px) / ${LANGS.length})`,
          borderRadius: 999,
          background: `linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.12)), ${accent}`,
          boxShadow: `0 10px 20px -8px ${accent}, inset 0 1px 0 rgba(255,255,255,.24)`,
          transform: `translateX(${idx * 100}%)`,
          transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)',
        }}
      />
      {LANGS.map((l) => {
        const active = l.id === value;
        return (
          <PressBtn
            key={l.id}
            onClick={() => onChange(l.id)}
            pressScale={0.9}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: '1 0 0',
              textAlign: 'center',
              padding: '11px 22px',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '.03em',
              color: active ? '#fff' : 'var(--ink-soft)',
              transition: 'color .25s ease',
            }}
          >
            {l.label}
          </PressBtn>
        );
      })}
    </div>
  );
}
