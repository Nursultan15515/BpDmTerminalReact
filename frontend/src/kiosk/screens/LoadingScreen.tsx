import { useI18n } from '../i18n';

export function LoadingScreen({ accent }: { accent: string }) {
  const { t } = useI18n();
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
        gap: 40,
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '8px solid var(--accent-50)',
          borderTopColor: accent,
          animation: 'spin 0.9s linear infinite',
        }}
      />
      <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--ink-soft)' }}>{t.loading.text}</div>
    </div>
  );
}
