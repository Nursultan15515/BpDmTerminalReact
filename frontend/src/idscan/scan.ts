import { findDates, findIins, type IinInfo } from './iin';
import { adaptiveThreshold, applyThreshold, grayToRgba, otsuThreshold, stretchContrast, toGray } from './image';
import { FULL_FRAME, ZONES, type Rect, type Rotation } from './layout';
import { cleanMrzLine, findMrz, MRZ_CHARS, type MrzInfo } from './mrz';
import type { Ocr, OcrLine, OcrText } from './ocr';
import { decide, sameDob, type Verdict } from './verdict';

// Распознавание ИИН на кадре: вырезаем карту по рамке, ставим ровно и читаем
//   лицевую сторону — зоны ИИН и даты рождения (быстро);
//   оборот — зону MRZ (ИИН в ней проверен общей контрольной цифрой);
//   если не вышло — весь текст карты (медленнее, но не зависит ни от раскладки, ни от стороны).

/** zone — зоны лицевой стороны и MRZ; card — весь текст карты; auto — зоны, а не нашлось — вся карта. */
export type ScanMode = 'zone' | 'card' | 'auto';
export type Binarization = 'none' | 'otsu' | 'adaptive';

export interface ScanOptions {
  /** Рамка карты на кадре, в долях кадра. */
  card: Rect;
  rotation: Rotation;
  mode: ScanMode;
  binarization: Binarization;
  /** Читать ещё и дату рождения на лицевой стороне — для сверки с датой внутри ИИН. */
  readDob: boolean;
}

export interface ScanStep {
  name: string;
  text: string;
  confidence: number;
  ms: number;
  /** То, что ушло в распознавание (PNG, data URL). */
  image: string;
}

export interface ScanResult extends Verdict {
  /** ИИН с верной контрольной цифрой, найденные как текст (лицевая сторона). */
  candidates: IinInfo[];
  /** Все разобранные MRZ (оборот). */
  mrzFound: MrzInfo[];
  steps: ScanStep[];
  /** Вся обработка кадра, мс (без подготовки картинок для показа). */
  ms: number;
}

// Высота вырезки зоны: цифры ИИН занимают ~35 % её высоты → ~45 px — удобный для Tesseract размер.
const LINE_HEIGHT = 128;
// Высота вырезки зоны MRZ: символы занимают ~11 % её высоты → ~40 px.
const MRZ_HEIGHT = 360;
// Ширина вырезки всей карты: цифры ИИН ~4 % высоты карты → ~32 px.
const CARD_WIDTH = 1280;
// Белые поля вокруг вырезки: вплотную к краю Tesseract читает хуже (а с полями по 32 px мелкие карты
// читались заметно хуже — проверено статистикой e2e).
const PAD = 16;

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d недоступен');
  return { canvas, ctx };
}

/** Карта из кадра по рамке, повёрнутая ровно, в исходном разрешении. */
function cropCard(source: CanvasImageSource, frameWidth: number, frameHeight: number, card: Rect, rotation: Rotation): HTMLCanvasElement {
  const sx = card.x * frameWidth;
  const sy = card.y * frameHeight;
  const sw = Math.max(1, Math.round(card.w * frameWidth));
  const sh = Math.max(1, Math.round(card.h * frameHeight));
  const turned = rotation === 90 || rotation === 270;
  const { canvas, ctx } = canvas2d(turned ? sh : sw, turned ? sw : sh);
  if (rotation === 90) ctx.translate(sh, 0);
  else if (rotation === 180) ctx.translate(sw, sh);
  else if (rotation === 270) ctx.translate(0, sw);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/** Кусок карты → масштаб → серый → контраст → бинаризация, с белыми полями. */
function prepare(card: HTMLCanvasElement, area: Rect, width: number, height: number, binarization: Binarization): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(width + 2 * PAD, height + 2 * PAD);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(card, area.x * card.width, area.y * card.height, area.w * card.width, area.h * card.height, PAD, PAD, width, height);
  const pixels = ctx.getImageData(PAD, PAD, width, height);
  const gray = toGray(pixels.data, width, height);
  stretchContrast(gray);
  if (binarization === 'otsu') applyThreshold(gray, otsuThreshold(gray));
  else if (binarization === 'adaptive') adaptiveThreshold(gray);
  pixels.data.set(grayToRgba(gray));
  ctx.putImageData(pixels, PAD, PAD);
  return canvas;
}

function prepareZone(card: HTMLCanvasElement, zone: Rect, binarization: Binarization, height = LINE_HEIGHT): HTMLCanvasElement {
  const scale = height / (zone.h * card.height);
  return prepare(card, zone, Math.max(1, Math.round(zone.w * card.width * scale)), height, binarization);
}

export async function scanFrame(ocr: Ocr, source: CanvasImageSource, frameWidth: number, frameHeight: number, options: ScanOptions): Promise<ScanResult> {
  const t0 = performance.now();
  const card = cropCard(source, frameWidth, frameHeight, options.card, options.rotation);
  const done: { name: string; canvas: HTMLCanvasElement; result: OcrText }[] = [];
  const read = async <T extends OcrText>(name: string, canvas: HTMLCanvasElement, run: (c: HTMLCanvasElement) => Promise<T>) => {
    const result = await run(canvas);
    done.push({ name, canvas, result });
    return result.text;
  };
  const b = options.binarization;

  // Всё найденное копится здесь, решение — в decide(): ИИН с лицевой стороны, даты на карте, MRZ оборота.
  const front: IinInfo[] = [];
  const dates: string[] = [];
  const mrz: MrzInfo[] = [];
  const addFront = (items: IinInfo[]) => front.push(...items.filter((i) => !front.some((f) => f.iin === i.iin)));
  const addDates = (items: string[]) => dates.push(...items.filter((d) => !dates.includes(d)));
  // Одна MRZ, прочитанная дважды (по всей карте и блоком), — оставляем самое убедительное прочтение.
  const strength = (m: MrzInfo) => (m.composite === true ? 3 : m.composite === false ? 0 : m.birthDate ? 2 : 1);
  const addMrz = (items: MrzInfo[]) => {
    for (const m of items) {
      const i = mrz.findIndex((f) => f.iin.iin === m.iin.iin);
      if (i < 0) mrz.push(m);
      else if (strength(m) > strength(mrz[i])) mrz[i] = m;
    }
  };
  const found = () => decide(front, dates, mrz).iin !== null;
  // ИИН, в котором сомневаться не приходится: MRZ, проверенная целиком, или лицевая сторона, сверенная с датой.
  const settled = () => {
    const v = decide(front, dates, mrz);
    const iin = v.iin;
    return iin !== null && (v.mrz?.composite === true || (v.side === 'front' && dates.some((d) => sameDob(d, iin.birthDate))));
  };

  if (options.mode !== 'card') {
    addFront(findIins(await read('Зона ИИН', prepareZone(card, ZONES.iin, b), (c) => ocr.line(c, '0123456789'))));
    if (options.readDob) {
      addDates(findDates(await read('Зона даты рождения', prepareZone(card, ZONES.dob, b), (c) => ocr.line(c, '0123456789.'))).slice(0, 1));
    }
    if (!settled()) {
      addMrz(findMrz(await read('Зона MRZ (оборот)', prepareZone(card, ZONES.mrz, b, MRZ_HEIGHT), (c) => ocr.block(c, MRZ_CHARS))));
    }
  }

  if (options.mode === 'card' || (options.mode === 'auto' && !found())) {
    const height = Math.max(1, Math.round((card.height * CARD_WIDTH) / card.width));
    const whole = prepare(card, FULL_FRAME, CARD_WIDTH, height, b);
    const sparse = await ocr.sparse(whole);
    done.push({ name: 'Вся карта', canvas: whole, result: sparse });
    addFront(findIins(sparse.text));
    addDates(findDates(sparse.text));
    addMrz(findMrz(sparse.text));

    // Строки MRZ перечитываем одним блоком и только алфавитом MRZ — так «<» и цифры читаются надёжнее, а блок
    // Tesseract выравнивает сам: на снимке с рук вырезка одной наклонной строки цепляет соседнюю.
    const block = mrzBlock(sparse.lines.filter((l) => looksLikeMrz(l.text)), whole.width, whole.height);
    if (!settled() && block) {
      addMrz(findMrz(await read('Строки MRZ', prepareZone(whole, block.area, b, block.height), (c) => ocr.block(c, MRZ_CHARS))));
    }

    // Мелкая подпись «ЖСН/ИИН» в одной строке с крупными цифрами сбивает распознавание первых цифр.
    // Строки, где много цифр, перечитываем по отдельности и только цифрами — как зону ИИН.
    const numeric = sparse.lines
      .filter((l) => !looksLikeMrz(l.text))
      .map((line) => ({ line, digits: line.text.replace(/\D/g, '').length }))
      .filter((l) => l.digits >= 8)
      .sort((p, q) => q.digits - p.digits)
      .slice(0, 3);
    for (const { line } of numeric) {
      if (found()) break;
      addFront(findIins(await read('Строка с цифрами', prepareZone(whole, lineArea(line, whole.width, whole.height), b), (c) => ocr.line(c, '0123456789'))));
    }
  }

  const verdict = decide(front, dates, mrz);
  const ms = Math.round(performance.now() - t0);
  const steps = done.map(({ name, canvas, result }) => ({
    name,
    text: result.text,
    confidence: result.confidence,
    ms: result.ms,
    image: canvas.toDataURL(),
  }));
  return { ...verdict, candidates: front, mrzFound: mrz, steps, ms };
}

/** Похоже на строку MRZ: длинная, из алфавита MRZ, с «<» или кодом страны. */
function looksLikeMrz(text: string): boolean {
  const line = cleanMrzLine(text);
  return line.length >= 20 && (line.includes('<') || line.includes('KAZ'));
}

/**
 * Блок MRZ: самая «MRZ-шная» строка (больше всего «<» и цифр) и соседние, похожие на MRZ, не дальше трёх с половиной
 * высот строки; рамка с полями → доли картинки и высота вырезки, при которой буквы ~44 px.
 */
function mrzBlock(lines: OcrLine[], width: number, height: number): { area: Rect; height: number } | null {
  if (lines.length === 0) return null;
  const score = (l: OcrLine) => (cleanMrzLine(l.text).match(/[<0-9]/g) ?? []).length;
  const anchor = lines.reduce((best, l) => (score(l) > score(best) ? l : best));
  const h = Math.max(1, anchor.h);
  const near = lines.filter((l) => Math.abs(l.y + l.h / 2 - (anchor.y + anchor.h / 2)) <= 3.5 * h);
  const x0 = Math.max(0, Math.min(...near.map((l) => l.x)) - h);
  const y0 = Math.max(0, Math.min(...near.map((l) => l.y)) - 0.6 * h);
  const x1 = Math.min(width, Math.max(...near.map((l) => l.x + l.w)) + h);
  const y1 = Math.min(height, Math.max(...near.map((l) => l.y + l.h)) + 0.6 * h);
  return {
    area: { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height },
    height: Math.min(900, Math.round(((y1 - y0) * 44) / h)),
  };
}

/** Рамка строки (px) с полями → доли картинки: по высоте строка занимает ~40 %, как цифры в зоне ИИН. */
function lineArea(line: OcrLine, width: number, height: number): Rect {
  const x0 = Math.max(0, line.x - line.h);
  const y0 = Math.max(0, line.y - 0.8 * line.h);
  const x1 = Math.min(width, line.x + line.w + line.h);
  const y1 = Math.min(height, line.y + 1.8 * line.h);
  return { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height };
}
