// Юнит-тесты догадки о стороне и положении карты (src/idscan/orient.ts) — синтетические серые карты, без браузера.
//   npm test
// Раскладка — как у удостоверения образца 2021 года; пороги подобраны по снимкам настоящих карт.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLayout, rotateGray } from '../src/idscan/orient.ts';

const W = 256;
const H = 161;

function card(side) {
  const data = new Uint8ClampedArray(W * H).fill(225);
  const rect = (x0, y0, x1, y1, v) => {
    for (let y = Math.round(y0 * H); y < Math.round(y1 * H); y++) for (let x = Math.round(x0 * W); x < Math.round(x1 * W); x++) data[y * W + x] = v;
  };
  // Строка «текста»: знаки шириной 70 % шага.
  const text = (x0, x1, y0, y1, pitch, v = 40) => {
    for (let x = x0; x + pitch * 0.7 <= x1; x += pitch) rect(x, y0, x + pitch * 0.7, y1, v);
  };
  if (side === 'back') {
    for (let x = 0.06; x < 0.36; x += 0.012) rect(x, 0.04, x + 0.005, 0.13, 30); // штрихкод
    text(0.67, 0.94, 0.07, 0.12, 0.028); // номер документа
    rect(0.08, 0.35, 0.22, 0.55, 150); // чип
    for (const y of [0.22, 0.33, 0.44, 0.55]) text(0.24, 0.62, y, y + 0.04, 0.025);
    for (const cy of [0.685, 0.787, 0.89]) text(0.06, 0.95, cy - 0.022, cy + 0.022, 0.0297, 35); // MRZ
  } else {
    for (const y of [0.07, 0.12]) {
      text(0.06, 0.44, y, y + 0.03, 0.025, 45);
      text(0.58, 0.95, y, y + 0.03, 0.025, 45);
    }
    rect(0.47, 0.03, 0.55, 0.18, 120); // герб
    rect(0.036, 0.272, 0.335, 0.857, 110); // фото
    rect(0.12, 0.35, 0.25, 0.55, 60);
    for (const y of [0.35, 0.45]) text(0.376, 0.55, y, y + 0.04, 0.025);
    text(0.376, 0.52, 0.78, 0.81, 0.016); // дата рождения
    text(0.135, 0.36, 0.916, 0.954, 0.019, 30); // ИИН
  }
  return { data, width: W, height: H };
}

const guess = (img) => {
  const g = guessLayout(img);
  return `${g.side}:${g.turn}`;
};

test('поворот серой картинки: четыре раза по 90° и два по 180° — исходная', () => {
  const img = card('back');
  let r = img;
  for (let i = 0; i < 4; i++) r = rotateGray(r, 90);
  assert.deepEqual([...r.data], [...img.data]);
  assert.deepEqual([...rotateGray(rotateGray(img, 180), 180).data], [...img.data]);
  assert.deepEqual([...rotateGray(rotateGray(img, 90), 270).data], [...img.data]);
  assert.equal(rotateGray(img, 90).width, H);
});

test('оборот: ровно, вверх ногами и стоймя', () => {
  const back = card('back');
  assert.equal(guess(back), 'back:0');
  assert.equal(guess(rotateGray(back, 180)), 'back:180');
  // Повёрнута на 90° по часовой — ставить ровно надо ещё на 270°, и наоборот.
  assert.equal(guess(rotateGray(back, 90)), 'back:270');
  assert.equal(guess(rotateGray(back, 270)), 'back:90');
});

test('лицевая: ровно и вверх ногами', () => {
  const front = card('front');
  assert.equal(guess(front), 'front:0');
  assert.equal(guess(rotateGray(front, 180)), 'front:180');
});

test('пустая карта — сторона не ясна, положение как есть', () => {
  const blank = { data: new Uint8ClampedArray(W * H).fill(225), width: W, height: H };
  assert.equal(guess(blank), 'null:0');
});
