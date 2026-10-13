import { randomIin, type IinInfo } from './iin';
import { CARD_ASPECT } from './layout';
import { makeMrz } from './mrz';

// Синтетическая карта для проверки распознавания без настоящих документов: раскладка удостоверения образца
// 2021 года (координаты — те же доли карты, что и зоны в layout.ts), данные выдуманные, ИИН и MRZ корректные.
// Это не документ: без герба и официальных надписей, с пометкой «ОБРАЗЕЦ», штрихкод — случайные полосы.

export type CardSide = 'front' | 'back';

export interface TestCard {
  /** PNG, data URL. */
  url: string;
  width: number;
  height: number;
  side: CardSide;
  iin: IinInfo;
}

const PEOPLE = [
  { surname: 'ТЕСТОВ', name: 'АЛИХАН', latin: ['TESTOV', 'ALIKHAN'] },
  { surname: 'ОБРАЗЦОВА', name: 'АЙГЕРІМ', latin: ['OBRAZTSOVA', 'AIGERIM'] },
  { surname: 'ПРИМЕРОВ', name: 'НҰРЛАН', latin: ['PRIMEROV', 'NURLAN'] },
  { surname: 'ПРОВЕРКИНА', name: 'ДӘМЕЛІ', latin: ['PROVERKINA', 'DAMELI'] },
];

// Базовый размер — 10 px на мм.
const W = 856;
const H = Math.round(W / CARD_ASPECT);
const FONT = 'Arial, "Helvetica Neue", sans-serif';
// Настоящая MRZ — шрифтом OCR-B: рубленый, ноль без черты. Знаки ставим с постоянным шагом сами, поэтому
// моноширинный шрифт не нужен, а у моноширинных (Consolas) ноль перечёркнут — его читают как «09».
const MRZ_FONT = `30px ${FONT}`;

const pad2 = (n: number) => String(n).padStart(2, '0');
const dmy = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx: CanvasRenderingContext2D, lightBottom: boolean) {
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.save();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#eaf6ea');
  bg.addColorStop(1, '#d9f0f6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Волнистый фон, как защитная сетка на настоящей карте, — чтобы распознаванию было не слишком легко.
  ctx.strokeStyle = 'rgba(120, 180, 200, 0.18)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = k * 14 + 10 * Math.sin(x / 45 + k * 0.7);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Светлая полоса под MRZ, как на обороте настоящей карты.
  if (lightBottom) {
    ctx.fillStyle = 'rgba(235, 248, 252, 0.75)';
    ctx.fillRect(0, 0.6 * H, W, 0.4 * H);
  }
  ctx.restore();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color = '#16191c') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(value, x * W, y * H);
}
const label = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number) => text(ctx, value, x, y, `10px ${FONT}`, '#4b5a66');

function drawFront(ctx: CanvasRenderingContext2D, iin: IinInfo, person: (typeof PEOPLE)[number]) {
  drawBackground(ctx, false);
  ctx.textAlign = 'center';
  text(ctx, 'ОБРАЗЕЦ · ТЕСТОВАЯ КАРТА', 0.5, 0.11, `bold 24px ${FONT}`, '#25456b');
  text(ctx, 'не является документом', 0.5, 0.17, `14px ${FONT}`, '#25456b');
  ctx.textAlign = 'left';

  // Фото: силуэт на сером фоне.
  const px = 0.036 * W;
  const py = 0.272 * H;
  const pw = 0.3 * W;
  const ph = 0.585 * H;
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#9fadb3';
  ctx.beginPath();
  ctx.arc(px + pw / 2, py + ph * 0.38, pw * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px + pw / 2, py + ph, pw * 0.42, ph * 0.33, 0, Math.PI, 0);
  ctx.fill();

  label(ctx, 'ТЕГІ / ФАМИЛИЯ', 0.376, 0.33);
  text(ctx, person.surname, 0.376, 0.39, `22px ${FONT}`);
  label(ctx, 'АТЫ / ИМЯ', 0.376, 0.44);
  text(ctx, person.name, 0.376, 0.5, `22px ${FONT}`);
  label(ctx, 'ӘКЕСІНІҢ АТЫ / ОТЧЕСТВО', 0.376, 0.59);
  label(ctx, 'ТУҒАН КҮНІ / ДАТА РОЖДЕНИЯ', 0.376, 0.735);
  text(ctx, iin.birthDate, 0.376, 0.811, `24px ${FONT}`);
  label(ctx, 'ЖСН / ИИН', 0.049, 0.938);
  text(ctx, iin.iin, 0.135, 0.954, `29px ${FONT}`);
}

function drawBack(ctx: CanvasRenderingContext2D, iin: IinInfo, person: (typeof PEOPLE)[number]) {
  drawBackground(ctx, true);
  // Вместо штрихкода — случайные полосы: что в настоящем, мы не знаем, и подделывать его незачем.
  ctx.fillStyle = '#16191c';
  for (let x = 0.06 * W; x < 0.36 * W; x += 3 + Math.floor(Math.random() * 4)) {
    ctx.fillRect(x, 0.05 * H, 1 + Math.floor(Math.random() * 3), 0.08 * H);
  }
  ctx.textAlign = 'center';
  text(ctx, 'ОБРАЗЕЦ', 0.5, 0.11, `bold 22px ${FONT}`, '#25456b');
  text(ctx, 'не является документом', 0.5, 0.16, `12px ${FONT}`, '#25456b');
  ctx.textAlign = 'left';

  const documentNumber = `0${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  text(ctx, documentNumber, 0.67, 0.12, `24px "Times New Roman", serif`);

  const issued = new Date(2015 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
  const expires = new Date(issued.getFullYear() + 10, issued.getMonth(), issued.getDate() - 1);
  label(ctx, 'ТУҒАН ЖЕРІ / МЕСТО РОЖДЕНИЯ', 0.24, 0.2);
  text(ctx, 'ТЕСТОВАЯ ОБЛ.', 0.24, 0.26, `20px ${FONT}`);
  label(ctx, 'ҰЛТЫ / НАЦИОНАЛЬНОСТЬ', 0.24, 0.31);
  text(ctx, 'ТЕСТ', 0.24, 0.37, `20px ${FONT}`);
  label(ctx, 'БЕРГЕН ОРГАН / ОРГАН ВЫДАЧИ', 0.24, 0.42);
  text(ctx, 'ТЕСТОВЫЙ ОРГАН', 0.24, 0.48, `20px ${FONT}`);
  label(ctx, 'БЕРІЛГЕН КҮНІ – ҚОЛДАНЫЛУ МЕРЗІМІ / ДАТА ВЫДАЧИ – СРОК ДЕЙСТВИЯ', 0.24, 0.53);
  text(ctx, `${dmy(issued)}   ${dmy(expires)}`, 0.24, 0.59, `20px ${FONT}`);

  // MRZ: 30 знаков в строке с постоянным шагом, как у OCR-B на настоящей карте.
  const lines = makeMrz(documentNumber, iin, dmy(expires), person.latin[0], person.latin[1]);
  ctx.font = MRZ_FONT;
  ctx.fillStyle = '#2a2f33';
  lines.forEach((line, n) => {
    for (let i = 0; i < line.length; i++) ctx.fillText(line[i], 0.059 * W + i * 0.0297 * W, [0.7, 0.805, 0.91][n] * H);
  });
}

/** scale — доля базового размера (мелкая карта ≈ веб-камера издалека); upsideDown — карта вверх ногами. */
export function makeTestCard(scale = 1, upsideDown = false, side: CardSide = 'front'): TestCard {
  const iin = randomIin();
  const person = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
  const width = Math.round(W * scale);
  const height = Math.round(H * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');
  // Вокруг скруглённых углов — светлое «стекло», а не прозрачность (она стала бы чёрной в сером).
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, width, height);
  if (upsideDown) {
    ctx.translate(width, height);
    ctx.rotate(Math.PI);
  }
  ctx.scale(scale, scale);
  if (side === 'front') drawFront(ctx, iin, person);
  else drawBack(ctx, iin, person);
  return { url: canvas.toDataURL('image/png'), width, height, side, iin };
}
