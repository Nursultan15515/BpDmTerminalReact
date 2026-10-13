// Подготовка вырезки к распознаванию: оттенки серого → растяжка контраста → (по выбору) бинаризация.
// Чистые функции над пикселями, без DOM — их проверяют юнит-тесты в Node.

/** Одноканальная картинка 0..255, строка за строкой. */
export interface Gray {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) {
    data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { data, width, height };
}

export function grayToRgba(img: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.data.length * 4);
  for (let i = 0, j = 0; i < img.data.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = img.data[i];
    out[j + 3] = 255;
  }
  return out;
}

function histogram(img: Gray): Uint32Array {
  const hist = new Uint32Array(256);
  for (const v of img.data) hist[v]++;
  return hist;
}

/** Растяжка контраста по перцентилям: самые тёмные lo — в 0, самые светлые (1 − hi) — в 255. */
export function stretchContrast(img: Gray, lo = 0.02, hi = 0.98): void {
  const hist = histogram(img);
  const n = img.data.length;
  let dark = 0;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * lo) { dark = v; break; }
  }
  let light = 255;
  for (let v = 255, acc = 0; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * (1 - hi)) { light = v; break; }
  }
  if (light - dark < 8) return; // почти однотонная картинка — растягивать нечего
  const k = 255 / (light - dark);
  for (let i = 0; i < n; i++) img.data[i] = (img.data[i] - dark) * k; // Uint8ClampedArray сам обрежет до 0..255
}

/** Порог Оцу: делит гистограмму на «текст» и «фон» с максимальной межклассовой дисперсией. */
export function otsuThreshold(img: Gray): number {
  const hist = histogram(img);
  const total = img.data.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * hist[v];
  let sumDark = 0;
  let countDark = 0;
  let best = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    countDark += hist[t];
    if (countDark === 0) continue;
    const countLight = total - countDark;
    if (countLight === 0) break;
    sumDark += t * hist[t];
    const between = countDark * countLight * (sumDark / countDark - (sumAll - sumDark) / countLight) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Всё не светлее порога — чёрное, остальное — белое. */
export function applyThreshold(img: Gray, threshold: number): void {
  for (let i = 0; i < img.data.length; i++) img.data[i] = img.data[i] > threshold ? 255 : 0;
}

/**
 * Адаптивный порог (Брэдли): пиксель темнее среднего по окну на долю k — чёрный.
 * В отличие от Оцу, выдерживает неровный свет и блик на части вырезки.
 */
export function adaptiveThreshold(img: Gray, windowSize = Math.max(15, Math.round(img.height / 2)), k = 0.15): void {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += data[(y - 1) * w + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
    }
  }
  const r = Math.floor(windowSize / 2);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = data[y * w + x] < mean * (1 - k) ? 0 : 255;
    }
  }
  data.set(out);
}
