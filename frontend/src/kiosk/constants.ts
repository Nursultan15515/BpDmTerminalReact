export const ACCENT = '#1B4D8F';

// ─── Холст киоска ───────────────────────────────────────────────────────────
// Дизайн нарисован в фиксированной системе координат и масштабируется под экран.
// Ширина общая; разное только соотношение (целевые киоски — 4:3 1024×768).
export type CanvasRatio = '16:9' | '16:10' | '4:3' | '5:4';
export interface CanvasSize {
  width: number;
  height: number;
}

// Ширина у всех 1920 — меняется только высота, чтобы координаты экранов не плыли.
export const CANVAS_PRESETS: Record<CanvasRatio, CanvasSize> = {
  '16:9': { width: 1920, height: 1080 },
  '16:10': { width: 1920, height: 1200 },
  '4:3': { width: 1920, height: 1440 },
  '5:4': { width: 1920, height: 1536 },
};

const RATIO_STORAGE_KEY = 'kiosk.ratio';

function isRatio(value: string | null): value is CanvasRatio {
  return value !== null && value in CANVAS_PRESETS;
}

// Приоритет: URL ?ratio= (фиксируется в localStorage) → сохранённое → авто по экрану.
export function resolveCanvas(): CanvasSize {
  const param = new URLSearchParams(window.location.search).get('ratio');
  if (isRatio(param)) {
    localStorage.setItem(RATIO_STORAGE_KEY, param);
    return CANVAS_PRESETS[param];
  }

  const saved = localStorage.getItem(RATIO_STORAGE_KEY);
  if (isRatio(saved)) return CANVAS_PRESETS[saved];

  const screenRatio = window.innerWidth / window.innerHeight;
  let best: CanvasSize = CANVAS_PRESETS['4:3'];
  let bestDelta = Infinity;
  for (const preset of Object.values(CANVAS_PRESETS)) {
    const delta = Math.abs(preset.width / preset.height - screenRatio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = preset;
    }
  }
  return best;
}

// 'auto' = ничего не зафиксировано (resolveCanvas определит по экрану).
export type RatioSetting = CanvasRatio | 'auto';

export function getRatioSetting(): RatioSetting {
  const saved = localStorage.getItem(RATIO_STORAGE_KEY);
  return isRatio(saved) ? saved : 'auto';
}

// Применяем сразу перезагрузкой на «чистый» URL (без ?ratio=), чтобы fix из URL
// не переопределял выбор и холст пересоздался с новым соотношением.
export function applyRatioSetting(setting: RatioSetting): void {
  if (setting === 'auto') localStorage.removeItem(RATIO_STORAGE_KEY);
  else localStorage.setItem(RATIO_STORAGE_KEY, setting);
  window.location.href = window.location.pathname;
}

export type Screen =
  | 'welcome'
  | 'choose'
  | 'scan'
  | 'manual'
  | 'result'
  | 'confirm'
  | 'photo'
  | 'giveCard'
  | 'success'
  | 'nocards';

export type ResultType = 'loading' | 'found' | 'notfound' | 'error';

export const GREEN = '#1FA968';

// Ответ SOAP GetVisitor, проксируемый через /api/visitors/search (mirrors VisitorCard на бэкенде).
export interface VisitorCard {
  cardId?: string | null;
  visitorFullname?: string | null;
  invitersFullname?: string | null;
  invitersPhoneNumber?: string | null;
  cabinetFloor?: string | null;
  cabinetNumber?: string | null;
  needPhoto: boolean;
  dictPassCardTypeId?: number | null;
}
