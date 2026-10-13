// Геометрия удостоверения РК (формат ID-1, 85,6 × 54 мм) и зоны распознавания на лицевой стороне.
// Без DOM и без импортов — проверяется юнит-тестами в Node.

/** Прямоугольник в долях (0..1): кадра — для рамки карты, карты — для зон. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** На сколько градусов по часовой повернуть вырезанную карту, чтобы она встала ровно. */
export type Rotation = 0 | 90 | 180 | 270;

export const CARD_ASPECT = 85.6 / 54;

// Зоны сняты с удостоверения образца 2021 года и взяты с запасом на неточную укладку карты.
// Лицевая сторона: ИИН — x 0,135–0,36, y 0,916–0,954 (внизу слева под фото); дата рождения — x 0,376–0,525,
// y 0,779–0,811. Подпись «ЖСН/ИИН» (x < 0,111) частично попадает в зону — лишние цифры по краям отбрасывает
// поиск ИИН (findIins). Оборот: три строки MRZ — x 0,06–0,95, y 0,65–0,89.
export const ZONES: Record<'iin' | 'dob' | 'mrz', Rect> = {
  iin: { x: 0.1, y: 0.875, w: 0.36, h: 0.11 },
  dob: { x: 0.34, y: 0.745, w: 0.28, h: 0.1 },
  mrz: { x: 0.03, y: 0.58, w: 0.95, h: 0.4 },
};

/** Где зона карты (в долях ровной карты) лежит на кадре — с учётом рамки карты и её поворота. */
export function zoneOnFrame(card: Rect, zone: Rect, rotation: Rotation): Rect {
  const { x, y, w, h } = zone;
  // Та же зона в координатах вырезки до поворота.
  const crop =
    rotation === 90 ? { x: y, y: 1 - x - w, w: h, h: w }
    : rotation === 180 ? { x: 1 - x - w, y: 1 - y - h, w, h }
    : rotation === 270 ? { x: 1 - y - h, y: x, w: h, h: w }
    : zone;
  return { x: card.x + crop.x * card.w, y: card.y + crop.y * card.h, w: crop.w * card.w, h: crop.h * card.h };
}

/** Рамка карты по умолчанию: по центру кадра, 60 % ширины, пропорции ID-1 (стоймя — при повороте на 90/270). */
export function defaultCardRect(frameWidth: number, frameHeight: number, rotation: Rotation = 0): Rect {
  const aspect = rotation === 90 || rotation === 270 ? 1 / CARD_ASPECT : CARD_ASPECT;
  let w = 0.6;
  let h = (w * frameWidth) / aspect / frameHeight;
  if (h > 0.9) {
    h = 0.9;
    w = (h * frameHeight * aspect) / frameWidth;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };
