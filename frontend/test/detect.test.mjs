// Юнит-тесты поиска карты на кадре (src/idscan/detect.ts) — синтетические серые кадры, без браузера.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCard } from '../src/idscan/detect.ts';

const W = 320;
const H = 240;

// Кадр: фон, карта (x, y, w, h в пикселях) с тёмными строками текста и чипом; noise — шум фона (древесина).
function frame({ bg = 80, card = 220, x = 60, y = 50, w = 160, h = 101, ink = 40, noise = 0 } = {}) {
  const data = new Uint8ClampedArray(W * H);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      let v = bg + (noise ? (rand() - 0.5) * noise : 0);
      if (px >= x && px < x + w && py >= y && py < y + h) {
        v = card;
        const u = (px - x) / w;
        const t = (py - y) / h;
        // Три строки MRZ внизу и чип слева.
        if (u > 0.05 && u < 0.95 && [0.7, 0.8, 0.9].some((l) => Math.abs(t - l) < 0.025)) v = ink;
        if (u > 0.08 && u < 0.24 && t > 0.3 && t < 0.55) v = 150;
      }
      data[py * W + px] = v;
    }
  }
  return { data, width: W, height: H };
}

const near = (rect, x, y, w, h) => {
  const tol = 3;
  assert.ok(Math.abs(rect.x * W - x) <= tol && Math.abs(rect.y * H - y) <= tol, `угол ${rect.x * W},${rect.y * H}`);
  assert.ok(Math.abs(rect.w * W - w) <= tol && Math.abs(rect.h * H - h) <= tol, `размер ${rect.w * W}×${rect.h * H}`);
};

test('светлая карта на тёмном столе — находится, текст и чип не мешают', () => {
  const rect = findCard(frame({ noise: 30 }));
  assert.ok(rect);
  near(rect, 60, 50, 160, 101);
});

test('карта темнее фона (белый стол) — находится по обратной полярности', () => {
  const rect = findCard(frame({ bg: 235, card: 150, ink: 30 }));
  assert.ok(rect);
  near(rect, 60, 50, 160, 101);
});

test('карта стоймя (повёрнута на 90°) — тоже карта', () => {
  const rect = findCard(frame({ x: 120, y: 40, w: 101, h: 160 }));
  assert.ok(rect);
  near(rect, 120, 40, 101, 160);
});

test('карта, обрезанная краем кадра, и кадр без карты — null', () => {
  assert.equal(findCard(frame({ x: 0, y: 50 })), null);
  assert.equal(findCard(frame({ w: 0, h: 0, noise: 40 })), null);
  // Квадрат — не карта.
  assert.equal(findCard(frame({ w: 120, h: 120 })), null);
});
