// ИИН РК — 12 цифр: ГГММДД — дата рождения; 7-я — век и пол (1/2 — XIX, 3/4 — XX, 5/6 — XXI век,
// нечётная — мужской); 8–11 — номер регистрации; 12-я — контрольная.
// Модуль без DOM и без импортов: его гоняют юнит-тесты прямо в Node (test/idscan.test.mjs).

export interface IinInfo {
  iin: string;
  /** Дата рождения из ИИН, ДД.ММ.ГГГГ. */
  birthDate: string;
  male: boolean;
}

const WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

/** Контрольная цифра по первым 11 цифрам; null — такой ИИН не выдаётся (остаток 10 при обоих наборах весов). */
export function iinCheckDigit(first11: string): number | null {
  const sum = (weights: number[]) => weights.reduce((s, w, i) => s + w * Number(first11[i]), 0) % 11;
  let check = sum(WEIGHTS_1);
  if (check === 10) check = sum(WEIGHTS_2);
  return check === 10 ? null : check;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Разбор ИИН: контрольная цифра, код века, настоящая и не будущая дата рождения. null — не ИИН. */
export function parseIin(value: string, today = new Date()): IinInfo | null {
  if (!/^\d{12}$/.test(value)) return null;
  if (iinCheckDigit(value.slice(0, 11)) !== Number(value[11])) return null;
  const centuryCode = Number(value[6]);
  if (centuryCode < 1 || centuryCode > 6) return null;
  const year = 1800 + 100 * Math.floor((centuryCode - 1) / 2) + Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (!isRealDate(year, month, day) || new Date(year, month - 1, day) > today) return null;
  return { iin: value, birthDate: `${pad2(day)}.${pad2(month)}.${year}`, male: centuryCode % 2 === 1 };
}

// Частые ошибки распознавания цифр. Заменяем только в «цифровых» словах, чтобы не делать цифры из подписей.
const LOOKALIKES: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', g: '9', q: '9',
};

function fixDigits(word: string): string {
  const digits = word.replace(/\D/g, '').length;
  if (digits < 2 || digits * 2 < word.length) return word;
  return [...word].map((ch) => LOOKALIKES[ch] ?? ch).join('');
}

/** Все ИИН, найденные в тексте распознавания, без повторов, в порядке появления. */
export function findIins(text: string, today = new Date()): IinInfo[] {
  const found = new Map<string, IinInfo>();
  for (const line of text.split(/\r?\n/)) {
    // Распознавание иногда рвёт число пробелами — склеиваем соседние группы цифр.
    const joined = line.split(/\s+/).map(fixDigits).join(' ').replace(/(\d) (?=\d)/g, '$1');
    for (const run of joined.match(/\d{12,}/g) ?? []) {
      // Длиннее 14 цифр — это строка MRZ (номер документа, контрольная и ИИН в конце): берём только последние 12,
      // иначе внутри номера документа найдётся случайный «корректный ИИН». Короче — ИИН с цифрой-двумя мусора
      // по краям (кусок подписи, край карты): принимаем, только если корректное окно одно.
      const windows = run.length > 14 ? [run.slice(-12)] : Array.from({ length: run.length - 11 }, (_, i) => run.slice(i, i + 12));
      const valid = windows.map((w) => parseIin(w, today)).filter((info) => info !== null);
      if (valid.length === 1 && !found.has(valid[0].iin)) found.set(valid[0].iin, valid[0]);
    }
  }
  return [...found.values()];
}

/** Настоящие даты вида ДД.ММ.ГГГГ (точку распознавание читает и как запятую, и теряет). */
export function findDates(text: string): string[] {
  const dates: string[] = [];
  for (const [, d, m, y] of text.matchAll(/(?<!\d)(\d{2})[.,]?\s?(\d{2})[.,]?\s?((?:18|19|20)\d{2})(?!\d)/g)) {
    if (isRealDate(Number(y), Number(m), Number(d))) dates.push(`${d}.${m}.${y}`);
  }
  return dates;
}

/** Серия одинаковых ИИН в распознаваниях подряд: одно чтение может быть случайным, два подряд — нет. */
export interface Streak {
  iin: string | null;
  count: number;
}

export const CONFIRM_STREAK = 2;

export function nextStreak(prev: Streak, iin: string | null): Streak {
  if (iin === null) return { iin: null, count: 0 };
  return iin === prev.iin ? { iin, count: prev.count + 1 } : { iin, count: 1 };
}

/** Случайный корректный ИИН (рождение 1950–2006) — для тестовой карты. */
export function randomIin(random: () => number = Math.random): IinInfo {
  for (;;) {
    const year = 1950 + Math.floor(random() * 57);
    const month = 1 + Math.floor(random() * 12);
    const day = 1 + Math.floor(random() * 28);
    const centuryCode = (year >= 2000 ? 5 : 3) + (random() < 0.5 ? 0 : 1);
    const serial = String(Math.floor(random() * 10000)).padStart(4, '0');
    const first11 = `${pad2(year % 100)}${pad2(month)}${pad2(day)}${centuryCode}${serial}`;
    const check = iinCheckDigit(first11);
    const info = check === null ? null : parseIin(first11 + check);
    if (info) return info;
  }
}
