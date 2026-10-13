import { useState, type CSSProperties } from 'react';
import { GALLERY_SCREENS } from '../kiosk/devStart';
import { LANGS } from '../kiosk/i18n';

// Шпаргалка стенда (только dev, ?gallery): все экраны на всех языках и сценарии заглушек.
const RATIOS = ['', '16:9', '16:10', '4:3', '5:4'];

const SOAP_SCENARIOS: [string, string][] = [
  ['…0', 'пропуск не найден'],
  ['…1', 'без фото — сразу выдача карты'],
  ['…3', 'тип 3 — фото с красной рамкой'],
  ['…5', 'без фото, RFID «half success» — карта всё равно выдаётся, причина в TerminalError'],
  ['…7', 'без фото, сбой RFID — карта должна остаться в аппарате'],
  ['…8', 'сервис отказал в сохранении фото'],
  ['…9', 'SOAP недоступен'],
  ['другие', 'обычный посетитель с фото'],
];

const HARDWARE_URL = import.meta.env.VITE_HARDWARE_URL ?? 'http://localhost:8080';

const cell: CSSProperties = { padding: '8px 14px', borderTop: '1px solid #e3e8ef', textAlign: 'left' };
const card: CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '6px 4px', marginTop: 12 };

export function Gallery() {
  const [ratio, setRatio] = useState('');
  const link = (screen: string, lang: string) => `/?screen=${screen}&lang=${lang}${ratio ? `&ratio=${ratio}` : ''}`;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#f2f4f1', color: '#1e2a38', padding: '28px 36px', font: '15px/1.45 system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Стенд киоска — галерея экранов</h1>
      <p style={{ color: '#5a6675', marginTop: 4 }}>
        Экран открывается сразу, с тестовыми данными. Диспенсер — эмулятор:{' '}
        <a href={HARDWARE_URL} target="_blank" rel="noreferrer">{HARDWARE_URL}</a> (панель управления и журнал выдачи).
      </p>

      <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Соотношение:</b>
        {RATIOS.map((r) => (
          <button
            key={r || 'auto'}
            onClick={() => setRatio(r)}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #c2ccd8', background: r === ratio ? '#1b4d8f' : '#fff', color: r === ratio ? '#fff' : 'inherit', cursor: 'pointer' }}
          >
            {r || 'как сохранено'}
          </button>
        ))}
        <span style={{ color: '#94a0ae' }}>выбранное соотношение киоск запоминает (сброс — «Авто» в настройке экрана)</span>
      </div>

      <table style={{ ...card, borderCollapse: 'separate', width: 'auto' }}>
        <tbody>
          {Object.entries(GALLERY_SCREENS).map(([id, title]) => (
            <tr key={id}>
              <td style={cell}>{title}</td>
              {LANGS.map((l) => (
                <td key={l.id} style={cell}>
                  <a href={link(id, l.id)}>{l.label}</a>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 28 }}>Заглушка SOAP: исход по последней цифре номера документа</h2>
      <p style={{ color: '#5a6675', marginTop: 4 }}>
        Номер вводится на экране «Ручной ввод» или набирается на клавиатуре ПК на главном экране + Enter (как сканер).
        Отправленные в «SOAP» фото — в backend/TerminalApi/stub-photos, журналы — в LocalDB DbTerminalBpDm.
      </p>
      <table style={{ ...card, borderCollapse: 'separate', width: 'auto' }}>
        <tbody>
          {SOAP_SCENARIOS.map(([digit, text]) => (
            <tr key={digit}>
              <td style={{ ...cell, fontWeight: 700, whiteSpace: 'nowrap' }}>{digit}</td>
              <td style={cell}>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
