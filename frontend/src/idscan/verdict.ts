import type { IinInfo } from './iin.ts';
import type { MrzInfo } from './mrz.ts';

// Какой ИИН принять из всего, что нашлось на кадре. Неверный ИИН опаснее промаха (может найти чужой
// пропуск), поэтому принимаем только то, что сошлось со всем прочитанным, а остальное показываем с причиной.
// Модуль без DOM — проверяется юнит-тестами в Node.

export type Side = 'front' | 'back';

/**
 * Даты (ДД.ММ.ГГГГ) сходятся по дню, месяцу и двум последним цифрам года — тому, что записано в самом ИИН (ГГММДД).
 * Век в ИИН — отдельно, 7-й цифрой, а первые цифры печатного года на мелкой карте читаются хуже всего (1955 → 1855).
 */
export const sameDob = (a: string, b: string) => a.slice(0, 6) === b.slice(0, 6) && a.slice(-2) === b.slice(-2);

export interface Verdict {
  iin: IinInfo | null;
  /** Откуда принятый ИИН: лицевая сторона или MRZ на обороте. */
  side: Side | null;
  /** MRZ, из которой взят ИИН. */
  mrz: MrzInfo | null;
  /** Дата рождения, прочитанная на карте (лицевая сторона) или в MRZ; null — не прочиталась. */
  cardDob: string | null;
  rejected: { iin: IinInfo; reason: string }[];
}

/**
 * front — ИИН, найденные как текст (лицевая сторона); dates — даты, прочитанные на карте; mrz — разобранные MRZ.
 * Порядок доверия: MRZ с сошедшейся общей контрольной цифрой (ИИН проверен целиком) → лицевая сторона →
 * MRZ без второй строки.
 */
export function decide(front: IinInfo[], dates: string[], mrz: MrzInfo[]): Verdict {
  const rejected: Verdict['rejected'] = [];

  const mrzOk: MrzInfo[] = [];
  for (const m of mrz) {
    if (m.birthDate !== null && !sameDob(m.birthDate, m.iin.birthDate)) {
      rejected.push({ iin: m.iin, reason: `дата рождения в MRZ — ${m.birthDate}` });
    } else if (m.composite === false) {
      rejected.push({ iin: m.iin, reason: 'не сошлась общая контрольная цифра MRZ' });
    } else {
      mrzOk.push(m);
    }
  }

  // Лицевая сторона: дата рождения на карте прочитана — принимаем только ИИН с той же датой внутри.
  const frontOk = dates.length === 0 ? front : front.filter((c) => dates.some((d) => sameDob(d, c.birthDate)));
  for (const c of front) {
    if (!frontOk.includes(c)) rejected.push({ iin: c, reason: `дата рождения на карте — ${dates.join(', ')}` });
  }

  const verified = mrzOk.find((m) => m.composite === true);
  const pick: { iin: IinInfo; side: Side; mrz: MrzInfo | null } | null = verified
    ? { iin: verified.iin, side: 'back', mrz: verified }
    : frontOk[0]
      ? { iin: frontOk[0], side: 'front', mrz: null }
      : mrzOk[0]
        ? { iin: mrzOk[0].iin, side: 'back', mrz: mrzOk[0] }
        : null;

  const cardDob =
    pick?.mrz?.birthDate ??
    dates.find((d) => front.some((c) => sameDob(d, c.birthDate))) ??
    dates[0] ??
    mrz.find((m) => m.birthDate !== null)?.birthDate ??
    null;

  return {
    iin: pick?.iin ?? null,
    side: pick?.side ?? null,
    mrz: pick?.mrz ?? null,
    cardDob,
    // Тот же ИИН, принятый другим путём (например, цифры MRZ, найденные как текст), в отброшенных не показываем.
    rejected: rejected.filter((r, i) => r.iin.iin !== pick?.iin.iin && rejected.findIndex((x) => x.iin.iin === r.iin.iin) === i),
  };
}
