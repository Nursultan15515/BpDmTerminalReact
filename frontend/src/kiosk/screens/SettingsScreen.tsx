import { useEffect, type CSSProperties } from 'react';
import { PressBtn } from '../PressBtn';
import { CameraIcon, HomeIcon, PulseIcon } from '../icons';
import { applyRatioSetting, getRatioSetting, type RatioSetting } from '../constants';

const AUTO_RETURN_MS = 30000;

const OPTIONS: { id: RatioSetting; title: string; hint: string }[] = [
  { id: 'auto', title: 'Авто', hint: 'Определять по экрану' },
  { id: '4:3', title: '4:3', hint: '1024 × 768' },
  { id: '5:4', title: '5:4', hint: '1280 × 1024' },
  { id: '16:10', title: '16:10', hint: '1920 × 1200' },
  { id: '16:9', title: '16:9', hint: '1920 × 1080' },
];

// Служебный экран для наладчика (вход — удержание статус-бара 3 с). Не для посетителя.
export function SettingsScreen({ accent, onClose }: { accent: string; onClose: () => void }) {
  const current = getRatioSetting();

  // Брошенный экран настроек сам закрывается, чтобы киоск не завис в сервисном режиме.
  useEffect(() => {
    const id = setTimeout(onClose, AUTO_RETURN_MS);
    return () => clearTimeout(id);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 80px 80px',
        zIndex: 20,
      }}
    >
      <h1 style={{ fontSize: 60, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>
        Разрешение экрана
      </h1>
      <p style={{ fontSize: 28, color: 'var(--ink-soft)', fontWeight: 500, marginTop: 16 }}>
        Выберите соотношение под этот терминал
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 64, justifyContent: 'center', maxWidth: 1760 }}>
        {OPTIONS.map((o) => {
          const active = o.id === current;
          return (
            <PressBtn
              key={o.id}
              onClick={() => applyRatioSetting(o.id)}
              style={{
                width: 316,
                height: 230,
                borderRadius: 28,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                background: active ? accent : 'var(--surface)',
                border: active ? `2px solid ${accent}` : '1.5px solid var(--line)',
                boxShadow: active ? `0 18px 40px -16px ${accent}` : 'var(--shadow-press)',
              }}
            >
              <div style={{ fontSize: 64, fontWeight: 800, color: active ? '#fff' : 'var(--ink)' }}>
                {o.title}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: active ? 'rgba(255,255,255,.85)' : 'var(--ink-soft)' }}>
                {o.hint}
              </div>
            </PressBtn>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 72, justifyContent: 'center' }}>
        {/* Тестовая страница распознавания удостоверения: выбрать камеру документа и рамку карты. */}
        <PressBtn onClick={() => window.location.assign(`${import.meta.env.BASE_URL}?idscan`)} style={SECONDARY}>
          <CameraIcon color="#5A6675" /> Распознавание удостоверения
        </PressBtn>
        {/* Диагностика: видит ли сервер приложения базу данных и SOAP-сервис. */}
        <PressBtn onClick={() => window.location.assign(`${import.meta.env.BASE_URL}?diag`)} style={SECONDARY}>
          <PulseIcon color="#5A6675" /> Диагностика
        </PressBtn>
        <PressBtn onClick={onClose} style={SECONDARY}>
          <HomeIcon /> Закрыть
        </PressBtn>
      </div>
    </div>
  );
}

const SECONDARY: CSSProperties = {
  height: 96,
  padding: '0 56px',
  borderRadius: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  fontSize: 32,
  fontWeight: 800,
  color: 'var(--ink-soft)',
  background: 'var(--surface)',
  border: '1.5px solid var(--line)',
  boxShadow: 'var(--shadow-press)',
};
