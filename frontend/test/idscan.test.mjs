// Юнит-тесты распознавания удостоверения (src/idscan) — чистая логика, без браузера.
//   npm test
// Node 22.18+ сам снимает типы с .ts-файлов, поэтому модули импортируются напрямую.
// ИИН здесь выдуманные (контрольная цифра посчитана), настоящих данных в тестах нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDates, findIins, iinCheckDigit, nextStreak, parseIin, randomIin } from '../src/idscan/iin.ts';
import { adaptiveThreshold, applyThreshold, otsuThreshold, stretchContrast, toGray } from '../src/idscan/image.ts';
import { CARD_ASPECT, defaultCardRect, zoneOnFrame } from '../src/idscan/layout.ts';

const withCheck = (first11) => {
  const check = iinCheckDigit(first11);
  assert.notEqual(check, null, `для ${first11} контрольная цифра не существует — возьмите другой номер`);
  return first11 + check;
};

test('ИИН: контрольная цифра, век, пол, дата рождения', () => {
  assert.deepEqual(parseIin('850320300125'), { iin: '850320300125', birthDate: '20.03.1985', male: true });
  assert.deepEqual(parseIin('901125400770'), { iin: '901125400770', birthDate: '25.11.1990', male: false });
  assert.deepEqual(parseIin('000122500343'), { iin: '000122500343', birthDate: '22.01.2000', male: true });
  assert.deepEqual(parseIin('051110601235'), { iin: '051110601235', birthDate: '10.11.2005', male: false });
  // Код века 1 — XIX век.
  assert.equal(parseIin(withCheck('65071710008'))?.birthDate, '17.07.1865');
});

test('ИИН: отбраковка', () => {
  assert.equal(parseIin('850320300124'), null, 'неверная контрольная цифра');
  assert.equal(parseIin('85032030012'), null, '11 цифр');
  assert.equal(parseIin('8503203001255'), null, '13 цифр');
  assert.equal(parseIin('85032030012a'), null, 'буква');
  assert.equal(parseIin(withCheck('85032000012')), null, 'код века 0');
  assert.equal(parseIin(withCheck('85032070012')), null, 'код века 7');
  assert.equal(parseIin(withCheck('85132030012')), null, '13-й месяц');
  assert.equal(parseIin(withCheck('85023030012')), null, '30 февраля');
  assert.equal(parseIin('051110601235', new Date(2005, 10, 9)), null, 'дата рождения в будущем');
});

test('ИИН: контрольная цифра по второму набору весов', () => {
  // Ищем номер, у которого первый набор весов даёт 10, — тогда работает второй.
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  for (let serial = 0; serial < 10000; serial++) {
    const first11 = `8503203${String(serial).padStart(4, '0')}`;
    if (w1.reduce((s, w, i) => s + w * Number(first11[i]), 0) % 11 !== 10) continue;
    const check = iinCheckDigit(first11);
    if (check === null) continue;
    assert.ok(parseIin(first11 + check));
    return;
  }
  assert.fail('не нашли номер для второго набора весов');
});

test('поиск ИИН в тексте распознавания', () => {
  assert.deepEqual(findIins('850320300125').map((i) => i.iin), ['850320300125']);
  // Подпись и мусор вокруг, буквы вместо цифр, разрывы пробелами, лишние цифры по краям.
  assert.deepEqual(findIins('KCH/MMH 850320300125\n').map((i) => i.iin), ['850320300125']);
  assert.deepEqual(findIins('85O32O3OO125').map((i) => i.iin), ['850320300125']);
  assert.deepEqual(findIins('8503 2030 0125').map((i) => i.iin), ['850320300125']);
  assert.deepEqual(findIins('7850320300125').map((i) => i.iin), ['850320300125']);
  assert.deepEqual(findIins('ЖСН/ИИН 1850320300125 ').map((i) => i.iin), ['850320300125']);
  // Ничего похожего — пусто; неверная контрольная — пусто.
  assert.deepEqual(findIins('ТЕГІ / ФАМИЛИЯ\nЕРЖАН'), []);
  assert.deepEqual(findIins('850320300124'), []);
  // Два ИИН в тексте — оба, по порядку, без повторов.
  assert.deepEqual(findIins('901125400770\n850320300125\n901125400770').map((i) => i.iin), ['901125400770', '850320300125']);
  // Слова из букв не превращаются в цифры.
  assert.deepEqual(findIins('ISSO BOOZ'), []);
});

test('даты рождения в тексте', () => {
  assert.deepEqual(findDates('20.03.1985'), ['20.03.1985']);
  assert.deepEqual(findDates('20,03.1985'), ['20.03.1985']);
  assert.deepEqual(findDates('20. 03. 1985'), ['20.03.1985']);
  assert.deepEqual(findDates('2003.1985'), ['20.03.1985']);
  assert.deepEqual(findDates('31.02.1990'), [], 'такой даты нет');
  assert.deepEqual(findDates('850320300125'), [], 'не из цифр ИИН');
  assert.deepEqual(findDates('ТУҒАН КҮНІ 20.03.1985 ЖСН 850320300125'), ['20.03.1985']);
});

test('подтверждение двумя чтениями подряд', () => {
  let s = { iin: null, count: 0 };
  s = nextStreak(s, '850320300125');
  assert.deepEqual(s, { iin: '850320300125', count: 1 });
  s = nextStreak(s, '850320300125');
  assert.deepEqual(s, { iin: '850320300125', count: 2 });
  s = nextStreak(s, '901125400770');
  assert.deepEqual(s, { iin: '901125400770', count: 1 });
  s = nextStreak(s, null);
  assert.deepEqual(s, { iin: null, count: 0 });
});

test('случайный ИИН для тестовой карты всегда корректный', () => {
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 500; i++) {
    const info = randomIin(random);
    assert.deepEqual(parseIin(info.iin), info);
  }
});

// ─── Картинка ────────────────────────────────────────────────────────────────
const gray = (width, height, fill) => {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return { data, width, height };
};

test('серый из RGBA', () => {
  const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1);
  assert.deepEqual([...g.data], [255, 0, 76]);
});

test('порог Оцу делит текст и фон', () => {
  // Фон ~200, «текст» ~60.
  const img = gray(40, 10, (x) => (x % 5 === 0 ? 60 : 200));
  const t = otsuThreshold(img);
  assert.ok(t >= 60 && t < 200, `порог ${t}`);
  applyThreshold(img, t);
  assert.equal(img.data[0], 0);
  assert.equal(img.data[1], 255);
});

test('растяжка контраста', () => {
  const img = gray(100, 1, (x) => 100 + x); // 100..199
  stretchContrast(img);
  assert.ok(img.data[0] < 10 && img.data[99] > 245, `${img.data[0]}..${img.data[99]}`);
  const flat = gray(10, 1, () => 128);
  stretchContrast(flat);
  assert.equal(flat.data[0], 128, 'однотонную не трогаем');
});

test('адаптивный порог держит неровный свет', () => {
  // Фон светлеет слева направо (блик), тёмные штрихи на 70 % яркости фона в каждом месте.
  const bg = (x) => 90 + x;
  const img = gray(160, 40, (x, y) => (x % 20 < 3 && y > 10 && y < 30 ? bg(x) * 0.7 : bg(x)));
  const global = gray(160, 40, (x, y) => img.data[y * 160 + x]);
  applyThreshold(global, otsuThreshold(global));
  assert.equal(global.data[20 * 160 + 5], 0, 'общий порог Оцу на тёмном краю съедает фон');
  adaptiveThreshold(img);
  const strokesLeft = img.data[20 * 160 + 0];
  const strokesRight = img.data[20 * 160 + 140];
  const bgRight = img.data[20 * 160 + 150];
  assert.equal(strokesLeft, 0);
  assert.equal(strokesRight, 0);
  assert.equal(bgRight, 255);
});

// ─── Геометрия ───────────────────────────────────────────────────────────────
const close = (a, b) => Object.keys(b).forEach((k) => assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} ≠ ${b[k]}`));

test('зона на кадре при повороте карты', () => {
  const card = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
  const zone = { x: 0.1, y: 0.8, w: 0.3, h: 0.1 };
  close(zoneOnFrame(card, zone, 0), { x: 0.15, y: 0.52, w: 0.15, h: 0.04 });
  // Вверх ногами — зона в противоположном углу.
  close(zoneOnFrame(card, zone, 180), { x: 0.1 + 0.6 * 0.5, y: 0.2 + 0.1 * 0.4, w: 0.15, h: 0.04 });
  // На 90°: на кадре карта лежит повёрнутой против часовой, её низ (y 0,8–0,9) — у правого края вырезки.
  close(zoneOnFrame(card, zone, 90), { x: 0.1 + 0.8 * 0.5, y: 0.2 + 0.6 * 0.4, w: 0.1 * 0.5, h: 0.3 * 0.4 });
  close(zoneOnFrame(card, zone, 270), { x: 0.1 + 0.1 * 0.5, y: 0.2 + 0.1 * 0.4, w: 0.1 * 0.5, h: 0.3 * 0.4 });
});

test('рамка по умолчанию — пропорции ID-1 по центру', () => {
  const r = defaultCardRect(1920, 1080);
  close({ a: (r.w * 1920) / (r.h * 1080) }, { a: CARD_ASPECT });
  close({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 }, { cx: 0.5, cy: 0.5 });
  const tall = defaultCardRect(640, 480, 90);
  close({ a: (tall.w * 640) / (tall.h * 480) }, { a: 1 / CARD_ASPECT });
  assert.ok(tall.h <= 0.9 + 1e-9);
});
