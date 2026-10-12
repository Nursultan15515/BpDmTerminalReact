import { PressBtn } from './PressBtn';
import { Arrow } from './icons';

type Action = { label: string; onClick: () => void };

export function ActionBar({ accent, left, right }: { accent: string; left: Action; right: Action }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 168,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 80px',
        pointerEvents: 'none',
      }}
    >
      <PressBtn
        onClick={left.onClick}
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: 92,
          padding: '0 42px 0 20px',
          borderRadius: 999,
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: '0 12px 28px -18px rgba(20,33,51,.5)',
          fontSize: 30,
          fontWeight: 700,
          color: 'var(--ink-soft)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#EFF2F6',
          }}
        >
          <Arrow dir="left" color="#5A6675" size={28} />
        </span>
        {left.label}
      </PressBtn>
      <PressBtn
        onClick={right.onClick}
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          height: 92,
          padding: '0 20px 0 48px',
          borderRadius: 999,
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          color: '#fff',
          fontSize: 31,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: `0 18px 42px -14px ${accent}`,
        }}
      >
        {right.label}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.18)',
          }}
        >
          <Arrow size={28} />
        </span>
      </PressBtn>
    </div>
  );
}
