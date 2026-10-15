import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  choiceFor,
  findCamera,
  listCameras,
  loadDocumentCamera,
  loadPhotoCamera,
  saveDocumentCamera,
  savePhotoCamera,
  type CameraChoice,
} from '../kiosk/cameras';

// Страница «Камеры» (?cameras): наладчик выбирает, какая камера снимает лицо, а какая — документ. Выбор хранится
// в localStorage этого браузера (то есть на этом терминале); по нему открывают камеру экраны фото и сканирования.
// Есть и в боевой сборке; вход — экран настройки → «Камеры». Превью — одной камеры за раз: две USB-камеры
// одновременно тянут не все терминалы.

type Role = 'photo' | 'document';

const ROLES: { id: Role; title: string; button: string }[] = [
  { id: 'photo', title: 'Фото лица', button: 'Для фото лица' },
  { id: 'document', title: 'Документ', button: 'Для документа' },
];

const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// ─── Оформление (как на ?idscan; кнопки крупнее — страницу открывают и на сенсорном терминале) ───
const page: CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: '#f2f4f1', color: '#1e2a38', font: '16px/1.45 system-ui, sans-serif', padding: '20px 24px 40px' };
const panel: CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '14px 16px', marginTop: 14, maxWidth: 900 };
const heading: CSSProperties = { fontSize: 18, fontWeight: 700 };
const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 };
const muted: CSSProperties = { color: '#5a6675' };
const btn = (active = false): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 18px',
  borderRadius: 10,
  border: `1px solid ${active ? '#1b4d8f' : '#c2ccd8'}`,
  background: active ? '#1b4d8f' : '#fff',
  color: active ? '#fff' : 'inherit',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
});
const badge = (onDark: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 999,
  padding: '1px 9px',
  color: onDark ? '#fff' : '#1b4d8f',
  background: onDark ? 'rgba(255,255,255,.2)' : '#1b4d8f14',
});

export function CamerasPage() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[] | null>(null);
  const [accessError, setAccessError] = useState('');
  const [picked, setPicked] = useState('');
  const [choices, setChoices] = useState<Record<Role, CameraChoice | null>>(() => ({
    photo: loadPhotoCamera(),
    document: loadDocumentCamera(),
  }));
  const [preview, setPreview] = useState<{ id: string; size?: string; error?: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Названия камер браузер отдаёт только после разрешения на камеру — просим его один раз и сразу выключаем.
  // Подключили или отключили камеру — список обновляется сам.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const list = await listCameras();
      if (alive) setCameras(list);
    };
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setAccessError('браузер не даёт доступ к камерам на этой странице');
        setCameras([]);
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
      } catch (e) {
        if (alive) setAccessError(errorText(e));
      }
      await refresh();
    };
    start();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);

  const list = cameras ?? [];
  const nameOf = (d: MediaDeviceInfo) => d.label || `Камера ${list.indexOf(d) + 1}`;
  const assigned = (role: Role) => findCamera(list, choices[role]);
  // В превью — камера, которую выбрали в списке; сначала — камера для фото (или первая).
  const selected = list.find((d) => d.deviceId === picked) ?? assigned('photo') ?? list[0] ?? null;
  const selectedId = selected?.deviceId ?? '';
  const live = preview?.id === selectedId ? preview : null;

  // Поток превью выключается при смене камеры и при уходе со страницы.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { deviceId: { exact: selectedId } } })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const settings = s.getVideoTracks()[0]?.getSettings();
        setPreview({ id: selectedId, size: settings?.width ? `${settings.width}×${settings.height}` : undefined });
      })
      .catch((e) => {
        if (alive) setPreview({ id: selectedId, error: errorText(e) });
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [selectedId]);

  const assign = (role: Role, choice: CameraChoice | null) => {
    if (role === 'photo') savePhotoCamera(choice);
    else saveDocumentCamera(choice);
    setChoices((c) => ({ ...c, [role]: choice }));
  };

  const photoCam = assigned('photo');
  const sameCamera = list.length > 1 && !!photoCam && photoCam.deviceId === assigned('document')?.deviceId;

  return (
    <div style={page} data-cameras={cameras === null ? 'loading' : list.length}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Камеры</h1>
        <a href={import.meta.env.BASE_URL}>← к киоску</a>
      </div>
      <p style={{ ...muted, marginTop: 4 }}>
        Какая камера снимает лицо, а какая — документ. Выбор запоминается в этом браузере, то есть на этом терминале.
      </p>

      <section style={panel}>
        <h2 style={heading}>Назначено</h2>
        {ROLES.map((role) => {
          const choice = choices[role.id];
          const found = assigned(role.id);
          return (
            <div key={role.id} style={row} data-camera-role={role.id}>
              <b style={{ width: 110 }}>{role.title}</b>
              <span style={{ flex: '1 1 300px' }}>
                {!choice ? (
                  <span style={muted}>не выбрана — камера по умолчанию (браузер берёт первую в списке)</span>
                ) : found ? (
                  <>
                    {nameOf(found)} <span style={{ color: '#2e7d32' }}>— подключена</span>
                  </>
                ) : cameras === null ? (
                  choice.label
                ) : (
                  <span style={{ color: '#c62828' }}>
                    {choice.label || 'выбранная камера'} — не подключена, сейчас снимает камера по умолчанию
                  </span>
                )}
              </span>
              {choice && (
                <button type="button" style={btn()} onClick={() => assign(role.id, null)}>
                  Сбросить
                </button>
              )}
            </div>
          );
        })}
        {sameCamera && <p style={{ marginTop: 10, color: '#b7791f' }}>Для фото и для документа выбрана одна и та же камера.</p>}
      </section>

      <section style={panel}>
        <h2 style={heading}>Камеры{cameras ? `: ${list.length}` : ''}</h2>
        {accessError && <p style={{ marginTop: 8, color: '#c62828' }}>Нет доступа к камере: {accessError}</p>}
        {cameras === null && <p style={{ ...muted, marginTop: 8 }}>Ищу камеры…</p>}
        {cameras !== null && list.length === 0 && <p style={{ marginTop: 8, color: '#c62828' }}>Браузер не видит ни одной камеры.</p>}

        <div style={row}>
          {list.map((d) => {
            const active = d.deviceId === selectedId;
            return (
              <button key={d.deviceId} type="button" onClick={() => setPicked(d.deviceId)} style={btn(active)} data-camera={d.label}>
                {nameOf(d)}
                {ROLES.filter((r) => assigned(r.id)?.deviceId === d.deviceId).map((r) => (
                  <span key={r.id} style={badge(active)}>
                    {r.title.toLowerCase()}
                  </span>
                ))}
              </button>
            );
          })}
        </div>

        {/* Превью и кнопки рядом: на экране терминала 1024×768 всё видно без прокрутки. */}
        {selected && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 14 }}>
            <div style={{ position: 'relative', width: 400, maxWidth: '100%', aspectRatio: '4 / 3', background: '#1b2533', borderRadius: 10, overflow: 'hidden' }}>
              <video ref={videoRef} autoPlay muted playsInline style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
              {(!live || live.error) && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, color: '#fff', textAlign: 'center' }}>
                  {live?.error ? `Камера не включилась: ${live.error}` : 'Включаю камеру…'}
                </div>
              )}
            </div>
            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b data-camera-preview={!live ? 'opening' : live.error ? 'error' : 'live'}>
                {nameOf(selected)}
                {live?.size && <span style={{ ...muted, fontWeight: 400 }}> · {live.size}</span>}
              </b>
              {ROLES.map((r) => {
                const active = assigned(r.id)?.deviceId === selected.deviceId;
                return (
                  <button key={r.id} type="button" style={btn(active)} onClick={() => assign(r.id, choiceFor(list, selected))}>
                    {active ? `✓ ${r.button}` : r.button}
                  </button>
                );
              })}
              <p style={muted}>
                Рамку карты для камеры документа рисуют на странице{' '}
                <a href={`${import.meta.env.BASE_URL}?idscan`}>«Распознавание удостоверения»</a>.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
