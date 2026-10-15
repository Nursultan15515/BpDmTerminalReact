import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CONFIRM_STREAK, nextStreak, type Streak } from '../../idscan/iin';
import type { Rect } from '../../idscan/layout';
import { sharedOcr } from '../../idscan/ocr';
import { scanFrame } from '../../idscan/scan';
import { cameraConstraints, loadSaved, LOOP_PAUSE_MS, RESOLUTIONS, savedScanOptions } from '../../idscan/setup';
import { reportError } from '../api';
import { resolveDocumentCamera } from '../cameras';
import { GREEN } from '../constants';
import { PressBtn } from '../PressBtn';
import { Arrow, CheckIcon, ErrorGlyph, KeyboardGlyph, RetakeIcon } from '../icons';
import { useI18n } from '../i18n';

// Сканирование удостоверения: камера документа (её и рамку карты выбирают на ?idscan) → распознавание кадр за кадром →
// ИИН, прочитанный два раза подряд, уходит в поиск. Посетитель видит кадр с рамкой найденной карты, шаги
// «на стекле → прочитан → проверен» и подсказку, если долго не читается. Кадры никуда не отправляются.

type Phase = 'starting' | 'place' | 'reading' | 'confirming' | 'done' | 'failed' | 'error';

interface View {
  phase: Phase;
  /** Размер кадра камеры, px — в нём координаты рамок. */
  frame: { width: number; height: number } | null;
  /** Куда класть карту: сохранённая рамка этой камеры или рамка по умолчанию (доли кадра). */
  guide: Rect | null;
  /** Карта, найденная на последнем кадре (доли кадра). */
  card: Rect | null;
  iin: string | null;
}

const START: View = { phase: 'starting', frame: null, guide: null, card: null, iin: null };
// Долго не читается — подсказка; ещё дольше — «не удалось»: попробовать снова или ввести вручную.
const HINT_MS = 10000;
const FAIL_MS = 30000;
// Прочитанный ИИН показываем, прежде чем искать пропуск.
const DONE_MS = 1200;
// Брошенный экран «не удалось» сам уходит на главную.
const IDLE_MS = 30000;
const AMBER = '#F5C24B';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** ИИН два раза подряд — прочитан; один раз — проверяем вторым кадром; карта на кадре — читаем. */
function phaseOf(streak: Streak, cardFound: boolean | null): Phase {
  if (streak.count >= CONFIRM_STREAK) return 'done';
  if (streak.count > 0) return 'confirming';
  return cardFound ? 'reading' : 'place';
}

/** Камера документа (страница «Камеры» или ?idscan); её нет (отключили, другой компьютер) — камера по умолчанию. */
async function openCamera(deviceId: string, resolution: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, resolution));
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw e;
    return navigator.mediaDevices.getUserMedia(cameraConstraints('', resolution));
  }
}

const box = (r: Rect, f: { width: number; height: number }) => ({ x: r.x * f.width, y: r.y * f.height, width: r.w * f.width, height: r.h * f.height });

function Viewfinder({ view, videoRef, children }: { view: View; videoRef: React.RefObject<HTMLVideoElement | null>; children: ReactNode }) {
  const { t } = useI18n();
  const { phase, frame } = view;
  const done = phase === 'done';
  const over = phase === 'failed' || phase === 'error';
  const reading = phase === 'reading' || phase === 'confirming';
  const pill = done
    ? { dot: GREEN, label: t.scan.pillDone }
    : reading
      ? { dot: AMBER, label: t.scan.pillReading }
      : { dot: '#FF5A5A', label: t.scan.pillCamera };
  const radius = frame ? Math.min(frame.width, frame.height) * 0.025 : 0;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        borderRadius: 30,
        overflow: 'hidden',
        background: 'linear-gradient(160deg,#1E2A38,#0B121B)',
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.06), var(--shadow)',
      }}
    >
      {/* Кадр целиком (contain), без зеркала: посетитель видит то же, что камера, и надписи читаются. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: over ? 0.2 : 1, transition: 'opacity .3s' }}
      />

      {/* Рамки — в координатах кадра: viewBox + meet вписывают их ровно так же, как object-fit: contain — видео. */}
      {frame && !over && (
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {view.card ? (
            <rect
              {...box(view.card, frame)}
              rx={radius}
              fill={done ? GREEN : 'none'}
              fillOpacity={done ? 0.18 : 0}
              stroke={done ? GREEN : AMBER}
              strokeWidth={6}
              vectorEffect="non-scaling-stroke"
              style={done ? undefined : { animation: 'cardPulse 1.1s ease-in-out infinite' }}
            />
          ) : (
            phase === 'place' &&
            view.guide && (
              <rect
                {...box(view.guide, frame)}
                rx={radius}
                fill="none"
                stroke="rgba(255,255,255,.7)"
                strokeWidth={4}
                strokeDasharray="16 12"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
        </svg>
      )}

      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 18px',
          borderRadius: 999,
          background: 'rgba(0,0,0,.36)',
          color: '#EAF0F7',
          fontSize: 21,
          fontWeight: 700,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: pill.dot, boxShadow: done ? 'none' : `0 0 0 4px ${pill.dot}38` }} />
        {pill.label}
      </div>

      {children}
    </div>
  );
}

/** Подпись поверх кадра: внизу — что делать сейчас, по центру — итог (прочитан, не удалось). */
function Caption({ title, desc, tone = 'dark' }: { title: string; desc?: string; tone?: 'dark' | 'green' }) {
  return (
    <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 28px' }}>
      <div
        style={{
          padding: '16px 34px',
          borderRadius: 26,
          background: tone === 'green' ? GREEN : 'rgba(0,0,0,.5)',
          color: '#fff',
          textAlign: 'center',
          maxWidth: '100%',
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 800 }}>{title}</div>
        {desc && <div style={{ fontSize: 23, fontWeight: 600, opacity: 0.85, marginTop: 6 }}>{desc}</div>}
      </div>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: '0 48px',
        textAlign: 'center',
        color: '#fff',
        animation: 'popIn .4s both',
      }}
    >
      {children}
    </div>
  );
}

const spinner = (size: number, color: string, track: string): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  border: `${Math.round(size / 9)}px solid ${track}`,
  borderTopColor: color,
  animation: 'spin .9s linear infinite',
  flexShrink: 0,
});

type StepState = 'done' | 'active' | 'todo';

function Step({ n, label, state, accent }: { n: number; label: string; state: StepState; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      {state === 'done' ? (
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CheckIcon size={30} sw={3} />
        </div>
      ) : state === 'active' ? (
        <div style={spinner(54, accent, 'var(--accent-50)')} />
      ) : (
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: '#EFF2F6',
            color: 'var(--ink-faint)',
            fontSize: 24,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {n}
        </div>
      )}
      <span style={{ fontSize: 28, fontWeight: state === 'todo' ? 600 : 700, color: state === 'todo' ? 'var(--ink-faint)' : 'var(--ink)' }}>{label}</span>
    </div>
  );
}

const STEP_OF: Record<Phase, number> = { starting: 0, place: 0, reading: 1, confirming: 2, done: 3, failed: -1, error: -1 };

export function ScanScreen({
  accent,
  onFound,
  onManual,
  onBack,
  onHome,
}: {
  accent: string;
  onFound: (iin: string) => void;
  onManual: () => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [view, setView] = useState<View>(START);
  const [hint, setHint] = useState(false);
  // «Попробовать снова» начинает новый круг: камера и распознавание заново.
  const [round, setRound] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    let alive = true;
    let stream: MediaStream | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Распознавание — до первого итога; камера — до ухода с экрана (прочитанный кадр остаётся на виду).
    const stop = () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    const release = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (video) video.srcObject = null;
    };
    timers.push(setTimeout(() => setHint(true), HINT_MS));
    timers.push(
      setTimeout(() => {
        stop();
        release();
        setView((v) => ({ ...v, phase: 'failed', card: null }));
      }, FAIL_MS),
    );

    const run = async () => {
      // Распознавание догружается, пока включается камера (обычно уже готово — его запускает экран выбора).
      const ocr = sharedOcr();
      // Камера документа: найдётся и по названию, если у неё сменился id, — тогда обновятся id и рамка в настройках.
      const camera = await resolveDocumentCamera();
      const saved = loadSaved();
      const s = await openCamera(camera, saved.resolution ?? RESOLUTIONS[0]);
      if (!alive) {
        s.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = s;
      if (video) video.srcObject = s;
      // Рамка запомнена для конкретной камеры (как на ?idscan).
      const deviceId = s.getVideoTracks()[0]?.getSettings().deviceId ?? saved.deviceId ?? '';
      while (alive && !(video && video.videoWidth > 0)) await sleep(50);
      if (!alive || !video) return;
      const frame = { width: video.videoWidth, height: video.videoHeight };
      setView({ ...START, phase: 'place', frame, guide: savedScanOptions(saved, deviceId, frame.width, frame.height).card });

      const engine = await ocr;
      let streak: Streak = { iin: null, count: 0 };
      while (alive) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width > 0) {
          const options = savedScanOptions(saved, deviceId, width, height);
          const r = await scanFrame(engine, video, width, height, options);
          if (!alive) return;
          streak = nextStreak(streak, r.iin?.iin ?? null);
          const phase = phaseOf(streak, r.cardFound);
          setView({ phase, frame: { width, height }, guide: options.card, card: r.cardFound ? r.card : null, iin: streak.iin });
          if (phase === 'done') {
            stop();
            return;
          }
        }
        await sleep(LOOP_PAUSE_MS);
      }
    };

    run().catch((e) => {
      if (!alive) return;
      stop();
      release();
      reportError(`idscan: ${errorText(e)}`, 'ScanDoc');
      setView((v) => ({ ...v, phase: 'error', card: null }));
    });
    return () => {
      stop();
      release();
    };
  }, [round]);

  const { phase, iin } = view;
  const over = phase === 'failed' || phase === 'error';

  // Прочитан — коротко показываем ИИН и ищем пропуск.
  useEffect(() => {
    if (phase !== 'done' || !iin) return;
    const id = setTimeout(() => onFound(iin), DONE_MS);
    return () => clearTimeout(id);
  }, [phase, iin, onFound]);

  useEffect(() => {
    if (!over) return;
    const id = setTimeout(onHome, IDLE_MS);
    return () => clearTimeout(id);
  }, [over, onHome]);

  const retry = () => {
    setHint(false);
    setView(START);
    setRound((n) => n + 1);
  };

  const caption =
    phase === 'starting'
      ? { title: t.scan.starting }
      : phase === 'place'
        ? { title: t.scan.place, desc: t.scan.placeDesc }
        : phase === 'reading'
          ? { title: t.scan.reading, desc: t.scan.readingDesc }
          : phase === 'confirming'
            ? { title: t.scan.confirming, desc: t.scan.confirmingDesc }
            : null;
  const step = STEP_OF[phase];
  const stepState = (n: number): StepState => (step >= n ? 'done' : step === n - 1 && !over ? 'active' : 'todo');

  const secondary: CSSProperties = {
    height: 92,
    borderRadius: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    fontSize: 30,
    fontWeight: 700,
    color: 'var(--ink-soft)',
    background: 'var(--surface)',
    border: '1.5px solid var(--line)',
    boxShadow: 'var(--shadow-press)',
    whiteSpace: 'nowrap',
  };
  const primary: CSSProperties = {
    ...secondary,
    fontWeight: 800,
    color: '#fff',
    background: accent,
    border: `1.5px solid ${accent}`,
    boxShadow: `0 16px 34px -14px ${accent}`,
  };

  return (
    <div className="screen" data-scan-phase={phase} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '100px 80px 56px' }}>
      <div style={{ flexShrink: 0, animation: 'popIn .5s both' }}>
        <h1 style={{ fontSize: 54, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1 }}>{t.scan.title}</h1>
        <p style={{ fontSize: 26, fontWeight: 500, color: 'var(--ink-soft)', marginTop: 12 }}>{t.scan.sub}</p>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 44, paddingTop: 34 }}>
        <Viewfinder view={view} videoRef={videoRef}>
          {phase === 'starting' && (
            <Center>
              <div style={spinner(84, '#fff', 'rgba(255,255,255,.18)')} />
            </Center>
          )}
          {caption && <Caption title={caption.title} desc={caption.desc} />}
          {phase === 'done' && <Caption title={t.scan.done} desc={t.scan.doneDesc} tone="green" />}
          {over && (
            <Center>
              <ErrorGlyph />
              <div style={{ fontSize: 44, fontWeight: 800 }}>{phase === 'failed' ? t.scan.failTitle : t.scan.errorTitle}</div>
              <div style={{ fontSize: 27, fontWeight: 500, opacity: 0.8 }}>{phase === 'failed' ? t.scan.failDesc : t.scan.errorDesc}</div>
            </Center>
          )}
        </Viewfinder>

        <div style={{ width: 600, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24, animation: 'popIn .55s .08s both' }}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--line)',
              borderRadius: 28,
              boxShadow: 'var(--shadow)',
              padding: '34px 38px',
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
            }}
          >
            <Step n={1} label={t.scan.stepCard} state={stepState(1)} accent={accent} />
            <Step n={2} label={t.scan.stepRead} state={stepState(2)} accent={accent} />
            <Step n={3} label={t.scan.stepCheck} state={stepState(3)} accent={accent} />
            {/* Прочитанный ИИН — посетитель сразу видит, что прочитан его номер. */}
            {iin && (phase === 'confirming' || phase === 'done') && (
              <div
                data-scan-iin={iin}
                style={{
                  marginTop: 4,
                  padding: '16px 0 0',
                  borderTop: '1.5px solid var(--line)',
                  fontSize: 46,
                  fontWeight: 800,
                  letterSpacing: '.06em',
                  fontVariantNumeric: 'tabular-nums',
                  color: phase === 'done' ? GREEN : 'var(--ink-faint)',
                  textAlign: 'center',
                }}
              >
                {iin}
              </div>
            )}
          </div>

          {hint && !over && phase !== 'done' && (
            <div
              style={{
                padding: '20px 26px',
                borderRadius: 22,
                background: '#FFF6DF',
                border: `1.5px solid ${AMBER}`,
                fontSize: 24,
                fontWeight: 600,
                lineHeight: 1.4,
                color: '#7A5A00',
                animation: 'popIn .4s both',
              }}
            >
              {t.scan.hint}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {phase === 'failed' && (
              <PressBtn onClick={retry} style={primary}>
                <RetakeIcon color="#fff" /> {t.common.retry}
              </PressBtn>
            )}
            <PressBtn onClick={onManual} style={phase === 'error' ? primary : secondary}>
              <KeyboardGlyph size={44} color={phase === 'error' ? '#fff' : '#5A6675'} /> {t.choose.manual}
            </PressBtn>
            <PressBtn onClick={onBack} style={{ ...secondary, height: 72, fontSize: 26, boxShadow: 'none' }}>
              <Arrow dir="left" color="#5A6675" size={26} /> {t.manual.back}
            </PressBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
