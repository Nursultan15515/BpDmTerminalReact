// Юнит-тесты MRZ оборота удостоверения и выбора ИИН (src/idscan/mrz.ts, verdict.ts) — без браузера.
//   npm test
// Данные выдуманные: MRZ собирается из корректного вымышленного ИИН, настоящих документов здесь нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIin } from '../src/idscan/iin.ts';
import { cleanMrzLine, findMrz, makeMrz, mrzCheckDigit } from '../src/idscan/mrz.ts';
import { decide } from '../src/idscan/verdict.ts';

const MAN = parseIin('850320300125'); // 20.03.1985, мужской
const WOMAN = parseIin('901125400770'); // 25.11.1990, женский
const mrzOf = (iin, doc = '012345678') => makeMrz(doc, iin, '01.06.2030', 'TESTOV', 'ALIKHAN');

test('контрольная цифра MRZ — по образцу паспорта из ICAO 9303', () => {
  assert.equal(mrzCheckDigit('L898902C3'), 6);
  assert.equal(mrzCheckDigit('740812'), 2);
  assert.equal(mrzCheckDigit('120415'), 9);
});

test('MRZ удостоверения: три строки по 30 знаков, ИИН после номера документа', () => {
  const [l1, l2, l3] = mrzOf(MAN);
  assert.equal(l1.length, 30);
  assert.equal(l2.length, 30);
  assert.equal(l3.length, 30);
  assert.equal(l1, `IDKAZ012345678${mrzCheckDigit('012345678')}850320300125<<<`);
  assert.equal(l2.slice(0, 15), `850320${mrzCheckDigit('850320')}M300601${mrzCheckDigit('300601')}`);
  assert.match(l2, /KAZ<{11}\d$/);
});

test('разбор MRZ: ИИН, дата рождения, срок, пол, общая контрольная', () => {
  assert.deepEqual(findMrz(mrzOf(MAN).join('\n')), [
    { documentNumber: '012345678', iin: MAN, birthDate: '20.03.1985', expiry: '01.06.2030', sex: 'M', composite: true },
  ]);
  assert.equal(findMrz(mrzOf(WOMAN).join('\n'))[0].sex, 'F');
});

test('разбор MRZ выдерживает типичный шум распознавания', () => {
  const [l1, l2, l3] = mrzOf(MAN);
  const noisy = [
    `${l1.slice(0, 5)} ${l1.slice(5).replace(/0/g, 'O')}`, // пробел, O вместо 0
    l2.replace(/<</g, '«'), // «<<» прочитано как «
    '', // пустая строка между строками MRZ
    l3.toLowerCase(),
  ].join('\n');
  const [m] = findMrz(noisy);
  assert.equal(m.iin.iin, '850320300125');
  assert.equal(m.composite, true);
  assert.equal(cleanMrzLine('id kaz «‹'), 'IDKAZ<<<');
});

test('строка 2: потерянный знак пола, заполнители как L, лишний заполнитель', () => {
  const [l1, l2] = mrzOf(WOMAN);
  // Пол потерян — даты всё равно разбираются.
  const [noSex] = findMrz(`${l1}\n${l2.slice(0, 7)}${l2.slice(8)}`);
  assert.deepEqual({ birthDate: noSex.birthDate, sex: noSex.sex, composite: noSex.composite }, { birthDate: '25.11.1990', sex: null, composite: true });
  // Заполнители прочитаны как L и общая контрольная потеряна: «не прочиталась», а не «не сошлась» — ИИН не теряем.
  const [asL] = findMrz(`${l1}\n${l2.slice(0, 18)}${'L'.repeat(11)}`);
  assert.equal(asL.composite, null);
  assert.equal(decide([], [], [asL]).iin?.iin, '901125400770');
  // Лишний заполнитель — общая контрольная всё равно в конце строки.
  const [extra] = findMrz(`${l1}\n${l2.slice(0, 18)}<${l2.slice(18)}`);
  assert.equal(extra.composite, true);
  // Хвост правильной длины, контрольная прочитана буквой-двойником — это цифра (у этих номеров общая контрольная
  // 0 и 2: 0 → C, как на снимке с рук, 2 → Z).
  for (const [doc, look] of [['012345679', 'C'], ['012345678', 'Z']]) {
    const [d1, d2] = mrzOf(WOMAN, doc);
    assert.equal(findMrz(`${d1}\n${d2.slice(0, 29)}${look}`)[0].composite, true);
  }
});

test('ошибка в 11-й цифре ИИН: своя контрольная её не видит, общая контрольная MRZ — ловит', () => {
  const [l1, l2] = mrzOf(MAN);
  const wrong = `${l1.slice(0, 25)}${l1[25] === '9' ? '0' : '9'}${l1.slice(26)}`; // 11-я цифра ИИН — позиция 26 строки
  const wrongIin = wrong.slice(15, 27);
  assert.ok(parseIin(wrongIin), 'ИИН с ошибкой в 11-й цифре проходит свою контрольную — в этом и дыра');
  const [m] = findMrz(`${wrong}\n${l2}`);
  assert.equal(m.iin.iin, wrongIin);
  assert.equal(m.composite, false);
  const v = decide([], [], [m]);
  assert.equal(v.iin, null);
  assert.deepEqual(v.rejected.map((r) => r.reason), ['не сошлась общая контрольная цифра MRZ']);
});

test('без второй строки MRZ ИИН принимается, но без полной проверки', () => {
  const [l1] = mrzOf(MAN);
  const [m] = findMrz(l1);
  assert.deepEqual({ birthDate: m.birthDate, composite: m.composite }, { birthDate: null, composite: null });
  const v = decide([], [], [m]);
  assert.equal(v.iin?.iin, '850320300125');
  assert.equal(v.side, 'back');
});

test('дата рождения во второй строке MRZ не совпала с ИИН — отброшен', () => {
  const [l1] = mrzOf(MAN);
  const [, otherL2] = mrzOf(WOMAN);
  const [m] = findMrz(`${l1}\n${otherL2}`);
  const v = decide([], [], [m]);
  assert.equal(v.iin, null);
  assert.match(v.rejected[0].reason, /дата рождения в MRZ — 25\.11\.1990/);
});

test('заглушка вместо MRZ (электронная копия) и мусор — ничего не находят', () => {
  assert.deepEqual(findMrz('<'.repeat(30) + '\nTESTOV<<ALIKHAN' + '<'.repeat(15) + '\n' + '<'.repeat(30)), []);
  assert.deepEqual(findMrz('IDKAZ 12 34 ТЕСТ\nКАКОЙ-ТО ТЕКСТ'), []);
});

test('выбор ИИН: лицевая сторона и сверка с датой на карте', () => {
  // Без даты на карте — принимаем, что нашли.
  assert.equal(decide([MAN], [], []).iin?.iin, '850320300125');
  // Дата на карте совпала — принимаем; не совпала — отбрасываем с причиной.
  assert.equal(decide([MAN], ['20.03.1985'], []).cardDob, '20.03.1985');
  const v = decide([MAN], ['21.03.1985'], []);
  assert.equal(v.iin, null);
  assert.match(v.rejected[0].reason, /на карте — 21\.03\.1985/);
  // Век печатного года прочитан неверно (1985 → 1885) — это ошибка даты, не ИИН: в ИИН век записан отдельно.
  assert.equal(decide([MAN], ['20.03.1885'], []).iin?.iin, '850320300125');
  // А вот другие две последние цифры года — ошибка в самом ИИН (или в дате): не принимаем.
  assert.equal(decide([MAN], ['20.03.1975'], []).iin, null);
});

test('выбор ИИН: MRZ, проверенная целиком, важнее лицевой стороны', () => {
  const [mrz] = findMrz(mrzOf(WOMAN).join('\n'));
  const v = decide([MAN], [], [mrz]);
  assert.equal(v.iin?.iin, '901125400770');
  assert.equal(v.side, 'back');
  assert.equal(v.cardDob, '25.11.1990');
  // Цифры MRZ, найденные ещё и как текст (и отброшенные по датам на обороте), в отброшенных не дублируются.
  const both = decide([WOMAN], ['14.02.2022', '13.02.2032'], [mrz]);
  assert.equal(both.iin?.iin, '901125400770');
  assert.deepEqual(both.rejected, []);
});
