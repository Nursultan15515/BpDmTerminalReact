import { findCard } from './detect';
import { findDates, findIins, type IinInfo } from './iin';
import { adaptiveThreshold, applyThreshold, grayToRgba, otsuThreshold, sharpen, stretchContrast, toGray, type Gray } from './image';
import { CARD_ASPECT, FULL_FRAME, MRZ_LINES, ZONES, type Rect, type Rotation } from './layout';
import { cleanMrzLine, findMrz, MRZ_CHARS, type MrzInfo } from './mrz';
import type { Ocr, OcrLine, OcrText } from './ocr';
import { guessLayout, type LayoutGuess } from './orient';
import { decide, sameDob, type Verdict } from './verdict';

// Распознавание ИИН на кадре: находим карту (или берём рамку), по картинке угадываем сторону и положение, ставим
// карту ровно и читаем:
//   лицевую сторону — зоны ИИН и даты рождения (быстро);
//   оборот — зону MRZ (ИИН в ней проверен общей контрольной цифрой);
//   если ни одна зона не дала ИИН — весь текст карты (медленнее, но не зависит ни от раскладки, ни от стороны).
// Догадка задаёт только порядок попыток: первой — угаданная сторона в угаданном положении, остальные — если не нашлось.

/** zone — зоны лицевой стороны и MRZ; card — весь текст карты; auto — зоны, а не нашлось — вся карта. */
export type ScanMode = 'zone' | 'card' | 'auto';
export type Binarization = 'none' | 'otsu' | 'adaptive';

export interface ScanOptions {
  /** Рамка карты на кадре, в долях кадра. */
  card: Rect;
  /** Сначала искать карту на кадре (findCard); не нашлась — рамка card. */
  autoCard: boolean;
  /** Поворот из настроек (как стоит камера). */
  rotation: Rotation;
  /** Угадывать сторону и положение карты (перевёрнута на 180°, а «стоймя» — на 90/270°) по картинке. */
  autoLayout: boolean;
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
  /** Рамка карты, по которой читали (доли кадра). */
  card: Rect;
  /** Карта найдена на кадре автоматически; null — не искали. */
  cardFound: boolean | null;
  /** Карта на кадре мелкая (ниже SMALL_CARD_HEIGHT px): ошибка в одной цифре вероятна — нужен второй кадр или карта ближе. */
  smallText: boolean;
  /** Поворот от кадра, при котором карта прочитана (или стоит по догадке). */
  rotation: Rotation;
  /** Догадка по картинке; null — не угадывали. */
  layout: LayoutGuess | null;
  /** ИИН с верной контрольной цифрой, найденные как текст, — в выбранной попытке. */
  candidates: IinInfo[];
  /** Разобранные MRZ — в выбранной попытке. */
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
// Ширина уменьшенного кадра для поиска карты и размер уменьшенной карты для догадки о стороне.
const DETECT_WIDTH = 320;
const LAYOUT_SIZE = 256;
// Карта ниже этого (px на кадре) — цифры ИИН мельче ~10 px, символы MRZ — ~11 px: распознавание на пределе.
const SMALL_CARD_HEIGHT = 250;

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d недоступен');
  return { canvas, ctx };
}

/** Карта из кадра по рамке, повёрнутая по часовой на rotation, в исходном разрешении. */
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
  // Мелкий текст, увеличенный в 3+ раза, размыт — возвращаем резкость (радиус ~ половина увеличения).
  const scale = width / (area.w * card.width);
  if (scale >= 3) sharpen(gray, Math.round(scale / 2));
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

/** Уменьшенная серая копия (большая сторона — size px). */
function smallGray(source: CanvasImageSource, width: number, height: number, size: number): Gray {
  const scale = Math.min(1, size / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { ctx } = canvas2d(w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return toGray(ctx.getImageData(0, 0, w, h).data, w, h);
}

// ─── Попытки ─────────────────────────────────────────────────────────────────
// Одна попытка — одна сторона в одном положении (или вся карта). Найденное в разных попытках не смешиваем:
// «дата», прочитанная на перевёрнутой карте, — мусор, и он не должен отбрасывать верный ИИН из другой попытки.

interface Attempt {
  turn: Rotation;
  front: IinInfo[];
  dates: string[];
  mrz: MrzInfo[];
  unconfirmed: Verdict['rejected'];
}

const newAttempt = (turn: Rotation): Attempt => ({ turn, front: [], dates: [], mrz: [], unconfirmed: [] });
const addFront = (a: Attempt, items: IinInfo[]) => a.front.push(...items.filter((i) => !a.front.some((f) => f.iin === i.iin)));
const addDates = (a: Attempt, items: string[]) => a.dates.push(...items.filter((d) => !a.dates.includes(d)));

// Одна MRZ, прочитанная дважды (по всей карте и блоком), — оставляем самое убедительное прочтение.
const mrzWeight = (m: MrzInfo) => (m.composite === true ? 3 : m.composite === false ? 0 : m.birthDate ? 2 : 1);
function addMrz(a: Attempt, items: MrzInfo[]) {
  for (const m of items) {
    const i = a.mrz.findIndex((f) => f.iin.iin === m.iin.iin);
    if (i < 0) a.mrz.push(m);
    else if (mrzWeight(m) > mrzWeight(a.mrz[i])) a.mrz[i] = m;
  }
}

/** 0 — ИИН нет; 1 — есть, без сверки; 2 — сверен с датой рождения на карте; 3 — MRZ проверена общей контрольной. */
function strength(a: Attempt): number {
  const v = decide(a.front, a.dates, a.mrz);
  const iin = v.iin;
  if (!iin) return 0;
  if (v.mrz?.composite === true) return 3;
  return v.side === 'front' && a.dates.some((d) => sameDob(d, iin.birthDate)) ? 2 : 1;
}

const isFullFrame = (r: Rect) => r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;

/** Пропорции ID-1 (лёжа или стоймя) с точностью 10 %. */
function cardShaped(width: number, height: number): boolean {
  const aspect = width / height;
  return Math.min(Math.abs(Math.log(aspect / CARD_ASPECT)), Math.abs(Math.log(aspect * CARD_ASPECT))) < Math.log(1.1);
}

/** Карта на кадре — по уменьшенной копии (см. findCard). */
function locateCard(source: CanvasImageSource, frameWidth: number, frameHeight: number): Rect | null {
  return findCard(smallGray(source, frameWidth, frameHeight, DETECT_WIDTH));
}

export async function scanFrame(ocr: Ocr, source: CanvasImageSource, frameWidth: number, frameHeight: number, options: ScanOptions): Promise<ScanResult> {
  const t0 = performance.now();
  const located = options.autoCard ? locateCard(source, frameWidth, frameHeight) : null;
  const cardRect = located ?? options.card;
  const base = cropCard(source, frameWidth, frameHeight, cardRect, options.rotation);
  // Угадываем, только если в рамке — карта: найдена, нарисована или весь кадр и есть карта (скан, тестовая карта).
  // Вертикальный снимок стола с картой посередине — не «карта стоймя», его не поворачиваем.
  const isCard = located !== null || !isFullFrame(cardRect) || cardShaped(frameWidth, frameHeight);
  const layout = options.autoLayout && isCard ? guessLayout(smallGray(base, base.width, base.height, LAYOUT_SIZE)) : null;
  // Положения: угаданное — первым, второе — на случай ошибки. Без догадки — карта как есть.
  const turns: Rotation[] = layout ? [layout.turn, layout.turns.find((t) => t !== layout.turn) ?? layout.turn] : [0];
  const sides = layout?.side === 'back' ? (['back', 'front'] as const) : (['front', 'back'] as const);
  // Повёрнутую карту делаем из уже вырезанной: у видео между двумя захватами кадр сменился бы.
  const oriented = new Map<Rotation, HTMLCanvasElement>([[0, base]]);
  const cardAt = (turn: Rotation) => {
    let c = oriented.get(turn);
    if (!c) {
      c = cropCard(base, base.width, base.height, FULL_FRAME, turn);
      oriented.set(turn, c);
    }
    return c;
  };

  const done: { name: string; canvas: HTMLCanvasElement; result: OcrText }[] = [];
  const read = async <T extends OcrText>(name: string, canvas: HTMLCanvasElement, run: (c: HTMLCanvasElement) => Promise<T>) => {
    const result = await run(canvas);
    done.push({ name, canvas, result });
    return result.text;
  };
  const b = options.binarization;
  const digits = (c: HTMLCanvasElement) => ocr.line(c, '0123456789');

  const readFront = async (card: HTMLCanvasElement, a: Attempt, tag: string) => {
    let zoneIins = findIins(await read(`Зона ИИН${tag}`, prepareZone(card, ZONES.iin, b), digits));
    // Мелкий текст (зона увеличена в 3+ раза) — одно прочтение ненадёжно: ошибку в 11-й цифре не ловят ни контрольная
    // цифра, ни дата рождения. Читаем зону ещё раз с другой обработкой и верим, только если ИИН совпал.
    if (zoneIins.length > 0 && LINE_HEIGHT / (ZONES.iin.h * card.height) >= 3) {
      const other: Binarization = b === 'none' ? 'otsu' : 'none';
      const second = findIins(await read(`Зона ИИН, второе прочтение${tag}`, prepareZone(card, ZONES.iin, other), digits));
      for (const c of zoneIins) if (!second.some((s) => s.iin === c.iin)) a.unconfirmed.push({ iin: c, reason: 'мелкий текст: второе прочтение дало другое' });
      zoneIins = zoneIins.filter((c) => second.some((s) => s.iin === c.iin));
    }
    addFront(a, zoneIins);
    if (options.readDob) {
      addDates(a, findDates(await read(`Зона даты рождения${tag}`, prepareZone(card, ZONES.dob, b), (c) => ocr.line(c, '0123456789.'))).slice(0, 1));
    }
  };

  const readBack = async (card: HTMLCanvasElement, a: Attempt, tag: string) => {
    addMrz(a, findMrz(await read(`Зона MRZ${tag}`, prepareZone(card, ZONES.mrz, b, MRZ_HEIGHT), (c) => ocr.block(c, MRZ_CHARS))));
    // Блоком не вышло (на мелком тексте разметка блока у Tesseract разваливается) — строки 1 и 2 по отдельности.
    if (a.mrz.length === 0) {
      const lines: string[] = [];
      for (const [n, zone] of MRZ_LINES.entries()) {
        lines.push(await read(`Строка MRZ ${n + 1}${tag}`, prepareZone(card, zone, b), (c) => ocr.line(c, MRZ_CHARS)));
      }
      addMrz(a, findMrz(lines.join('\n')));
    }
  };

  const readWhole = async (card: HTMLCanvasElement, a: Attempt, tag: string) => {
    const height = Math.max(1, Math.round((card.height * CARD_WIDTH) / card.width));
    const whole = prepare(card, FULL_FRAME, CARD_WIDTH, height, b);
    const sparse = await ocr.sparse(whole);
    done.push({ name: `Вся карта${tag}`, canvas: whole, result: sparse });
    addFront(a, findIins(sparse.text));
    addDates(a, findDates(sparse.text));
    addMrz(a, findMrz(sparse.text));

    // Строки MRZ перечитываем одним блоком и только алфавитом MRZ — так «<» и цифры читаются надёжнее, а блок
    // Tesseract выравнивает сам: на снимке с рук вырезка одной наклонной строки цепляет соседнюю.
    const block = mrzBlock(sparse.lines.filter((l) => looksLikeMrz(l.text)), whole.width, whole.height);
    if (strength(a) < 2 && block) {
      addMrz(a, findMrz(await read(`Строки MRZ${tag}`, prepareZone(whole, block.area, b, block.height), (c) => ocr.block(c, MRZ_CHARS))));
    }

    // Мелкая подпись «ЖСН/ИИН» в одной строке с крупными цифрами сбивает распознавание первых цифр.
    // Строки, где много цифр, перечитываем по отдельности и только цифрами — как зону ИИН.
    const numeric = sparse.lines
      .filter((l) => !looksLikeMrz(l.text))
      .map((line) => ({ line, count: line.text.replace(/\D/g, '').length }))
      .filter((l) => l.count >= 8)
      .sort((p, q) => q.count - p.count)
      .slice(0, 3);
    for (const { line } of numeric) {
      if (strength(a) >= 1) break;
      addFront(a, findIins(await read(`Строка с цифрами${tag}`, prepareZone(whole, lineArea(line, whole.width, whole.height), b), digits)));
    }
  };

  const attempts: Attempt[] = [];
  const best = () => attempts.reduce<Attempt | null>((p, q) => (!p || strength(q) > strength(p) ? q : p), null);
  const bestStrength = () => {
    const a = best();
    return a ? strength(a) : 0;
  };
  const tagOf = (turn: Rotation, side: string) => (layout ? ` · ${side}${turn ? `, ${turn}°` : ''}` : '');

  // Сначала всё в угаданном положении (зоны, потом вся карта), и только если ИИН нет — в другом.
  for (const turn of turns) {
    if (options.mode !== 'card') {
      for (const side of sides) {
        const a = newAttempt(turn);
        attempts.push(a);
        if (side === 'front') await readFront(cardAt(turn), a, tagOf(turn, 'лицевая'));
        else await readBack(cardAt(turn), a, tagOf(turn, 'оборот'));
        if (bestStrength() >= 2) break;
      }
    }
    if (options.mode === 'card' || (options.mode === 'auto' && bestStrength() === 0)) {
      const a = newAttempt(turn);
      attempts.push(a);
      await readWhole(cardAt(turn), a, layout && turn ? ` · ${turn}°` : '');
    }
    // В этом положении ИИН нашёлся — переворачивать карту незачем.
    if (bestStrength() >= 1) break;
  }

  const chosen = best();
  const verdict = chosen ? decide(chosen.front, chosen.dates, chosen.mrz) : decide([], [], []);
  // Отброшенное во всех попытках — для разбора; принятый ИИН и повторы — нет.
  const rejected: Verdict['rejected'] = [];
  for (const a of attempts) {
    for (const r of [...decide(a.front, a.dates, a.mrz).rejected, ...a.unconfirmed]) {
      if (r.iin.iin !== verdict.iin?.iin && !rejected.some((x) => x.iin.iin === r.iin.iin)) rejected.push(r);
    }
  }
  const ms = Math.round(performance.now() - t0);
  const steps = done.map(({ name, canvas, result }) => ({
    name,
    text: result.text,
    confidence: result.confidence,
    ms: result.ms,
    image: canvas.toDataURL(),
  }));
  return {
    ...verdict,
    rejected,
    card: cardRect,
    cardFound: options.autoCard ? located !== null : null,
    smallText: Math.min(base.width, base.height) < SMALL_CARD_HEIGHT,
    rotation: ((options.rotation + (chosen?.turn ?? turns[0])) % 360) as Rotation,
    layout,
    candidates: chosen?.front ?? [],
    mrzFound: chosen?.mrz ?? [],
    steps,
    ms,
  };
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
  const anchor = lines.reduce((top, l) => (score(l) > score(top) ? l : top));
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
