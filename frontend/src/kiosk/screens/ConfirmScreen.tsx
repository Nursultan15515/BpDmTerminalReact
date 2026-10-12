import { useEffect } from 'react';
import { GREEN, type VisitorCard } from '../constants';
import { PressBtn } from '../PressBtn';
import { Arrow, CheckIcon, PersonGlyph } from '../icons';
import { useI18n } from '../i18n';

const DASH = '—';
// Брошенный экран подтверждения сам возвращается на главную.
const AUTO_HOME_MS = 45000;

function orDash(value?: string | null): string {
  const v = value?.trim();
  return v ? v : DASH;
}

function cabinetText(card: VisitorCard): string {
  const floor = card.cabinetFloor?.trim();
  const cab = card.cabinetNumber?.trim();
  if (floor && cab) return `${floor} / ${cab}`;
  return cab || floor || DASH;
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink-faint)', letterSpacing: '.01em' }}>{label}</div>
      <div
        title={value}
        style={{
          fontSize: strong ? 32 : 27,
          fontWeight: strong ? 800 : 700,
          color: 'var(--ink)',
          letterSpacing: strong ? '.01em' : 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function ConfirmScreen({
  accent,
  card,
  onYes,
  onNo,
}: {
  accent: string;
  card: VisitorCard;
  onYes: () => void;
  onNo: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const id = setTimeout(onNo, AUTO_HOME_MS);
    return () => clearTimeout(id);
  }, [onNo]);

  return (
    <div className="screen" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '100px 80px 72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, animation: 'popIn .5s both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              background: GREEN,
              color: '#fff',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'ringPulse 2.2s ease-out 1',
            }}
          >
            <CheckIcon size={38} sw={2.8} />
          </div>
          <div>
            <h1 style={{ fontSize: 54, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1 }}>
              {t.confirm.title}
            </h1>
            <p style={{ fontSize: 23, fontWeight: 500, color: 'var(--ink-soft)', marginTop: 10 }}>
              {t.confirm.sub}
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 11,
            padding: '11px 22px',
            borderRadius: 999,
            background: GREEN + '16',
            color: GREEN,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: GREEN }} />
          {t.found.active}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 24 }}>
        <div
          style={{
            width: 1200,
            maxWidth: '100%',
            background: 'var(--surface)',
            borderRadius: 28,
            border: '1.5px solid var(--line)',
            boxShadow: 'var(--shadow)',
            padding: '46px 56px',
            display: 'flex',
            flexDirection: 'column',
            animation: 'popIn .55s .06s both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: 22,
                background: 'var(--accent-50)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <PersonGlyph size={84} color={accent + '66'} />
            </div>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                title={orDash(card.visitorFullname)}
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  color: 'var(--ink)',
                  letterSpacing: '-.01em',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {orDash(card.visitorFullname)}
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink-faint)' }}>{t.found.visitor}</div>
            </div>
          </div>

          <div style={{ height: 1.5, background: 'var(--line)', margin: '34px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 32, columnGap: 56 }}>
            <InfoRow label={t.found.invite} value={orDash(card.invitersFullname)} strong />
            <InfoRow label={t.found.invitePhone} value={orDash(card.invitersPhoneNumber)} />
            <InfoRow label={t.found.floor} value={orDash(card.cabinetFloor)} />
            <InfoRow label={t.found.cabinet} value={cabinetText(card)} />
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 24, marginTop: 28 }}>
        <PressBtn
          onClick={onNo}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 104,
            minWidth: 320,
            padding: '0 48px',
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1.5px solid var(--line)',
            boxShadow: 'var(--shadow-press)',
            color: 'var(--ink-soft)',
            fontSize: 32,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {t.confirm.no}
        </PressBtn>
        <PressBtn
          onClick={onYes}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            height: 104,
            minWidth: 320,
            padding: '0 28px 0 56px',
            borderRadius: 999,
            justifyContent: 'center',
            background: `linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.12)), ${accent}`,
            color: '#fff',
            fontSize: 34,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            boxShadow: `0 24px 48px -16px ${accent}, inset 0 2px 0 rgba(255,255,255,.24)`,
          }}
        >
          {t.confirm.yes}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.18)',
            }}
          >
            <Arrow size={30} />
          </span>
        </PressBtn>
      </div>
    </div>
  );
}
