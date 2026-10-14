// Автотест страницы распознавания удостоверения (?idscan) без терминала и без настоящих документов:
// Vite (dev-сервер и боевая сборка) + headless Chrome/Edge через DevTools Protocol + синтетические
// тестовые карты (выдуманные данные, корректный ИИН). Проверяет, что tesseract.js грузится с нашего
// сервера (CDN заблокирован, как в сети терминалов) и что ИИН читается в разных режимах. Своих зависимостей нет.
//
//   npm run e2e:idscan                                    браузер ищется сам; иначе укажите CHROME_PATH
//   IDSCAN_IMAGE=C:\фото\карта.png npm run e2e:idscan      заодно прогнать свои фото (несколько — через «;»);
//                                                          результат печатается, с IDSCAN_EXPECT=<ИИН>[;<ИИН>…] — сверяется
//   IDSCAN_STRESS=50 npm run e2e:idscan                    статистика: 50 случайных карт на режим и масштаб
//
// Порты не пересекаются ни со стендом (3000 / 5115 / 8080), ни с основным автотестом.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(FRONTEND, 'vite.config.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bpdm-idscan-'));
const P = { vite: 3110, preview: 3111, cdp: 9343 };
const IMAGES = (process.env.IDSCAN_IMAGE ?? '').split(';').filter(Boolean);
const EXPECTS = (process.env.IDSCAN_EXPECT ?? '').split(';');
const STRESS = Number(process.env.IDSCAN_STRESS ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const found = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Не найден Chrome/Edge — укажите путь в CHROME_PATH');
  return found;
}

// Боевая сборка отдаётся статикой (как будет на сервере); журнал запросов — чтобы убедиться,
// что воркер, ядро и модель распознавания пришли именно отсюда.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.gz': 'application/gzip', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const served = [];
function serveStatic(dir) {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    served.push(url);
    const file = path.join(dir, url);
    const target = file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dir, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
}

// ─── CDP ─────────────────────────────────────────────────────────────────────
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

let cdp;
async function waitFor(expr, what, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await cdp.eval(expr).catch(() => null);
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`не дождались: ${what}`);
}
const attr = (name) => cdp.eval(`document.querySelector('[${name}]')?.getAttribute('${name}') ?? null`);
async function click(label) {
  const ok = await cdp.eval(`(() => {
    const el = [...document.querySelectorAll('button, label')].find((b) => b.innerText.trim() === ${JSON.stringify(label)});
    if (!el) return false;
    (el.tagName === 'LABEL' ? el.querySelector('input') : el).click();
    return true;
  })()`);
  if (!ok) throw new Error(`нет кнопки «${label}»`);
}
const count = async () => Number((await attr('data-idscan-count')) ?? 0);
// Дождаться нового результата распознавания (после действия, начатого при счётчике before).
async function nextResult(before, timeout = 30000) {
  await waitFor(`Number(document.querySelector('[data-idscan-count]')?.getAttribute('data-idscan-count') ?? 0) > ${before}
    && document.querySelector('[data-idscan-busy]')?.getAttribute('data-idscan-busy') === '0'`, 'результат распознавания', timeout);
  const ms = await cdp.eval(`(document.body.innerText.match(/Время: (\\d+) мс/) ?? [])[1] ?? '?'`);
  return { got: await attr('data-idscan-result'), expected: await attr('data-idscan-expected'), ms };
}

const results = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function scenario(name, fn) {
  try {
    const note = await fn();
    results.push(['PASS', name, note ?? '']);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  }
}
const LAYOUT = 'Угадывать сторону и положение (переворот)';
// Догадка страницы о стороне и положении карты («front:0», «back:180»…) — должна совпасть с тем, что нарисовано.
async function layoutIs(name, expected) {
  await scenario(name, async () => {
    const got = await attr('data-idscan-layout');
    const details = await cdp.eval(`document.querySelector('[data-idscan-layout]')?.innerText ?? ''`);
    assert(got === expected, `по картинке «${got}», ожидали «${expected}»: ${details}`);
    return details.replace(/^.*· признаки /, '');
  });
}

// Нажать то, что перечитывает картинку, и дождаться результата.
async function act(label, timeout) {
  const before = await count();
  await click(label);
  return nextResult(before, timeout);
}
// Что вернуло распознавание по шагам — для разбора провалов.
const rawTexts = () => cdp.eval(`[...document.querySelectorAll('pre')].map((p) => p.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
// Действие с тестовой картой → ИИН должен совпасть с нарисованным. Одиночное чтение изредка промахивается
// (≈1 %, см. IDSCAN_STRESS) — как и в живом режиме, промах повторяем на новой карте, до трёх попыток.
// Неверно прочитанный ИИН — сразу провал: он опаснее промаха.
async function readsTestCard(name, label) {
  await scenario(name, async () => {
    for (let attempt = 1; ; attempt++) {
      const r = await act(attempt === 1 ? label : 'Новая карта');
      assert(r.expected, 'нет тестовой карты');
      if (r.got === r.expected) return `${r.ms} мс${attempt > 1 ? `, с ${attempt}-й попытки` : ''}`;
      const details = `прочитано «${r.got}», на карте ${r.expected}; текст: ${await rawTexts()}`;
      assert(!r.got && attempt < 3, details);
    }
  });
}

// IDSCAN_STRESS=N: N случайных тестовых карт на каждую сторону, режим и масштаб (порог — какой выбран) —
// доля прочитанных, неверные чтения (опаснее промахов: неверный ИИН может найти чужой пропуск) и время.
async function stress(title, n) {
  for (const side of ['Лицевая', 'Оборот']) {
    await act(side);
    for (const mode of ['Зона ИИН', 'Вся карта']) {
      await act(mode);
      for (const scale of ['100 %', '60 %', '40 %']) {
        await act(scale);
        let ok = 0;
        let verified = 0;
        const times = [];
        const wrong = [];
        const missed = [];
        for (let i = 0; i < n; i++) {
          const r = await act('Новая карта');
          times.push(Number(r.ms));
          if (r.got === r.expected) {
            ok++;
            if (await cdp.eval(`document.body.innerText.includes('ИИН проверен целиком')`)) verified++;
          } else (r.got ? wrong : missed).push(`${r.expected} → «${r.got}»: ${(await rawTexts()).slice(-120)}`);
        }
        times.sort((a, b) => a - b);
        results.push([
          wrong.length === 0 ? 'PASS' : 'FAIL',
          `${title}: ${side.toLowerCase()}, «${mode}», ${scale}: прочитано ${ok}/${n}, неверно ${wrong.length}` +
            (side === 'Оборот' ? `, проверено общей контрольной ${verified}/${ok}` : ''),
          [`медиана ${times[Math.floor(n / 2)]} мс`, ...wrong.map((w) => `НЕВЕРНО ${w}`), ...missed.slice(0, 2)].join('\n      '),
        ]);
      }
    }
  }
  await act('Лицевая');
  await act('100 %');
  await act('Авто');
}

async function run(base, title) {
  // Вход как на терминале: удержать «Терминал готов к работе» 3 с → настройка экрана → «Распознавание удостоверения».
  await scenario(`${title}: вход из настройки экрана киоска`, async () => {
    await cdp.send('Page.navigate', { url: `${base}/` });
    // Блок с удержанием: сам текст — его собственный текстовый узел (рядом точка-индикатор и часы).
    const ready = `[...document.querySelectorAll('div')].find((d) => [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes('Терминал готов к работе')))`;
    await waitFor(`!!(${ready})`, 'главный экран киоска'); // DOM-узел по значению не передаётся — только true/false
    await cdp.eval(`${ready}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await waitFor(`document.body.innerText.includes('Разрешение экрана')`, 'экран настройки', 6000);
    const clicked = await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll('div')].find((d) => d.innerText.trim() === 'Распознавание удостоверения');
      btn?.click();
      return !!btn;
    })()`);
    assert(clicked, 'на экране настройки нет кнопки «Распознавание удостоверения»');
    await waitFor(`location.search === '?idscan' && !!document.querySelector('[data-idscan-status]')`, 'страница распознавания');
  });
  if (!(await cdp.eval(`location.search === '?idscan'`))) await cdp.send('Page.navigate', { url: `${base}/?idscan` });
  const status = await waitFor(
    `document.querySelector('[data-idscan-status="ready"], [data-idscan-status="error"]')?.innerText`,
    'загрузка распознавания',
    90000,
  );
  results.push([status.includes('готово') ? 'PASS' : 'FAIL', `${title}: распознавание загрузилось`, status.split('\n')[0]]);

  // Камера (в тесте — поддельная, без карты): кадр приходит, один кадр и живой режим не падают.
  await scenario(`${title}: камера — один кадр и живой режим`, async () => {
    await waitFor(`(document.querySelector('video')?.videoWidth ?? 0) > 0`, 'видео с камеры');
    let before = await count();
    await click('Один кадр');
    const r = await nextResult(before);
    assert(r.got === '', `на пустом кадре найден ИИН ${r.got}`);
    before = await count();
    await click('Старт');
    await waitFor(`Number(document.querySelector('[data-idscan-count]').getAttribute('data-idscan-count')) >= ${before + 2}`, 'два кадра живого режима', 60000);
    await click('Стоп');
    return `кадр ${await cdp.eval(`(() => { const v = document.querySelector('video'); return v.videoWidth + '×' + v.videoHeight; })()`)}, ${r.ms} мс`;
  });

  await readsTestCard(`${title}: тестовая карта, режим «Авто»`, 'Тестовая карта');
  await layoutIs(`${title}: по картинке — лицевая, ровно`, 'front:0');
  await readsTestCard(`${title}: режим «Зона ИИН»`, 'Зона ИИН');
  await readsTestCard(`${title}: новая карта, «Зона ИИН»`, 'Новая карта');
  await readsTestCard(`${title}: режим «Вся карта»`, 'Вся карта');
  await readsTestCard(`${title}: снова «Авто»`, 'Авто');
  await readsTestCard(`${title}: мелкая карта (60 %)`, '60 %');
  await readsTestCard(`${title}: обычная карта (100 %)`, '100 %');

  // Положение карты: перевёрнутую страница ставит ровно сама; без угадывания — только ручной поворот.
  await readsTestCard(`${title}: вверх ногами — переворачивается сама`, 'вверх ногами');
  await layoutIs(`${title}: по картинке — лицевая, 180°`, 'front:180');
  await act(LAYOUT);
  await scenario(`${title}: без угадывания вверх ногами не читается`, async () => {
    const r = await act('Новая карта');
    assert(r.got !== r.expected, 'прочитана без поворота — тогда проверка поворота ничего не доказывает');
    return r.got ? `прочитано «${r.got}»` : 'ИИН не найден';
  });
  await readsTestCard(`${title}: вверх ногами, поворот 180° вручную`, '180°');
  await act('вверх ногами'); // ровная карта при повороте 180° без угадывания — не читается, просто ждём
  await readsTestCard(`${title}: ровная карта, поворот 0°`, '0°');
  await act(LAYOUT);

  await readsTestCard(`${title}: порог Оцу`, 'Оцу');
  await readsTestCard(`${title}: адаптивный порог`, 'адаптивный');
  await act('нет');

  // Оборот: ИИН из MRZ, проверенный общей контрольной цифрой.
  await readsTestCard(`${title}: оборот (MRZ), режим «Авто»`, 'Оборот');
  await layoutIs(`${title}: по картинке — оборот, ровно`, 'back:0');
  // Общая контрольная читается не на каждой карте (≈80 % — см. IDSCAN_STRESS): ждём её хотя бы на одной из пяти.
  await scenario(`${title}: оборот — ИИН из MRZ проверен целиком`, async () => {
    for (let attempt = 1; ; attempt++) {
      const page = await cdp.eval('document.body.innerText');
      if (page.includes('Из MRZ на обороте') && page.includes('сошлась — ИИН проверен целиком')) return attempt > 1 ? `с ${attempt}-й карты` : '';
      const summary = (page.match(/ИИН прочитан[\s\S]*?Время:/) ?? [page.slice(0, 300)])[0].replace(/\s+/g, ' ');
      assert(attempt < 5, `нет отметки о проверке MRZ: ${summary}; текст: ${await rawTexts()}`);
      await act('Новая карта');
    }
  });
  await readsTestCard(`${title}: оборот, режим «Зона ИИН»`, 'Зона ИИН');
  await readsTestCard(`${title}: оборот, режим «Вся карта»`, 'Вся карта');
  await act('Авто');
  await readsTestCard(`${title}: оборот вверх ногами — переворачивается сам`, 'вверх ногами');
  await layoutIs(`${title}: по картинке — оборот, 180°`, 'back:180');
  await act('вверх ногами');
  await act('Лицевая');

  if (STRESS && title === 'сборка') await stress(title, STRESS);
  for (const [i, image] of IMAGES.entries()) await realImage(title, image, EXPECTS[i]);
}

// Своё фото удостоверения (не из репозитория): печатаем, что прочитано в режимах «Авто» и «Вся карта».
async function realImage(title, image, expect) {
  await click('Файл'); // режим уже «Авто»; смена источника ничего не перечитывает
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  const report = async (r) => {
    const found = await cdp.eval(`(document.body.innerText.match(/(По 12 цифрам ИИН|Из MRZ на обороте):/) ?? [])[1] ?? ''`);
    const dob = await cdp.eval(`(document.body.innerText.match(/Дата рождения (?:на карте|в MRZ): ([^\\n]+)/) ?? [])[1] ?? ''`);
    const mrz = await cdp.eval(`(document.body.innerText.match(/общая контрольная цифра ([^\\n]+)/) ?? [])[1] ?? ''`);
    if (expect) assert(r.got === expect, `прочитано «${r.got}», ожидали ${expect}`);
    const raw = `\n      текст: ${(await rawTexts()).slice(0, 600)}`;
    const layout = await cdp.eval(`document.querySelector('[data-idscan-layout]')?.innerText ?? ''`);
    return `ИИН: ${r.got || 'не найден'}${found ? ` (${found.toLowerCase()})` : ''}; дата: ${dob || '—'}${mrz ? `; MRZ: ${mrz}` : ''}; ${r.ms} мс` +
      `${layout ? `\n      ${layout}` : ''}${raw}`;
  };
  await scenario(`${title}: своё фото (${path.basename(image)}), режим «Авто»`, async () => {
    const before = await count();
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(image)] });
    return report(await nextResult(before, 60000));
  });
  await scenario(`${title}: своё фото (${path.basename(image)}), режим «Вся карта»`, async () => report(await act('Вся карта', 60000)));
  await act('Авто', 60000);
}

// ─── Запуск ──────────────────────────────────────────────────────────────────
let browser, devServer, previewServer;
try {
  // Боевая сборка — в отдельном процессе: build() выставляет NODE_ENV=production на весь процесс.
  execFileSync(process.execPath, [path.join(FRONTEND, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', path.join(TMP, 'dist'), '--emptyOutDir', '--logLevel', 'error'], { cwd: FRONTEND, stdio: 'inherit' });
  previewServer = serveStatic(path.join(TMP, 'dist'));
  await new Promise((r) => previewServer.listen(P.preview, '127.0.0.1', r));
  devServer = await createServer({ configFile: CONFIG, root: FRONTEND, logLevel: 'error', clearScreen: false, cacheDir: path.join(TMP, 'vite-cache'), server: { port: P.vite, strictPort: true } });
  await devServer.listen();

  browser = spawn(findBrowser(), [
    '--headless=new', `--remote-debugging-port=${P.cdp}`, `--user-data-dir=${path.join(TMP, 'profile')}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--no-first-run', '--no-default-browser-check', '--window-size=1600,1000', 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(200);
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${P.cdp}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* браузер ещё стартует */ }
  }
  if (!wsUrl) throw new Error('браузер не открыл DevTools-порт');
  cdp = new Cdp(wsUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  // Как в изолированной сети терминалов: CDN, с которого tesseract.js качает всё по умолчанию, недоступен.
  await cdp.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*', '*unpkg.com*', '*fonts.googleapis.com*', '*fonts.gstatic.com*'] });

  await run(`http://127.0.0.1:${P.vite}`, 'dev');
  await run(`http://127.0.0.1:${P.preview}`, 'сборка');

  const needed = ['/tesseract/worker.min.js', '/tesseract/lang/eng.traineddata.gz'];
  const missing = needed.filter((u) => !served.includes(u));
  const core = served.find((u) => u.startsWith('/tesseract/core/'));
  results.push([missing.length === 0 && core ? 'PASS' : 'FAIL', 'сборка: воркер, ядро и модель отданы нашим сервером', missing.length ? `не запрошены: ${missing.join(', ')}` : core ?? 'ядро не запрошено']);

  const external = [...new Set(cdp.events
    .filter((e) => e.method === 'Network.requestWillBeSent')
    .map((e) => e.params.request.url)
    .filter((u) => /^https?:/.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)))];
  results.push([external.length === 0 ? 'PASS' : 'FAIL', 'нет запросов во внешнюю сеть', external.slice(0, 5).join(' ')]);

  const jsErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => (e.params.exceptionDetails?.exception?.description ?? e.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '').slice(0, 160));
  results.push([jsErrors.length === 0 ? 'PASS' : 'FAIL', 'нет ошибок JS/React в консоли', jsErrors.join(' | ')]);
} catch (e) {
  results.push(['FAIL', 'запуск теста', e.stack ?? String(e)]);
} finally {
  for (const [st, name, note] of results) console.log(`${st}  ${name}${note ? `\n      ${note}` : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  try { cdp?.ws.close(); } catch { /* уже закрыт */ }
  if (browser?.pid) {
    try { execSync(`taskkill /PID ${browser.pid} /T /F`, { stdio: 'ignore' }); } catch { /* уже завершён */ }
  }
  await devServer?.close();
  previewServer?.closeAllConnections();
  await new Promise((r) => (previewServer ? previewServer.close(r) : r()));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* профиль браузера ещё занят — уберёт система */ }
  process.exitCode = failed ? 1 : 0;
}
