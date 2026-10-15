// Юнит-тесты сопоставления запомненной камеры с подключёнными (src/kiosk/cameraMatch.ts), без браузера.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceFor, findCamera } from '../src/kiosk/cameraMatch.ts';

const cam = (deviceId, label) => ({ deviceId, label });

test('по id', () => {
  const list = [cam('a', 'Logitech C270'), cam('b', 'USB2.0 PC CAMERA')];
  assert.equal(findCamera(list, { deviceId: 'b', label: 'что угодно' }), list[1]);
});

test('id сменился (новая загрузка страницы, другой порт) — по названию', () => {
  const list = [cam('new-a', 'Logitech C270'), cam('new-b', 'USB2.0 PC CAMERA')];
  assert.equal(findCamera(list, { deviceId: 'old-b', label: 'USB2.0 PC CAMERA' }), list[1]);
});

test('две одинаковые камеры: id сменился — по номеру среди одноимённых', () => {
  const list = [cam('x1', 'USB Camera'), cam('x2', 'USB Camera')];
  const second = choiceFor(list, list[1]);
  assert.deepEqual(second, { deviceId: 'x2', label: 'USB Camera', index: 1 });
  const reloaded = [cam('y1', 'USB Camera'), cam('y2', 'USB Camera')];
  assert.equal(findCamera(reloaded, second), reloaded[1]);
  assert.equal(findCamera(reloaded, choiceFor(list, list[0])), reloaded[0]);
});

test('одинаковых камер стало меньше — запомненной нет', () => {
  const list = [cam('y1', 'USB Camera')];
  assert.equal(findCamera(list, { deviceId: 'x2', label: 'USB Camera', index: 1 }), list[0]); // одна с таким названием — она
  assert.equal(findCamera([cam('z', 'Other')], { deviceId: 'x2', label: 'USB Camera', index: 1 }), null);
});

test('запомненной камеры нет или выбор пуст — null', () => {
  const list = [cam('a', 'Logitech C270')];
  assert.equal(findCamera(list, null), null);
  assert.equal(findCamera(list, { deviceId: 'gone', label: 'Old USB camera' }), null);
  // Без разрешения на камеру браузер отдаёт пустые названия — по пустому названию не ищем.
  assert.equal(findCamera([cam('', '')], { deviceId: 'gone', label: '' }), null);
});

test('choiceFor: номер считается только среди одноимённых', () => {
  const list = [cam('a', 'Logitech C270'), cam('b', 'USB Camera'), cam('c', 'USB Camera')];
  assert.equal(choiceFor(list, list[0]).index, 0);
  assert.equal(choiceFor(list, list[2]).index, 1);
});
