import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Webcam from 'react-webcam';
import { GREEN, type VisitorCard } from '../constants';
import { reportError, savePhoto } from '../api';
import { PressBtn } from '../PressBtn';
import { CameraIcon, CheckIcon, PersonGlyph, RetakeIcon } from '../icons';
import { useI18n } from '../i18n';

type CapturePhase = 'live' | 'uploading' | 'done' | 'error';

const DASH = '—';
// Брошенный киоск сам возвращается на главную, если за 45 сек фото так и не сделали.
// Отсчёт сбрасывается при каждой смене фазы, т.е. после неудачной попытки начинается заново.
const AUTO_HOME_MS = 45000;
// После стольких попыток принимаем кадр независимо от результата распознавания.
const MAX_ATTEMPTS = 5;

function orDash(value?: string | null): string {
  const v = value?.trim();
  return v ? v : DASH;
}

function StatusBadge() {
  const { t } = useI18n();
  return (
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
  );
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

type CornerPos = 'tl' | 'tr' | 'bl' | 'br';
function Corner({ pos }: { pos: CornerPos }) {
  const c: CSSProperties = { borderColor: 'rgba(255,255,255,.55)', position: 'absolute', width: 40, height: 40 };
  const map: Record<CornerPos, CSSProperties> = {
    tl: { top: 22, left: 22, borderTop: '4px solid', borderLeft: '4px solid', borderTopLeftRadius: 14 },
    tr: { top: 22, right: 22, borderTop: '4px solid', borderRight: '4px solid', borderTopRightRadius: 14 },
    bl: { bottom: 22, left: 22, borderBottom: '4px solid', borderLeft: '4px solid', borderBottomLeftRadius: 14 },
    br: { bottom: 22, right: 22, borderBottom: '4px solid', borderRight: '4px solid', borderBottomRightRadius: 14 },
  };
  return <div style={{ ...c, ...map[pos] }} />;
}

function CameraViewfinder({
  accent,
  phase,
  flash,
  errorMsg,
  shot,
  webcamRef,
  onCapture,
  onRetake,
}: {
  accent: string;
  phase: CapturePhase;
  flash: boolean;
  errorMsg: string;
  shot: string | null;
  webcamRef: React.RefObject<Webcam | null>;
  onCapture: () => void;
  onRetake: () => void;
}) {
  const { t } = useI18n();
  const done = phase === 'done';
  const uploading = phase === 'uploading';
  const error = phase === 'error';
  // While we have a captured frame, the live camera is unmounted and we display
  // the frozen JPEG instead — lighter on weak terminals and lets the visitor see the shot.
  const frozen = shot != null;

  const pill = done
    ? { dot: GREEN, label: t.found.pillReady }
    : uploading
      ? { dot: '#F5C24B', label: t.found.pillChecking }
      : error
        ? { dot: '#FF5A5A', label: t.found.pillError }
        : { dot: '#FF5A5A', label: t.found.pillCamera };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
          borderRadius: 30,
          overflow: 'hidden',
          background: 'linear-gradient(160deg,#1E2A38,#0B121B)',
          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.06), var(--shadow)',
        }}
      >
        {/* Снимок уходит в пропуск без зеркала и в родном разрешении камеры, как в легаси
            (проп mirrored у react-webcam отражает и сам снимок). Зеркалим только картинку на экране —
            и живое превью, и застывший кадр, чтобы он не «переворачивался» после съёмки. */}
        {frozen ? (
          <img
            src={shot}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            forceScreenshotSourceSize
            videoConstraints={{ width: 480, height: 640, facingMode: 'user' }}
            onUserMediaError={(e) => reportError(`camera: ${String(e)}`, 'TakePhoto')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(120% 80% at 50% 22%, rgba(120,160,210,.18), transparent 62%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 26,
            right: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 3,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,.32)',
              color: '#EAF0F7',
              fontSize: 21,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: pill.dot,
                boxShadow: done ? 'none' : `0 0 0 4px ${pill.dot}38`,
              }}
            />
            {pill.label}
          </div>
          <div style={{ color: 'rgba(234,240,247,.7)', fontSize: 20, fontWeight: 600, fontFamily: 'monospace' }}>
            {frozen ? 'IMG_0001' : 'LIVE'}
          </div>
        </div>

        {done ? (
          <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 22px',
                borderRadius: 999,
                background: GREEN,
                color: '#fff',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              <CheckIcon size={22} sw={3} /> {t.found.photoDone}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '47%',
                transform: 'translate(-50%,-50%)',
                width: 300,
                height: 380,
                borderRadius: '50%',
                border: `3px dashed ${error ? 'rgba(255,120,120,.85)' : 'rgba(176,206,240,.7)'}`,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {!uploading && !error && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: 3,
                    background: 'linear-gradient(90deg, transparent, rgba(120,170,235,.9), transparent)',
                    animation: 'faceScan 2.6s ease-in-out infinite alternate',
                  }}
                />
              )}
            </div>
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
              <div
                style={{
                  padding: '11px 24px',
                  borderRadius: 999,
                  background: error ? 'rgba(225,87,76,.9)' : 'rgba(0,0,0,.34)',
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {uploading ? t.found.checking : error ? errorMsg : t.found.placeFace}
              </div>
            </div>
          </>
        )}

        {flash && (
          <div style={{ position: 'absolute', inset: 0, background: '#fff', animation: 'camFlash .55s ease-out forwards', zIndex: 5 }} />
        )}
      </div>

      <div style={{ height: 176, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {done || error ? (
          <PressBtn
            onClick={onRetake}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              height: 84,
              padding: '0 38px',
              borderRadius: 22,
              background: 'var(--surface)',
              border: '1.5px solid var(--line)',
              boxShadow: 'var(--shadow-press)',
              fontSize: 30,
              fontWeight: 700,
              color: 'var(--ink-soft)',
            }}
          >
            <RetakeIcon /> {t.found.retake}
          </PressBtn>
        ) : (
          <>
            <PressBtn
              onClick={uploading ? undefined : onCapture}
              pressScale={0.94}
              style={{
                width: 132,
                height: 132,
                borderRadius: '50%',
                background: '#fff',
                border: '5px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow)',
                opacity: uploading ? 0.55 : 1,
                pointerEvents: uploading ? 'none' : 'auto',
              }}
            >
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  background: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CameraIcon size={48} />
              </div>
            </PressBtn>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {uploading ? t.found.sending : t.found.takePhoto}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function cabinetText(card: VisitorCard): string {
  const floor = card.cabinetFloor?.trim();
  const cab = card.cabinetNumber?.trim();
  if (floor && cab) return `${floor} / ${cab}`;
  return cab || floor || DASH;
}

export function FoundScreen({
  accent,
  card,
  onHome,
  onComplete,
}: {
  accent: string;
  card: VisitorCard;
  onHome: () => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const webcamRef = useRef<Webcam>(null);
  const [phase, setPhase] = useState<CapturePhase>('live');
  const [flash, setFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Успешное фото = регистрация завершена: коротко показываем «Фото сделано» и идём дальше.
  // Пока фото не сделано — держим страховочный таймер на возврат к началу.
  useEffect(() => {
    if (phase === 'done') {
      const id = setTimeout(onComplete, 1600);
      return () => clearTimeout(id);
    }
    const id = setTimeout(onHome, AUTO_HOME_MS);
    return () => clearTimeout(id);
  }, [phase, onComplete, onHome]);

  const capture = async () => {
    if (phase === 'uploading' || phase === 'done') return;

    const frame = webcamRef.current?.getScreenshot();
    if (!frame) {
      setErrorMsg(t.found.errCamera);
      setPhase('error');
      return;
    }

    const attempt = attempts + 1;
    setAttempts(attempt);

    setShot(frame);
    setFlash(true);
    setTimeout(() => setFlash(false), 550);
    setPhase('uploading');

    // На последней попытке шлём force=true — бэкенд пропускает проверку лица и сохраняет кадр.
    // Реальный сбой сохранения (исключение) остаётся ошибкой даже на последней попытке:
    // карту не выдаём «вслепую» без сохранённого фото.
    const forced = attempt >= MAX_ATTEMPTS;

    try {
      const res = await savePhoto(card.cardId ?? '', frame, card.dictPassCardTypeId ?? 0, forced);
      if (res.kind === 'ok') {
        setPhase('done');
      } else {
        setErrorMsg(res.message);
        setPhase('error');
      }
    } catch {
      setErrorMsg(t.found.errUpload);
      setPhase('error');
    }
  };

  const retake = () => {
    setErrorMsg('');
    setShot(null);
    setPhase('live');
  };

  return (
    <div className="screen" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '100px 80px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, animation: 'popIn .5s both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              background: GREEN,
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
              {t.found.title}
            </h1>
            <p style={{ fontSize: 23, fontWeight: 500, color: 'var(--ink-soft)', marginTop: 10 }}>
              {t.found.sub}
            </p>
          </div>
        </div>
        <StatusBadge />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 48, paddingTop: 40 }}>
        <div
          style={{
            width: 880,
            flexShrink: 0,
            alignSelf: 'flex-start',
            // Высота равна изображению камеры справа (вся колонка минус область кнопки под камерой, 176px).
            height: 'calc(100% - 176px)',
            background: 'var(--surface)',
            borderRadius: 28,
            border: '1.5px solid var(--line)',
            boxShadow: 'var(--shadow)',
            padding: '46px 50px',
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 32, columnGap: 44 }}>
            <InfoRow label={t.found.invite} value={orDash(card.invitersFullname)} strong />
            <InfoRow label={t.found.invitePhone} value={orDash(card.invitersPhoneNumber)} />
            <InfoRow label={t.found.floor} value={orDash(card.cabinetFloor)} />
            <InfoRow label={t.found.cabinet} value={cabinetText(card)} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, animation: 'popIn .55s .12s both' }}>
          <CameraViewfinder accent={accent} phase={phase} flash={flash} errorMsg={errorMsg} shot={shot} webcamRef={webcamRef} onCapture={capture} onRetake={retake} />
        </div>
      </div>
    </div>
  );
}
