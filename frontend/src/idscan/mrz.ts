import { parseIin, type IinInfo } from './iin.ts';

// MRZ на обороте удостоверения РК — ICAO 9303, формат TD1, 3 строки по 30 символов:
//   1: ID KAZ <номер документа, 9> <контр.> <ИИН, 12> <<<
//   2: <рождение ГГММДД> <контр.> <пол> <срок ГГММДД> <контр.> KAZ <11 «<»> <общая контрольная>
//   3: ФАМИЛИЯ<<ИМЯ
// ИИН — в дополнительных данных строки 1, и его покрывает общая контрольная цифра строки 2. Поэтому здесь
// ловится и ошибка в 11-й цифре ИИН, которую не видит его собственная контрольная цифра (вес 11 ≡ 0 mod 11).
// Модуль без DOM — проверяется юнит-тестами в Node.

export interface MrzInfo {
  documentNumber: string;
  /** Контрольная цифра номера документа сошлась; false — номер прочитан с ошибкой, ИИН взят по его месту в строке. */
  documentChecked: boolean;
  iin: IinInfo;
  /** Дата рождения из строки 2, ДД.ММ.ГГГГ; null — строка 2 не прочиталась. */
  birthDate: string | null;
  /** Срок действия из строки 2, ДД.ММ.ГГГГ. */
  expiry: string | null;
  sex: 'M' | 'F' | null;
  /** Общая контрольная цифра: true — сошлась (ИИН подтверждён целиком), false — нет, null — не прочиталась. */
  composite: boolean | null;
}

/** Алфавит MRZ — для whitelist распознавания. */
export const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

const charValue = (ch: string) => (ch === '<' ? 0 : ch <= '9' ? Number(ch) : ch.charCodeAt(0) - 55);

/** Контрольная цифра MRZ: веса 7-3-1, цифры — как есть, A..Z — 10..35, «<» — 0. */
export function mrzCheckDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += charValue(field[i]) * [7, 3, 1][i % 3];
  return sum % 10;
}

/** Строка MRZ из текста распознавания: верхний регистр, без пробелов; «« и ‹ — это <. */
export function cleanMrzLine(line: string): string {
  return line.toUpperCase().replace(/«/g, '<<').replace(/‹/g, '<').replace(/[^A-Z0-9<]/g, '');
}

// Буквы, которые распознавание выдаёт вместо цифр. Применяем только к цифровым полям MRZ.
const AS_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', C: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
const toDigits = (s: string) => [...s].map((ch) => AS_DIGIT[ch] ?? ch).join('');
const isDigits = (s: string) => /^\d+$/.test(s);
const dmy = (yymmdd: string, century: number) => `${yymmdd.slice(4, 6)}.${yymmdd.slice(2, 4)}.${century + Number(yymmdd.slice(0, 2))}`;

interface Line1 {
  documentNumber: string;
  check: string;
  checked: boolean;
  iin: IinInfo;
}

/** Строка 1: номер документа (контрольная цифра сходится) и за ним корректный ИИН. */
function parseLine1(line: string, today: Date): Line1 | null {
  for (let i = 0; i + 22 <= line.length; i++) {
    const documentNumber = toDigits(line.slice(i, i + 9));
    const check = toDigits(line[i + 9]);
    const iinText = toDigits(line.slice(i + 10, i + 22));
    if (!isDigits(documentNumber + check + iinText) || mrzCheckDigit(documentNumber) !== Number(check)) continue;
    const iin = parseIin(iinText, today);
    if (iin) return { documentNumber, check, checked: true, iin };
  }
  // Номер документа прочитан с ошибкой, но начало строки узнаётся («KAZ» в первых знаках) — ИИН берём с его места:
  // после «KAZ» 9 знаков номера и контрольная, затем 12 цифр. Проверен такой ИИН только своей контрольной цифрой.
  const anchor = /K[A4][Z2]/.exec(line.slice(0, 7));
  if (anchor) {
    const k = anchor.index + 3;
    const iin = parseIin(toDigits(line.slice(k + 10, k + 22)), today);
    if (iin) return { documentNumber: toDigits(line.slice(k, k + 9)), check: toDigits(line[k + 9] ?? ''), checked: false, iin };
  }
  return null;
}

interface Line2 {
  dob: string;
  dobCheck: string;
  sex: 'M' | 'F' | null;
  expiry: string;
  expiryCheck: string;
  composite: number | null;
}

/** Даты строки 2 (дата рождения и срок действия — каждая со своей контрольной цифрой). */
function line2Dates(dobText: string, dobCheckText: string, expiryText: string, expiryCheckText: string) {
  const [dob, dobCheck, expiry, expiryCheck] = [dobText, dobCheckText, expiryText, expiryCheckText].map(toDigits);
  if (dob.length !== 6 || expiry.length !== 6 || !isDigits(dob + dobCheck + expiry + expiryCheck)) return null;
  if (mrzCheckDigit(dob) !== Number(dobCheck) || mrzCheckDigit(expiry) !== Number(expiryCheck)) return null;
  return { dob, dobCheck, expiry, expiryCheck };
}

// Общая контрольная — последний знак строки, после «KAZ» и 11 заполнителей. Хвост ровно такой длины — значит,
// последний знак точно цифра, и букву-двойника (O, C…) переводим в цифру. Длина другая (заполнители потеряны или
// прибавились) — верим только настоящей цифре: буква тогда может оказаться и заполнителем «<», прочитанным как L или C,
// а это «не прочиталась», а не «не сошлась».
const compositeOf = (tail: string) => {
  const last = tail.length === 12 ? toDigits(tail.slice(-1)) : tail.slice(-1);
  return /^\d$/.test(last) ? Number(last) : null;
};

/**
 * Строка 2: дата рождения, пол, срок действия, общая контрольная. Ищем от кода страны «KAZ» назад — так не мешают
 * ни потерянный знак пола, ни лишние или потерянные заполнители после «KAZ».
 */
function parseLine2(line: string): Line2 | null {
  for (let k = line.indexOf('KAZ'); k >= 14; k = line.indexOf('KAZ', k + 1)) {
    const before = line.slice(0, k);
    const sexChar = before[before.length - 8];
    const withSex = sexChar === 'M' || sexChar === 'F' || sexChar === '<';
    const dates = withSex
      ? line2Dates(before.slice(-15, -9), before[before.length - 9], before.slice(-7, -1), before.slice(-1))
      : line2Dates(before.slice(-14, -8), before[before.length - 8], before.slice(-7, -1), before.slice(-1));
    if (dates) return { ...dates, sex: sexChar === 'M' || sexChar === 'F' ? sexChar : null, composite: compositeOf(line.slice(k + 3)) };
  }
  // «KAZ» не прочитался — по позициям от начала строки.
  for (let i = 0; i + 15 <= line.length; i++) {
    const dates = line2Dates(line.slice(i, i + 6), line[i + 6], line.slice(i + 8, i + 14), line[i + 14]);
    const sexChar = line[i + 7];
    if (dates) return { ...dates, sex: sexChar === 'M' || sexChar === 'F' ? sexChar : null, composite: compositeOf(line.slice(i + 18)) };
  }
  return null;
}

/** Все MRZ удостоверения РК, найденные в тексте распознавания (строки 1 и, если есть, 2 — подряд). */
export function findMrz(text: string, today = new Date()): MrzInfo[] {
  const lines = text.split(/\r?\n/).map(cleanMrzLine).filter((l) => l.length >= 15);
  const found: MrzInfo[] = [];
  lines.forEach((line, n) => {
    const l1 = parseLine1(line, today);
    if (!l1 || found.some((f) => f.iin.iin === l1.iin.iin)) return;
    // Строка 2 — одна из двух следующих (распознавание иногда вставляет пустую или мусорную строку).
    const l2 = lines.slice(n + 1, n + 3).map(parseLine2).find((l) => l !== null) ?? null;
    const year = Number(l1.iin.birthDate.slice(6));
    let composite: boolean | null = null;
    // Номер документа прочитан с ошибкой — общая контрольная не сойдётся из-за него, об ИИН она тогда ничего не скажет.
    if (l2 && l2.composite !== null && l1.checked) {
      // Поля строки 1 с 6-й позиции (номер, контрольная, ИИН и три заполнителя) + даты строки 2 + 11 заполнителей.
      const field = `${l1.documentNumber}${l1.check}${l1.iin.iin}<<<${l2.dob}${l2.dobCheck}${l2.expiry}${l2.expiryCheck}${'<'.repeat(11)}`;
      composite = mrzCheckDigit(field) === l2.composite;
    }
    found.push({
      documentNumber: l1.documentNumber,
      documentChecked: l1.checked,
      iin: l1.iin,
      birthDate: l2 ? dmy(l2.dob, year - (year % 100)) : null,
      expiry: l2 ? dmy(l2.expiry, 2000) : null,
      sex: l2?.sex ?? null,
      composite,
    });
  });
  return found;
}

/** Строка 1 и 2 MRZ по данным — для синтетической тестовой карты. */
export function makeMrz(documentNumber: string, iin: IinInfo, expiry: string, surname: string, name: string): string[] {
  const docCheck = mrzCheckDigit(documentNumber);
  const dob = iin.iin.slice(0, 6);
  const [d, m, y] = expiry.split('.');
  const exp = `${y.slice(2)}${m}${d}`;
  const line1 = `IDKAZ${documentNumber}${docCheck}${iin.iin}<<<`;
  const head2 = `${dob}${mrzCheckDigit(dob)}${iin.male ? 'M' : 'F'}${exp}${mrzCheckDigit(exp)}KAZ${'<'.repeat(11)}`;
  const composite = mrzCheckDigit(`${line1.slice(5)}${head2.slice(0, 7)}${head2.slice(8, 15)}${head2.slice(18, 29)}`);
  const line3 = `${surname}<<${name}`.padEnd(30, '<').slice(0, 30);
  return [line1, `${head2}${composite}`, line3];
}
