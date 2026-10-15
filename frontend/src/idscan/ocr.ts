import { createWorker, OEM, PSM } from 'tesseract.js';

// Tesseract (WASM) в фоновом потоке. Воркер, ядро и модель отдаёт наш же сервер (плагин tesseractAssets
// в vite.config.ts): у терминалов нет интернета, а по умолчанию tesseract.js качает всё с CDN.
const BASE = `${import.meta.env.BASE_URL}tesseract/`;

export interface OcrText {
  text: string;
  confidence: number;
  ms: number;
}

/** Строка текста и её рамка на картинке, px. */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ocr {
  /** Одна строка, только символы из whitelist (цифры ИИН; цифры и точки даты; алфавит MRZ). */
  line(image: HTMLCanvasElement, whitelist: string): Promise<OcrText>;
  /** Несколько строк одним блоком (три строки MRZ), только символы из whitelist. */
  block(image: HTMLCanvasElement, whitelist: string): Promise<OcrText>;
  /** Весь текст вырезки (вся карта), без ограничений по символам, и найденные строки с рамками. */
  sparse(image: HTMLCanvasElement): Promise<OcrText & { lines: OcrLine[] }>;
  terminate(): Promise<void>;
}

/** onStatus — ход загрузки (только пока воркер стартует): этап и доля 0..1. */
export async function createOcr(onStatus?: (status: string, progress: number) => void): Promise<Ocr> {
  let loading = true;
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${BASE}worker.min.js`,
    // Каталог: воркер сам выберет ядро с SIMD или без — старые процессоры SIMD не умеют.
    corePath: `${BASE}core`,
    langPath: `${BASE}lang`,
    // Модель каждый раз с нашего сервера (кэш браузера), без копии в IndexedDB — обновление модели не залипнет.
    cacheMethod: 'none',
    logger: (m) => {
      if (loading) onStatus?.(m.status, m.progress);
    },
  });
  // Без DPI Tesseract пишет предупреждение в консоль и сам угадывает масштаб.
  await worker.setParameters({ user_defined_dpi: '300' });
  loading = false;

  let current = '';
  const recognize = async (image: HTMLCanvasElement, psm: PSM, whitelist: string, withLines: boolean) => {
    const key = `${psm}|${whitelist}`;
    if (key !== current) {
      await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
      current = key;
    }
    const t0 = performance.now();
    const { data } = await worker.recognize(image, {}, { text: true, blocks: withLines });
    const lines = (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.map((l) => ({ text: l.text.trim(), x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0 })),
      ),
    );
    return { text: data.text.trim(), confidence: Math.round(data.confidence), ms: Math.round(performance.now() - t0), lines };
  };

  return {
    line: (image, whitelist) => recognize(image, PSM.SINGLE_LINE, whitelist, false),
    block: (image, whitelist) => recognize(image, PSM.SINGLE_BLOCK, whitelist, false),
    sparse: (image) => recognize(image, PSM.SPARSE_TEXT, '', true),
    terminate: async () => {
      await worker.terminate();
    },
  };
}

let shared: Promise<Ocr> | null = null;

/**
 * Один воркер на всю страницу киоска: старт занимает секунды, поэтому его запускают заранее (экран выбора)
 * и не закрывают между посетителями — память освобождает плановая перезагрузка киоска. Не загрузился — следующий
 * вызов пробует снова.
 */
export function sharedOcr(): Promise<Ocr> {
  if (!shared) {
    const p = createOcr();
    shared = p;
    p.catch(() => {
      if (shared === p) shared = null;
    });
  }
  return shared;
}

/** Умеет ли браузер WASM SIMD (от этого зависит, какое ядро выберет воркер). Тот же тест, что у tesseract.js. */
export function wasmSimdSupported(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
    );
  } catch {
    return false;
  }
}
