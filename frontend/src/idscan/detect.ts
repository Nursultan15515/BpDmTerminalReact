import { otsuThreshold, type Gray } from './image.ts';
import { CARD_ASPECT, type Rect } from './layout.ts';

// Поиск карты на кадре — для камеры и фото, где карта лежит не там, где нарисована рамка (веб-камера, снимок
// с телефона, неточная укладка на стекло). Ищем самую «карточную» область: светлую на тёмном фоне или наоборот,
// с пропорциями ID-1, сплошную и не касающуюся края кадра. Работает по уменьшенному серому кадру (~320 px) —
// это миллисекунды. Без DOM — проверяется юнит-тестами в Node.

/** Допуск пропорций: ±25 % от ID-1 (карта под небольшим углом или с перспективой). */
const ASPECT_TOLERANCE = Math.log(1.25);

/** Карта на кадре (доли кадра) или null, если ничего похожего нет. */
export function findCard(img: Gray): Rect | null {
  const { width: w, height: h } = img;
  const threshold = otsuThreshold(img);
  // Текст и чип на карте — дыры в светлой области; «закрываем» их, иначе карта распадётся на куски.
  const radius = Math.max(1, Math.round(w / 160));
  let best: { rect: Rect; score: number } | null = null;
  for (const bright of [true, false]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = img.data[i] > threshold === bright ? 1 : 0;
    const closed = erode(dilate(mask, w, h, radius), w, h, radius);
    for (const c of components(closed, w, h)) {
      const bw = c.x1 - c.x0 + 1;
      const bh = c.y1 - c.y0 + 1;
      // Касается края кадра — это фон (стол, стекло), а не карта; карту, обрезанную кадром, всё равно не прочесть.
      if (c.x0 === 0 || c.y0 === 0 || c.x1 === w - 1 || c.y1 === h - 1) continue;
      const area = (bw * bh) / (w * h);
      if (area < 0.02) continue;
      const fill = c.spans / (bw * bh);
      if (fill < 0.8) continue;
      const aspect = bw / bh;
      const aspectError = Math.min(Math.abs(Math.log(aspect / CARD_ASPECT)), Math.abs(Math.log(aspect * CARD_ASPECT)));
      if (aspectError > ASPECT_TOLERANCE) continue;
      const score = fill * (1 - aspectError / ASPECT_TOLERANCE / 2) * Math.sqrt(area);
      if (!best || score > best.score) best = { rect: { x: c.x0 / w, y: c.y0 / h, w: bw / w, h: bh / h }, score };
    }
  }
  return best?.rect ?? null;
}

interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Площадь «по строкам»: в каждой строке — от крайнего левого до крайнего правого пикселя (дыры не в счёт). */
  spans: number;
}

/** Связные области маски (4-связность). */
function components(mask: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const rowMin = new Int32Array(h);
  const rowMax = new Int32Array(h);
  const result: Component[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    rowMin.fill(w);
    rowMax.fill(-1);
    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    let spans = 0;
    for (let y = y0; y <= y1; y++) if (rowMax[y] >= rowMin[y]) spans += rowMax[y] - rowMin[y] + 1;
    result.push({ x0, y0, x1, y1, spans });
  }
  return result;
}

/** Расширение маски квадратом (2r+1)²: по строкам, потом по столбцам. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(mask, w, h, r, 1);
}

/** Сужение маски квадратом (2r+1)². */
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(mask, w, h, r, 0);
}

// Сужение/расширение одним проходом по строкам и одним по столбцам: «есть ли в окне хоть один 1 / хоть один 0».
function morph(mask: Uint8Array, w: number, h: number, r: number, value: 0 | 1): Uint8Array {
  const pass = (src: Uint8Array, len: number, count: number, at: (i: number, k: number) => number) => {
    const out = new Uint8Array(src.length);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < len; k++) {
        let hit = false;
        for (let d = Math.max(0, k - r); d <= Math.min(len - 1, k + r) && !hit; d++) hit = src[at(i, d)] === value;
        out[at(i, k)] = hit ? value : 1 - value;
      }
    }
    return out;
  };
  const rows = pass(mask, w, h, (y, x) => y * w + x);
  return pass(rows, h, w, (x, y) => y * w + x);
}
