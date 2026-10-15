import { defaultCardRect, type Rect, type Rotation } from './layout';
import type { Binarization, ScanMode, ScanOptions } from './scan';

// Настройки распознавания, общие для страницы ?idscan и экрана сканирования в киоске: наладчик выбирает камеру
// документа и рамку на ?idscan, киоск читает их отсюда. Хранятся в localStorage этого браузера.

export interface Saved {
  deviceId?: string;
  resolution?: string;
  /** Рамка карты — своя для каждой камеры (ключ — deviceId): у камеры документа и камеры лица они разные. */
  cameraCards?: Record<string, Rect>;
  rotation?: Rotation;
  mode?: ScanMode;
  binarization?: Binarization;
  readDob?: boolean;
  autoCard?: boolean;
  autoLayout?: boolean;
}

const STORAGE_KEY = 'idscan';
export const RESOLUTIONS = ['1920x1080', '1280x720', '640x480'];
// Пауза между кадрами при распознавании с камеры — чтобы не держать процессор терминала на 100 %.
export const LOOP_PAUSE_MS = 150;

export function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

export function save(patch: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSaved(), ...patch }));
  } catch {
    /* без localStorage настройки просто не запоминаются */
  }
}

/** Ограничения getUserMedia: выбранная камера (пусто — по умолчанию) и желаемое разрешение «ШxВ». */
export function cameraConstraints(deviceId: string, resolution: string): MediaStreamConstraints {
  const [width, height] = resolution.split('x').map(Number);
  return { audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: width }, height: { ideal: height } } };
}

/** Есть ли у браузера хоть одна камера (названия и id без разрешения пустые, но сами камеры видны). */
export async function hasCamera(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    return (await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

/** Распознавание в киоске: сохранённые рамка (камеры deviceId, кадр width×height) и режимы, без картинок шагов. */
export function savedScanOptions(saved: Saved, deviceId: string, width: number, height: number): ScanOptions {
  const rotation = saved.rotation ?? 0;
  return {
    card: saved.cameraCards?.[deviceId] ?? defaultCardRect(width, height, rotation),
    autoCard: saved.autoCard ?? true,
    rotation,
    autoLayout: saved.autoLayout ?? true,
    mode: saved.mode ?? 'auto',
    binarization: saved.binarization ?? 'none',
    readDob: saved.readDob ?? true,
    images: false,
  };
}
