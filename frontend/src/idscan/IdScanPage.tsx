import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { CONFIRM_STREAK, nextStreak, type Streak } from './iin';
import { defaultCardRect, FULL_FRAME, ZONES, zoneOnFrame, type Rect, type Rotation } from './layout';
import { createOcr, wasmSimdSupported, type Ocr } from './ocr';
import { scanFrame, type Binarization, type ScanMode, type ScanOptions, type ScanResult } from './scan';
import { cameraConstraints, loadSaved, LOOP_PAUSE_MS, RESOLUTIONS, save } from './setup';
import { makeTestCard, type CardSide, type TestCard } from './testCard';
import { sameDob } from './verdict';
import { choiceFor, resolveDocumentCamera, saveDocumentCamera } from '../kiosk/cameras';

// Тестовая страница распознавания удостоверения (?idscan): читает ИИН с лицевой стороны (с датой рождения
// для сверки) или из MRZ на обороте — с камеры, из файла или с синтетической тестовой карты — и показывает,
// что вырезано, что прочитано и сколько это заняло. Есть и в боевой сборке: на терминале здесь выбирают камеру документа и рисуют рамку
// карты (запоминается в этом браузере, см. setup.ts) — с ними же сканирует экран киоска. Кадры никуда не отправляются и не сохраняются.

type Source = 'camera' | 'file' | 'test';

interface Picture {
  url: string;
  width: number;
  height: number;
  name: string;
}

interface HistoryRow {
  id: number;
  time: string;
  iin: string | null;
  ms: number;
}

const CAMERA_SUPPORTED = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const STATUS_RU: Record<string, string> = {
  'loading tesseract core': 'ядро',
  'initializing tesseract': 'запуск',
  'loading language traineddata': 'модель',
  'initializing api': 'настройка',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('картинка не открылась'));
    img.src = url;
  });
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

// ─── Оформление ──────────────────────────────────────────────────────────────
const page: CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: '#f2f4f1', color: '#1e2a38', font: '15px/1.45 system-ui, sans-serif', padding: '20px 24px 40px' };
const panel: CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '14px 16px', marginBottom: 14 };
const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 };
const muted: CSSProperties = { color: '#5a6675' };
const btn = (active = false, disabled = false): CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #c2ccd8',
  background: active ? '#1b4d8f' : '#fff',
  color: active ? '#fff' : 'inherit',
  font: 'inherit',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" style={btn(v === value)} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

function Box({ rect, color, label }: { rect: Rect; color: string; label: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        border: `2px solid ${color}`,
        pointerEvents: 'none',
      }}
    >
      <span style={{ position: 'absolute', left: -2, top: -20, background: color, color: '#000', font: '600 11px/18px system-ui, sans-serif', padding: '0 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

/** Кадр с рамкой карты и зонами; рамку рисуют мышью или пальцем прямо по изображению. */
function Viewer({
  children,
  active,
  card,
  cardLabel,
  rotation,
  onCard,
}: {
  children: ReactNode;
  active: boolean;
  card: Rect;
  cardLabel: string;
  rotation: Rotation;
  onCard: (r: Rect) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) };
  };
  const span = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });
  return (
    <div
      style={{ position: 'relative', background: '#1b2533', borderRadius: 10, overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: active ? 'crosshair' : 'default', minHeight: 120 }}
      onPointerDown={(e) => {
        if (!active) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = at(e);
      }}
      onPointerMove={(e) => {
        if (start.current) setDraft(span(start.current, at(e)));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        setDraft(null);
        if (!s) return;
        const r = span(s, at(e));
        if (r.w > 0.03 && r.h > 0.03) onCard(r);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      {children}
      {active && (
        <>
          <Box rect={draft ?? card} color="#00b8d4" label={draft ? 'новая рамка' : cardLabel} />
          {!draft && <Box rect={zoneOnFrame(card, ZONES.mrz, rotation)} color="#b388ff" label="MRZ (оборот)" />}
          {!draft && <Box rect={zoneOnFrame(card, ZONES.iin, rotation)} color="#ffab00" label="ИИН" />}
          {!draft && <Box rect={zoneOnFrame(card, ZONES.dob, rotation)} color="#64dd17" label="дата" />}
        </>
      )}
    </div>
  );
}

// ─── Страница ────────────────────────────────────────────────────────────────
export function IdScanPage() {
  const [saved] = useState(loadSaved);
  const [env] = useState(() => ({
    simd: wasmSimdSupported(),
    cores: navigator.hardwareConcurrency,
    chrome: /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? '?',
  }));

  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [ocrState, setOcrState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ocrStatus, setOcrStatus] = useState('Загрузка распознавания…');

  const [source, setSource] = useState<Source>('camera');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // null — ещё ищем запомненную камеру документа: id у неё мог смениться, тогда она находится по названию
  // (kiosk/cameras.ts) — и рамка переезжает на новый id.
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [resolution, setResolution] = useState(saved.resolution ?? RESOLUTIONS[0]);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [cameraError, setCameraError] = useState('');
  // Какая камера реально включилась (при «камере по умолчанию» deviceId пустой).
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const [cameraCards, setCameraCards] = useState<Record<string, Rect>>(saved.cameraCards ?? {});

  const [picture, setPicture] = useState<Picture | null>(null);
  const [pictureCard, setPictureCard] = useState<Rect>(FULL_FRAME);
  const [testCard, setTestCard] = useState<TestCard | null>(null);
  const [testScale, setTestScale] = useState(1);
  const [testUpsideDown, setTestUpsideDown] = useState(false);
  const [testSide, setTestSide] = useState<CardSide>('front');

  const [rotation, setRotation] = useState<Rotation>(saved.rotation ?? 0);
  const [mode, setMode] = useState<ScanMode>(saved.mode ?? 'auto');
  const [binarization, setBinarization] = useState<Binarization>(saved.binarization ?? 'none');
  const [readDob, setReadDob] = useState(saved.readDob ?? true);
  const [autoCard, setAutoCard] = useState(saved.autoCard ?? true);
  const [autoLayout, setAutoLayout] = useState(saved.autoLayout ?? true);

  const [running, setRunning] = useState(false);
  const [stopOnConfirm, setStopOnConfirm] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [streak, setStreak] = useState<Streak>({ iin: null, count: 0 });
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streakRef = useRef<Streak>({ iin: null, count: 0 });
  const rowId = useRef(0);
  const job = useRef(0);
  const objectUrl = useRef<string | null>(null);

  // Воркер распознавания — один на страницу: старт занимает секунды (ядро ~4 МБ и модель ~3 МБ).
  useEffect(() => {
    let alive = true;
    let instance: Ocr | null = null;
    const t0 = performance.now();
    createOcr((status, progress) => {
      if (alive) setOcrStatus(`Загрузка распознавания: ${STATUS_RU[status] ?? status} ${Math.round(progress * 100)} %`);
    })
      .then((o) => {
        if (!alive) {
          void o.terminate();
          return;
        }
        instance = o;
        setOcr(o);
        setOcrState('ready');
        setOcrStatus(`Распознавание готово за ${Math.round(performance.now() - t0)} мс`);
      })
      .catch((e) => {
        if (!alive) return;
        setOcrState('error');
        setOcrStatus(`Распознавание не загрузилось: ${errorText(e)}`);
      });
    return () => {
      alive = false;
      void instance?.terminate();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    resolveDocumentCamera().then((id) => {
      if (!alive) return;
      setCameraCards(loadSaved().cameraCards ?? {});
      setDeviceId(id);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Камера: включена, только пока выбран источник «Камера».
  useEffect(() => {
    if (source !== 'camera' || !CAMERA_SUPPORTED || deviceId === null) return;
    const video = videoRef.current;
    let alive = true;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia(cameraConstraints(deviceId, resolution))
      .then(async (s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video) video.srcObject = s;
        setActiveDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? '');
        setCameraError('');
        // Названия камер браузер отдаёт только после разрешения на камеру.
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        if (alive) setDevices(list);
      })
      .catch((e) => {
        if (!alive) return;
        // Запомненной камеры нет (другой компьютер, камеру переподключили) — берём камеру по умолчанию.
        if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) setDeviceId('');
        else setCameraError(errorText(e));
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [source, deviceId, resolution]);

  const cameraKey = deviceId || activeDeviceId;
  const cameraCard = cameraCards[cameraKey] ?? null;
  const cameraIndex = devices.findIndex((d) => d.deviceId === cameraKey);
  const frame = source === 'camera' ? videoSize : picture && { width: picture.width, height: picture.height };
  const card: Rect =
    source === 'camera' ? (cameraCard ?? (videoSize ? defaultCardRect(videoSize.width, videoSize.height, rotation) : FULL_FRAME)) : pictureCard;
  const { x: cx, y: cy, w: cw, h: ch } = card;
  const scanOptions = useMemo<ScanOptions>(
    () => ({ card: { x: cx, y: cy, w: cw, h: ch }, autoCard, rotation, autoLayout, mode, binarization, readDob }),
    [cx, cy, cw, ch, autoCard, rotation, autoLayout, mode, binarization, readDob],
  );

  const record = useCallback((r: ScanResult, live: boolean): Streak => {
    const found = r.iin?.iin ?? null;
    const next = nextStreak(live ? streakRef.current : { iin: null, count: 0 }, found);
    streakRef.current = next;
    rowId.current += 1;
    const entry = { id: rowId.current, time: new Date().toLocaleTimeString('ru-RU'), iin: found, ms: r.ms };
    setResult(r);
    setStreak(next);
    setHistory((h) => [entry, ...h].slice(0, 12));
    return next;
  }, []);

  // Живой режим: кадр за кадром, пока не нажали «Стоп» (или пока ИИН не подтвердился два раза подряд).
  useEffect(() => {
    if (!running || !ocr || source !== 'camera') return;
    let alive = true;
    const loop = async () => {
      while (alive) {
        const video = videoRef.current;
        if (video && video.videoWidth > 0) {
          const r = await scanFrame(ocr, video, video.videoWidth, video.videoHeight, scanOptions);
          if (!alive) return;
          const s = record(r, true);
          if (stopOnConfirm && s.count >= CONFIRM_STREAK) {
            setRunning(false);
            return;
          }
        }
        await sleep(LOOP_PAUSE_MS);
      }
    };
    loop().catch((e) => {
      if (!alive) return;
      setScanError(errorText(e));
      setRunning(false);
    });
    return () => {
      alive = false;
    };
  }, [running, ocr, source, scanOptions, stopOnConfirm, record]);

  // Разовое распознавание. Если настройку сменили, пока шло прошлое, его результат уже устарел —
  // записывает только последнее задание.
  const once = async (image: CanvasImageSource | Promise<HTMLImageElement>, width: number, height: number, options: ScanOptions) => {
    if (!ocr) return;
    const id = ++job.current;
    setBusy(true);
    setScanError('');
    try {
      const r = await scanFrame(ocr, await image, width, height, options);
      if (id === job.current) record(r, false);
    } catch (e) {
      if (id === job.current) setScanError(errorText(e));
    } finally {
      if (id === job.current) setBusy(false);
    }
  };

  const recognize = async (pic: Picture, options: ScanOptions) => {
    if (ocr) await once(loadImage(pic.url), pic.width, pic.height, options);
  };

  // Для картинки (файл, тестовая карта) любое изменение настроек сразу перечитывает её.
  const rerun = (patch: Partial<ScanOptions>) => {
    if (source !== 'camera' && picture) void recognize(picture, { ...scanOptions, ...patch });
  };

  const newTestCard = (scale = testScale, upsideDown = testUpsideDown, side = testSide) => {
    const tc = makeTestCard(scale, upsideDown, side);
    const pic = { url: tc.url, width: tc.width, height: tc.height, name: 'тестовая карта' };
    setTestCard(tc);
    setPicture(pic);
    setPictureCard(FULL_FRAME);
    void recognize(pic, { ...scanOptions, card: FULL_FRAME });
  };

  const chooseSource = (s: Source) => {
    if (s === source) return;
    setRunning(false);
    setSource(s);
    setVideoSize(null);
    setPicture(null);
    setTestCard(null);
    setResult(null);
    if (s === 'test') newTestCard();
  };

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    try {
      const img = await loadImage(url);
      const pic = { url, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
      setTestCard(null);
      setPicture(pic);
      setPictureCard(FULL_FRAME);
      void recognize(pic, { ...scanOptions, card: FULL_FRAME });
    } catch (err) {
      setScanError(errorText(err));
    }
  };

  const changeCard = (r: Rect | null) => {
    // Рамку нарисовали руками — значит, карта там, где нарисовано: автопоиск выключаем.
    const auto = r ? false : autoCard;
    if (auto !== autoCard) {
      setAutoCard(auto);
      save({ autoCard: auto });
    }
    if (source === 'camera') {
      const next = { ...cameraCards };
      if (r) next[cameraKey] = r;
      else delete next[cameraKey];
      setCameraCards(next);
      save({ cameraCards: next });
    } else {
      setPictureCard(r ?? FULL_FRAME);
      rerun({ card: r ?? FULL_FRAME, autoCard: auto });
    }
  };

  // На терминале две камеры (лицо и документ) — переключаем по кругу; выбор запоминается в этом браузере.
  const switchCamera = () => {
    if (devices.length < 2) return;
    const next = devices[(cameraIndex + 1) % devices.length];
    setDeviceId(next.deviceId);
    saveDocumentCamera(choiceFor(devices, next));
  };

  const shot = () => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0) void once(video, video.videoWidth, video.videoHeight, scanOptions);
  };

  const saveFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    download(c.toDataURL('image/png'), `idscan-${stamp()}.png`);
  };

  const iin = result?.iin ?? null;
  // Мелкая карта и ИИН не проверен общей контрольной MRZ — одному прочтению не верим: ошибка в одной цифре вероятна.
  const doubtful = !!result?.smallText && result.mrz?.composite !== true;
  const confirmed = iin !== null && (source === 'camera' ? streak.count >= CONFIRM_STREAK : !doubtful);
  const dobMatch = iin && result?.cardDob ? sameDob(result.cardDob, iin.birthDate) : null;
  const testVerdict = testCard && result && !busy ? result.iin?.iin === testCard.iin.iin : null;
  const ready = ocrState === 'ready';
  // Карту нашли на кадре — показываем найденную рамку, зоны — от неё.
  const shownCard = autoCard && result?.cardFound ? result.card : card;
  const cardLabel = !autoCard ? 'карта' : !result ? 'карта · автопоиск' : result.cardFound ? 'карта найдена' : 'не найдена — по рамке';

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Распознавание удостоверения</h1>
        <a href={import.meta.env.BASE_URL}>← к киоску</a>
      </div>
      <p style={{ ...muted, marginTop: 4 }}>
        ИИН удостоверения РК — с лицевой стороны (сверка с датой рождения) или из MRZ на обороте. Кадры никуда не
        отправляются и не сохраняются.
      </p>
      <p style={{ marginTop: 6 }} data-idscan-status={ocrState}>
        <b style={{ color: ocrState === 'error' ? '#c62828' : ready ? '#2e7d32' : '#8a6d00' }}>{ocrStatus}</b>
        <span style={muted}>
          {' '}· ядро {env.simd ? 'с SIMD' : 'без SIMD'} · потоков ЦП: {env.cores} · Chrome {env.chrome}
        </span>
      </p>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 14 }}>
        {/* Слева — кадр */}
        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          <Viewer active={frame !== null} card={shownCard} cardLabel={cardLabel} rotation={result?.rotation ?? rotation} onCard={changeCard}>
            {source === 'camera' ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ display: 'block', width: '100%' }}
                onLoadedMetadata={(e) => setVideoSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
              />
            ) : picture ? (
              <img src={picture.url} alt={picture.name} draggable={false} style={{ display: 'block', width: '100%' }} />
            ) : (
              <div style={{ color: '#c2ccd8', padding: 40, textAlign: 'center' }}>Выберите файл с фото удостоверения</div>
            )}
          </Viewer>
          <p style={{ ...muted, marginTop: 8, fontSize: 13 }}>
            Голубая рамка — карта, жёлтая — зона ИИН, зелёная — дата рождения. Рамку карты можно нарисовать мышью или пальцем
            прямо по изображению.
            {frame && ` Кадр: ${frame.width}×${frame.height}.`}
          </p>
        </div>

        {/* Справа — настройки и результат */}
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={panel}>
            <Seg<Source>
              value={source}
              options={[
                ['camera', 'Камера'],
                ['file', 'Файл'],
                ['test', 'Тестовая карта'],
              ]}
              onChange={chooseSource}
            />

            {source === 'camera' && (
              <>
                {!CAMERA_SUPPORTED && (
                  <p style={{ color: '#c62828', marginTop: 10 }}>
                    Камера недоступна: страница открыта не по https и не с localhost. На терминале Chrome запускают с флагом
                    --unsafely-treat-insecure-origin-as-secure.
                  </p>
                )}
                {cameraError && <p style={{ color: '#c62828', marginTop: 10 }}>Камера: {cameraError}</p>}
                <div style={row}>
                  <button
                    type="button"
                    style={{ ...btn(false, devices.length < 2), padding: '12px 20px', fontWeight: 700 }}
                    disabled={devices.length < 2}
                    onClick={switchCamera}
                  >
                    Переключить камеру
                  </button>
                  <span style={muted} data-idscan-camera={devices[cameraIndex]?.label ?? ''}>
                    {devices.length === 0
                      ? 'камеры ещё не найдены'
                      : cameraIndex < 0
                        ? `камер: ${devices.length}`
                        : `Камера ${cameraIndex + 1} из ${devices.length}: ${devices[cameraIndex].label || 'без названия'}`}
                    {devices.length === 1 && ' — других камер браузер не видит, переключать не на что'}
                  </span>
                </div>
                <div style={row}>
                  <select
                    value={deviceId ?? ''}
                    onChange={(e) => {
                      const camera = devices.find((d) => d.deviceId === e.target.value);
                      setDeviceId(e.target.value);
                      saveDocumentCamera(camera ? choiceFor(devices, camera) : null);
                    }}
                    style={{ ...btn(), maxWidth: '100%' }}
                  >
                    <option value="">Камера по умолчанию</option>
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Камера ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <select
                    value={resolution}
                    onChange={(e) => {
                      setResolution(e.target.value);
                      save({ resolution: e.target.value });
                    }}
                    style={btn()}
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace('x', '×')}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={row}>
                  {running ? (
                    <button type="button" style={btn(true)} onClick={() => setRunning(false)}>
                      Стоп
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={btn(false, !ready || !videoSize)}
                      disabled={!ready || !videoSize}
                      onClick={() => {
                        streakRef.current = { iin: null, count: 0 };
                        setStreak(streakRef.current);
                        setRunning(true);
                      }}
                    >
                      Старт
                    </button>
                  )}
                  <button type="button" style={btn(false, !ready || !videoSize || running || busy)} disabled={!ready || !videoSize || running || busy} onClick={shot}>
                    Один кадр
                  </button>
                  <button type="button" style={btn(false, !videoSize)} disabled={!videoSize} onClick={saveFrame}>
                    Сохранить кадр
                  </button>
                </div>
                <label style={{ ...row, cursor: 'pointer' }}>
                  <input type="checkbox" checked={stopOnConfirm} onChange={(e) => setStopOnConfirm(e.target.checked)} />
                  Остановиться, когда ИИН прочитан {CONFIRM_STREAK} раза подряд
                </label>
              </>
            )}

            {source === 'file' && (
              <>
                <div style={row}>
                  <input type="file" accept="image/*" onChange={openFile} disabled={!ready} />
                  <button type="button" style={btn(false, !picture || busy)} disabled={!picture || busy} onClick={() => picture && void recognize(picture, scanOptions)}>
                    Распознать ещё раз
                  </button>
                </div>
                <p style={{ ...muted, marginTop: 8, fontSize: 13 }}>
                  {picture ? `Открыт: ${picture.name}. ` : ''}
                  Если карта занимает не всю картинку, обведите её лицевую сторону рамкой — тогда сработает быстрая зона ИИН.
                </p>
              </>
            )}

            {source === 'test' && (
              <>
                <div style={row}>
                  <button type="button" style={btn(false, !ready || busy)} disabled={!ready || busy} onClick={() => newTestCard()}>
                    Новая карта
                  </button>
                  <Seg<CardSide>
                    value={testSide}
                    options={[
                      ['front', 'Лицевая'],
                      ['back', 'Оборот'],
                    ]}
                    onChange={(v) => {
                      setTestSide(v);
                      newTestCard(testScale, testUpsideDown, v);
                    }}
                  />
                </div>
                <div style={row}>
                  <Seg<number>
                    value={testScale}
                    options={[
                      [1, '100 %'],
                      [0.6, '60 %'],
                      [0.4, '40 %'],
                    ]}
                    onChange={(v) => {
                      setTestScale(v);
                      newTestCard(v, testUpsideDown);
                    }}
                  />
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={testUpsideDown}
                      onChange={(e) => {
                        setTestUpsideDown(e.target.checked);
                        newTestCard(testScale, e.target.checked);
                      }}
                    />
                    вверх ногами
                  </label>
                </div>
                {testCard && (
                  <div style={row}>
                    <span>
                      На карте: <b data-idscan-expected={testCard.iin.iin}>{testCard.iin.iin}</b>
                      {testVerdict !== null && (
                        <b style={{ color: testVerdict ? '#2e7d32' : '#c62828' }}>{testVerdict ? ' — прочитан верно' : ' — не совпало'}</b>
                      )}
                    </span>
                    <button type="button" style={btn()} onClick={() => download(testCard.url, `test-card-${testCard.iin.iin}.png`)}>
                      Сохранить PNG
                    </button>
                  </div>
                )}
                <p style={{ ...muted, marginTop: 8, fontSize: 13 }}>
                  Выдуманные данные с корректным ИИН (на обороте — и с корректной MRZ). PNG можно распечатать в ширину
                  8,6 см и положить на стекло терминала вместо настоящего удостоверения.
                </p>
              </>
            )}
          </div>

          <div style={panel}>
            <div style={{ ...row, marginTop: 0 }}>
              <b style={{ width: 100 }}>Режим</b>
              <Seg<ScanMode>
                value={mode}
                options={[
                  ['auto', 'Авто'],
                  ['zone', 'Зона ИИН'],
                  ['card', 'Вся карта'],
                ]}
                onChange={(v) => {
                  setMode(v);
                  save({ mode: v });
                  rerun({ mode: v });
                }}
              />
            </div>
            <div style={row}>
              <b style={{ width: 100 }}>Поворот</b>
              <Seg<Rotation>
                value={rotation}
                options={[
                  [0, '0°'],
                  [90, '90°'],
                  [180, '180°'],
                  [270, '270°'],
                ]}
                onChange={(v) => {
                  setRotation(v);
                  save({ rotation: v });
                  rerun({ rotation: v });
                }}
              />
            </div>
            <div style={row}>
              <b style={{ width: 100 }}>Порог</b>
              <Seg<Binarization>
                value={binarization}
                options={[
                  ['none', 'нет'],
                  ['otsu', 'Оцу'],
                  ['adaptive', 'адаптивный'],
                ]}
                onChange={(v) => {
                  setBinarization(v);
                  save({ binarization: v });
                  rerun({ binarization: v });
                }}
              />
            </div>
            <label style={{ ...row, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={readDob}
                onChange={(e) => {
                  setReadDob(e.target.checked);
                  save({ readDob: e.target.checked });
                  rerun({ readDob: e.target.checked });
                }}
              />
              Читать дату рождения на карте (сверка с ИИН)
            </label>
            <label style={{ ...row, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoCard}
                onChange={(e) => {
                  setAutoCard(e.target.checked);
                  save({ autoCard: e.target.checked });
                  rerun({ autoCard: e.target.checked });
                }}
              />
              Искать карту на кадре
            </label>
            <label style={{ ...row, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoLayout}
                onChange={(e) => {
                  setAutoLayout(e.target.checked);
                  save({ autoLayout: e.target.checked });
                  rerun({ autoLayout: e.target.checked });
                }}
              />
              Угадывать сторону и положение (переворот)
            </label>
            <div style={row}>
              <button type="button" style={btn()} onClick={() => changeCard(null)}>
                Рамка по умолчанию
              </button>
              <span style={{ ...muted, fontSize: 13 }}>
                Авто: сначала зоны, не нашлось — вся карта. Поворот — на сколько повернуть карту по часовой, чтобы она
                встала ровно. Поиск карты — для камеры издалека и фото с рук; нарисованная рамка его выключает.
              </span>
            </div>
          </div>

          <div style={panel} data-idscan-count={history[0]?.id ?? 0} data-idscan-busy={busy || running ? '1' : '0'}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span
                data-idscan-result={iin?.iin ?? ''}
                style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.04em', color: !iin ? '#94a0ae' : confirmed ? '#2e7d32' : '#b26a00' }}
              >
                {iin?.iin ?? '—'}
              </span>
              <span style={muted}>
                {busy
                  ? 'распознаю…'
                  : !result
                    ? 'ещё не распознавали'
                    : !iin
                      ? 'ИИН не найден'
                      : confirmed
                        ? 'ИИН прочитан'
                        : source === 'camera'
                          ? 'найден в 1 кадре — жду подтверждения'
                          : 'найден, но карта мелкая — не доверяю одному прочтению'}
              </span>
            </div>
            {scanError && <p style={{ color: '#c62828', marginTop: 8 }}>Ошибка: {scanError}</p>}
            {result && (
              <ul style={{ margin: '10px 0 0 18px' }}>
                {iin && (
                  <li>
                    {result.side === 'back' ? 'Из MRZ на обороте' : 'По 12 цифрам ИИН'}: контрольная цифра и дата в ИИН верны —{' '}
                    {iin.birthDate}, {iin.male ? 'мужской' : 'женский'}
                  </li>
                )}
                {result.mrz && (
                  <li>
                    MRZ: документ № {result.mrz.documentNumber}
                    {!result.mrz.documentChecked && ' (номер прочитан с ошибкой — ИИН взят по месту в строке)'}
                    {result.mrz.expiry && `, действует до ${result.mrz.expiry}`}; общая контрольная цифра{' '}
                    {result.mrz.composite === null ? (
                      'не прочиталась'
                    ) : (
                      <b style={{ color: result.mrz.composite ? '#2e7d32' : '#c62828' }}>
                        {result.mrz.composite ? 'сошлась — ИИН проверен целиком' : 'не сошлась'}
                      </b>
                    )}
                  </li>
                )}
                {(readDob || result.side === 'back') && (
                  <li>
                    Дата рождения {result.side === 'back' ? 'в MRZ' : 'на карте'}: {result.cardDob ?? 'не прочитана'}
                    {dobMatch !== null && <b style={{ color: dobMatch ? '#2e7d32' : '#c62828' }}>{dobMatch ? ' — совпадает с ИИН' : ' — не совпадает с ИИН'}</b>}
                  </li>
                )}
                {result.cardFound !== null && <li>Карта на кадре: {result.cardFound ? 'найдена' : 'не найдена — читаю по рамке'}</li>}
                {result.layout && (
                  <li data-idscan-layout={`${result.layout.side ?? '?'}:${result.layout.turn}`}>
                    По картинке: {result.layout.side === 'back' ? 'оборот' : result.layout.side === 'front' ? 'лицевая' : 'сторона не ясна'}
                    {result.layout.turn ? `, повёрнута — ставлю на ${result.layout.turn}°` : ', стоит ровно'}
                    {result.rotation !== (result.layout.turn + rotation) % 360 && ` (прочитана в другом положении: ${result.rotation}°)`}
                    <span style={{ ...muted, fontSize: 13 }}>
                      {' '}· признаки {result.layout.turns.map((t, i) => {
                        const f = result.layout!.features[i];
                        return `${t}°: MRZ ${f.mrz.toFixed(2)}, штрихкод ${f.barcode.toFixed(1)}, фото ${f.photo.toFixed(2)}`;
                      }).join('; ')}
                    </span>
                  </li>
                )}
                {result.smallText && (
                  <li style={{ color: '#b26a00' }}>
                    Карта на кадре мелкая (ниже 250 px): символы ~6–10 px, ошибка в одной цифре вероятна. Поднесите карту
                    ближе или поставьте разрешение камеры выше.
                  </li>
                )}
                {source === 'camera' && (
                  <li>
                    Подряд: {streak.count} из {CONFIRM_STREAK}
                  </li>
                )}
                {result.rejected.map((r) => (
                  <li key={r.iin.iin} style={{ color: '#c62828' }}>
                    Отброшен {r.iin.iin}: {r.reason}
                  </li>
                ))}
                {result.candidates.length > 1 && <li>Кандидаты: {result.candidates.map((c) => c.iin).join(', ')}</li>}
                <li>
                  Время: {result.ms} мс ({result.steps.map((s) => `${s.name.toLowerCase()} ${s.ms}`).join(', ')})
                </li>
              </ul>
            )}
          </div>

          {result?.steps.map((s, i) => (
            <div key={`${i}-${s.name}`} style={panel}>
              <b>{s.name}</b>{' '}
              <span style={muted}>
                · {s.ms} мс · уверенность {s.confidence} %
              </span>
              <img src={s.image} alt={s.name} style={{ display: 'block', maxWidth: '100%', marginTop: 8, border: '1px solid #e3e8ef' }} />
              <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f6f8fa', padding: 8, borderRadius: 6, fontSize: 13 }}>
                {s.text || '(пусто)'}
              </pre>
            </div>
          ))}

          {history.length > 0 && (
            <div style={panel}>
              <b>Последние распознавания</b>
              <table style={{ marginTop: 6, borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={{ padding: '2px 12px 2px 0', ...muted }}>{h.time}</td>
                      <td style={{ padding: '2px 12px 2px 0', fontWeight: 700 }}>{h.iin ?? '—'}</td>
                      <td style={{ padding: '2px 0', ...muted }}>{h.ms} мс</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
