import { adaptiveThreshold, type Gray } from './image.ts';
import type { Rotation } from './layout.ts';

// Сторона и положение карты — по картинке, без распознавания текста (миллисекунды на уменьшенной карте ~256 px).
// Признаки считаем для двух положений — как есть и на 180° (карту «стоймя» — на 90° и 270°):
//   положение: в ровно стоящей карте слева сверху — штрихкод (оборот) или шапка (лицевая), слева посередине — фото
//   (лицевая) или чип (оборот); в перевёрнутой там пусто. Так на всех проверенных картах, обеих сторон;
//   сторона: у оборота внизу три строки MRZ через всю карту, у лицевой справа внизу пусто.
// Это только порядок попыток: ошиблись — распознавание попробует и остальные. Без DOM — проверяется в Node.

export interface LayoutFeatures {
  /** Строки MRZ: три строки с шагом MRZ в правой половине низа — доля ширины у самой «пустой» (у MRZ ~0,4–0,5). */
  mrz: number;
  /** Левый верх: скачки средних по столбцам против вертикальных перепадов (штрихкод ~1–4, шапка ~0,7, пусто ~0,2). */
  barcode: number;
  /** Левая середина: насколько она темнее фона карты, доля (фото ~0,15–0,4, чип ~0,1, пусто ~0,05). */
  photo: number;
}

export interface LayoutGuess {
  side: 'front' | 'back' | null;
  /** На сколько ещё повернуть карту по часовой — сверх поворота из настроек. */
  turn: Rotation;
  /** Проверенные положения и признаки в каждом. */
  turns: [Rotation, Rotation];
  features: [LayoutFeatures, LayoutFeatures];
}

// Центры строк MRZ (доли высоты карты) и пороги — по синтетическим картам и снимкам настоящих: у оборотов признак
// MRZ 0,37–0,48, у лицевой 0,00; оценка положения в правильном положении больше, чем в перевёрнутом, в 2,5–10 раз.
const MRZ_LINES_Y = [0.685, 0.787, 0.89];
const MRZ_MIN = 0.2;
const ORIENT_MIN = 0.2;

/** Поворот серой картинки по часовой на 0/90/180/270°. */
export function rotateGray(img: Gray, rotation: Rotation): Gray {
  if (rotation === 0) return img;
  const { width: w, height: h, data } = img;
  const turned = rotation === 90 || rotation === 270;
  const ow = turned ? h : w;
  const oh = turned ? w : h;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const src = rotation === 90 ? (h - 1 - x) * w + y : rotation === 180 ? (h - 1 - y) * w + (w - 1 - x) : x * w + (w - 1 - y);
      out[y * ow + x] = data[src];
    }
  }
  return { data: out, width: ow, height: oh };
}

function percentile(data: Uint8ClampedArray, p: number): number {
  const hist = new Uint32Array(256);
  for (const v of data) hist[v]++;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= data.length * p) return v;
  }
  return 255;
}

/** Признаки раскладки для карты, стоящей ровно (альбомная, текст читается слева направо). */
export function layoutFeatures(img: Gray): LayoutFeatures {
  const { width: w, height: h, data } = img;
  const px = (fx: number) => Math.min(w - 1, Math.max(0, Math.round(fx * w)));
  const py = (fy: number) => Math.min(h - 1, Math.max(0, Math.round(fy * h)));

  // Тёмные штрихи текста — адаптивным порогом по копии. Порог мягкий (на 10 % темнее окрестности): на снимке
  // с веб-камеры текст размыт и бледен; бледная волнистая сетка фона его всё равно почти не проходит.
  const mask: Gray = { data: new Uint8ClampedArray(data), width: w, height: h };
  adaptiveThreshold(mask, Math.max(9, Math.round(h / 6)), 0.1);

  // MRZ: строки идут через всю карту, а у лицевой стороны справа внизу пусто — поэтому считаем только правую
  // половину (x 0,5–0,94): для каждой строки картинки — доля её столбцов, где есть тёмный пиксель.
  const rx0 = px(0.5);
  const rx1 = px(0.94);
  const rowCover = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = rx0; x < rx1; x++) if (mask.data[y * w + x] === 0) c++;
    rowCover[y] = c / Math.max(1, rx1 - rx0);
  }
  // Три строки с шагом MRZ — со сдвигом до ±0,05 высоты (рамка карты бывает с краем стола или тенью).
  const reach = Math.max(1, Math.round(0.02 * h));
  let mrz = 0;
  for (let shift = -Math.round(0.05 * h); shift <= Math.round(0.03 * h); shift++) {
    const lines = MRZ_LINES_Y.map((cy) => {
      const c = Math.round(cy * h) + shift;
      let best = 0;
      for (let y = Math.max(0, c - reach); y <= Math.min(h - 1, c + reach); y++) best = Math.max(best, rowCover[y]);
      return best;
    });
    mrz = Math.max(mrz, Math.min(...lines));
  }

  // Штрихкод в углу x 0,04–0,36, y 0,02–0,14: средние по столбцам у полос резко скачут от столбца к столбцу (даже
  // размытые), у текста усреднение по высоте скачки сглаживает; делим на вертикальные перепады (у полос их нет).
  const bx0 = px(0.04);
  const bx1 = px(0.36);
  const by0 = py(0.02);
  const by1 = Math.max(by0 + 1, py(0.14));
  const columns = new Float32Array(bx1 - bx0 + 1);
  let gy = 0;
  for (let x = bx0; x <= bx1; x++) {
    let s = 0;
    for (let y = by0; y < by1; y++) {
      s += data[y * w + x];
      gy += Math.abs(data[(y + 1) * w + x] - data[y * w + x]);
    }
    columns[x - bx0] = s / (by1 - by0);
  }
  let gx = 0;
  for (let i = 1; i < columns.length; i++) gx += Math.abs(columns[i] - columns[i - 1]);
  const n = (bx1 - bx0) * (by1 - by0);

  // Фото: средняя яркость области x 0,05–0,32, y 0,30–0,62 против фона (90-й перцентиль яркости карты).
  let sum = 0;
  let count = 0;
  for (let y = py(0.3); y < py(0.62); y++) {
    for (let x = px(0.05); x < px(0.32); x++) {
      sum += data[y * w + x];
      count++;
    }
  }
  const background = Math.max(1, percentile(data, 0.9));

  return {
    mrz,
    // gx — по одной строке средних, gy — по всем строкам: приводим к одному масштабу (на столбец).
    barcode: gx / (bx1 - bx0) / (gy / Math.max(1, n) + 2),
    photo: count ? Math.max(0, (background - sum / count) / background) : 0,
  };
}

/** Догадка о стороне и положении карты. img — карта после поворота из настроек; «стоймя» — пробуем 90° и 270°. */
export function guessLayout(img: Gray): LayoutGuess {
  const turns: [Rotation, Rotation] = img.height > img.width ? [90, 270] : [0, 180];
  const features: [LayoutFeatures, LayoutFeatures] = [layoutFeatures(rotateGray(img, turns[0])), layoutFeatures(rotateGray(img, turns[1]))];
  // Положение: левый верх и левая середина выражены сильнее там, где карта стоит ровно.
  const score = features.map((f) => f.barcode + 2 * f.photo);
  const sure = Math.abs(score[0] - score[1]) >= ORIENT_MIN;
  const i = sure && score[1] > score[0] ? 1 : 0;
  // Сторона: три строки MRZ внизу — оборот; нет их, а положение понятно — лицевая.
  const side = features[i].mrz >= MRZ_MIN ? 'back' : sure ? 'front' : null;
  return { side, turn: turns[i], turns, features };
}
