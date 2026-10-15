import type { CSSProperties } from 'react';

// Страница диагностики (?diag): видит ли сервер приложения базу данных и SOAP-сервис — проверяется без терминала,
// в том числе с самого сервера через RDP. Есть и в боевой сборке; на терминале вход — с экрана настройки.

// ─── Оформление (как на ?idscan) ─────────────────────────────────────────────
const page: CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: '#f2f4f1', color: '#1e2a38', font: '15px/1.45 system-ui, sans-serif', padding: '20px 24px 40px' };
const muted: CSSProperties = { color: '#5a6675' };

export function DiagPage() {
  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Диагностика</h1>
        <a href={import.meta.env.BASE_URL}>← к киоску</a>
      </div>
      <p style={{ ...muted, marginTop: 4 }}>Связь сервера приложения с базой данных и SOAP-сервисом.</p>
    </div>
  );
}
