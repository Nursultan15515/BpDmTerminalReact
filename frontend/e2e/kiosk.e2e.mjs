// Автотест киоска без терминала: эмулятор диспенсера (dev/fake-dispenser.mjs) + мок бэкенда +
// Vite (dev-сервер и боевая сборка) + headless Chrome/Edge через DevTools Protocol. Своих зависимостей нет.
//
//   npm run e2e        браузер ищется сам; иначе укажите CHROME_PATH
//
// Порты не пересекаются со стендом (3000 / 5115 / 8080) — тест можно гонять при запущенном стенде.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createFakeDispenser } from '../../dev/fake-dispenser.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(FRONTEND, 'vite.config.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bpdm-e2e-'));
const P = { hw: 18080, api: 15199, vite: 3100, preview: 3101, cdp: 9333 };
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

// ─── Журнал запросов к диспенсеру и бэкенду ──────────────────────────────────
let log = [];
const allCalls = [];
function record(c) {
  log.push(c);
  allCalls.push(c);
}
const calls = (srv, p, method = 'POST') => log.filter((c) => c.srv === srv && c.path === p && c.method === method);

const hw = createFakeDispenser({
  delays: false,
  onRequest: (r) => record({ srv: 'hw', method: r.method, path: r.url, ctype: r.contentType, body: r.body }),
});

// ─── Мок бэкенда (/api через прокси Vite) ────────────────────────────────────
const API = { rfidStatus: true, needPhoto: false };
function jpegSize(buf) {
  for (let i = 2; i < buf.length - 9; i++)
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
  return null;
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}
const api = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  if (req.url === '/api/visitors/photo') {
    const b64 = String(body.base64Photo).replace(/^data:image\/\w+;base64,/, '');
    record({ srv: 'api', method: req.method, path: req.url, body: { cardId: body.cardId, force: body.force, size: jpegSize(Buffer.from(b64, 'base64')) } });
    return send(res, 200);
  }
  record({ srv: 'api', method: req.method, path: req.url, body });
  if (req.url === '/api/visitors/search') {
    if (body.searchValue.length > 30) return send(res, 404, { message: 'searchValue is empty or too long' });
    return send(res, 200, {
      cardId: 'CARD-1', visitorFullname: 'Тестов Тест', invitersFullname: 'Ержан Н.', invitersPhoneNumber: '74-56-98',
      cabinetFloor: '1', cabinetNumber: '103', needPhoto: API.needPhoto, dictPassCardTypeId: 1,
    });
  }
  if (req.url === '/api/visitors/rfid') return send(res, 200, { status: API.rfidStatus });
  if (req.url.startsWith('/api/terminal/')) return send(res, 200);
  send(res, 404, {});
});

// Боевая сборка отдаётся статикой (как будет на сервере), без Vite.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
function serveStatic(dir) {
  return http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    const target = file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dir, 'index.html');
    res.writeHead(200, { 'Content-Type': `${MIME[path.extname(target)] ?? 'application/octet-stream'}; charset=utf-8` });
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
      } else if (msg.method) this.events.push(msg);
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
const text = () => cdp.eval('document.body.innerText');
async function waitText(s, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const tx = await text();
    if (s instanceof RegExp ? s.test(tx) : tx.includes(s)) return tx;
    await sleep(100);
  }
  throw new Error(`не дождались «${s}»; на экране: ${(await text()).replace(/\s+/g, ' ').slice(0, 200)}`);
}
async function waitLog(pred, what, timeout = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error(`не дождались вызова: ${what}; журнал: ${JSON.stringify(log.map((c) => `${c.srv} ${c.method} ${c.path}`))}`);
}
async function click(label) {
  const ok = await cdp.eval(`(() => {
    const L = ${JSON.stringify(label)};
    const m = [...document.querySelectorAll('body *')].filter((el) => (el.innerText || '').trim() === L);
    const d = m.filter((el) => ![...el.children].some((c) => (c.innerText || '').trim() === L));
    if (!d.length) return false;
    d[d.length - 1].click();
    return true;
  })()`);
  if (!ok) throw new Error(`нет кнопки «${label}»`);
}
// Сканер штрих-кода — HID-клавиатура: символы и Enter.
const scan = (value) =>
  cdp.eval(`(() => { for (const ch of ${JSON.stringify(value)}) window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return true; })()`);
const KIOSK = `http://127.0.0.1:${P.vite}/?ratio=16:9`;
async function open(url = KIOSK, marker = 'Правила получения пропуска') {
  await cdp.send('Page.navigate', { url });
  await waitText(marker, 30000);
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const results = [];
async function scenario(name, fn) {
  hw.reset();
  Object.assign(API, { rfidStatus: true, needPhoto: false });
  try {
    await open();
    log = [];
    results.push(['PASS', name, (await fn()) ?? '']);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  }
}
async function scanAndConfirm() {
  await scan('123456789012');
  await waitText('Проверьте данные');
  await click('Да, всё верно');
}

// ─── Сценарии ────────────────────────────────────────────────────────────────
async function run() {
  await scenario('«Начать», status 1 → поиск, статус ушёл на бэкенд, запрос без preflight', async () => {
    hw.set({ cardStatus: 1 });
    await click('Начать');
    await waitText('Введите ИИН или номер документа');
    const st = calls('hw', '/card-status/');
    assert(st.length === 1, `card-status вызван ${st.length} раз`);
    assert(st[0].ctype === null && calls('hw', '/card-status/', 'OPTIONS').length === 0, 'card-status должен быть простым CORS-запросом');
    await waitLog(() => calls('api', '/api/terminal/card-status').length === 1, 'POST /api/terminal/card-status');
    assert(calls('api', '/api/terminal/card-status')[0].body.status === 1, 'в отчёте не status 1');
  });

  await scenario('«Начать», status 0 → «Карты закончились», статус 0 ушёл на бэкенд', async () => {
    hw.set({ cardStatus: 0 });
    await click('Начать');
    await waitText('Карты закончились');
    await waitLog(() => calls('api', '/api/terminal/card-status').some((c) => c.body.status === 0), 'card-status {status:0}');
  });

  await scenario('RFID не привязался → confirm(allow=false), ошибка без «Попробовать снова»', async () => {
    API.rfidStatus = false;
    await scanAndConfirm();
    const tx = await waitText('Не удалось выдать карту');
    const conf = calls('hw', '/confirm/');
    assert(conf.length === 1 && conf[0].body.allow === false, `confirm: ${JSON.stringify(conf.map((c) => c.body))}`);
    const rfid = calls('api', '/api/visitors/rfid');
    const op = [...hw.ops.values()][0];
    assert(rfid.length === 1 && rfid[0].body.cardId === 'CARD-1' && rfid[0].body.rfidNumber === op.uid, `rfid: ${JSON.stringify(rfid)}`);
    assert(op.status === 'retained', `операция ${op.status}`);
    assert(!tx.includes('Попробовать снова'), 'на экране ошибки выдачи есть «Попробовать снова»');
  });

  await scenario('RFID ок → confirm(allow=true), отсчёт 15 с, красный ≤5 с, сам уходит на главную', async () => {
    await scanAndConfirm();
    const tx = await waitText('Регистрация завершена');
    const conf = calls('hw', '/confirm/');
    assert(conf.length === 1 && conf[0].body.allow === true, `confirm: ${JSON.stringify(conf.map((c) => c.body))}`);
    assert(/в течение 1[45] секунд/.test(tx), `нет отсчёта: ${tx.replace(/\s+/g, ' ')}`);
    const colorOf = () => cdp.eval(`getComputedStyle([...document.querySelectorAll('p')].find((p) => p.innerText.includes('в течение'))).color`);
    const early = await colorOf();
    await waitText(/в течение 4 секунд/, 15000);
    await sleep(400);
    const late = await colorOf();
    const one = (await waitText(/в течение 1 секунд\S*/, 6000)).match(/в течение 1 (секунд\S*)/)[1];
    await waitText('Правила получения пропуска', 4000);
    assert(early === 'rgb(30, 42, 56)' && late === 'rgb(225, 87, 76)', `цвет: ${early} → ${late}`);
    assert(one === 'секунды', `склонение: «1 ${one}»`);
  });

  await scenario('issue-card: карт нет → «Карты закончились», статус 0 на бэкенд, без confirm', async () => {
    hw.set({ cardStatus: 0 });
    await scanAndConfirm();
    await waitText('Карты закончились');
    await waitLog(() => calls('api', '/api/terminal/card-status').some((c) => c.body.status === 0), 'card-status {status:0}');
    assert(calls('hw', '/confirm/').length === 0, 'confirm не должен вызываться');
    assert(calls('api', '/api/terminal/errors').length === 0, 'лишний отчёт об ошибке');
  });

  await scenario('issue-card: не прочитался UID → ошибка без ложного CardsEnded, ошибка в лог', async () => {
    hw.set({ issue: 'uid-error' });
    await scanAndConfirm();
    await waitText('Не удалось выдать карту');
    await waitLog(() => calls('api', '/api/terminal/errors').length === 1, 'POST /api/terminal/errors');
    const err = calls('api', '/api/terminal/errors')[0].body;
    assert(err.description === 'issue-card: UID read error' && err.notice === 'GiveCard; cardId=CARD-1', `errors: ${JSON.stringify(err)}`);
    assert(calls('api', '/api/terminal/card-status').length === 0, 'ложный отчёт статуса');
  });

  await scenario('issue-card: HTTP 500 → экран ошибки, ошибка в лог', async () => {
    hw.set({ issue: 'http500' });
    await scanAndConfirm();
    await waitText('Не удалось выдать карту');
    await waitLog(() => calls('api', '/api/terminal/errors').length === 1, 'POST /api/terminal/errors');
    const err = calls('api', '/api/terminal/errors')[0].body;
    assert(err.description === 'issue-card: HTTP 500: dispenser jam', `errors: ${JSON.stringify(err)}`);
  });

  await scenario('диспенсер недоступен на «Начать» → экран ошибки, ошибка в лог', async () => {
    hw.set({ down: true });
    await click('Начать');
    await waitText('Сервис недоступен');
    await waitLog(() => calls('api', '/api/terminal/errors').length === 1, 'POST /api/terminal/errors');
    const err = calls('api', '/api/terminal/errors')[0].body;
    assert(err.description.startsWith('card-status: ') && err.notice === 'Start', `errors: ${JSON.stringify(err)}`);
  });

  await scenario('сканер прислал 40 символов → на бэкенд ушёл 31, «Пропуск не найден»', async () => {
    await scan('A'.repeat(40));
    await waitText('Пропуск не найден');
    const s = calls('api', '/api/visitors/search');
    assert(s.length === 1 && s[0].body.searchValue.length === 31, `search: ${JSON.stringify(s.map((c) => c.body.searchValue.length))}`);
  });

  await scenario('фото: снимок в родном разрешении камеры, на экране — зеркало, затем выдача', async () => {
    API.needPhoto = true;
    await scanAndConfirm();
    await waitText('Пропуск найден');
    const t0 = Date.now();
    while (!(await cdp.eval(`(document.querySelector('video')?.videoWidth ?? 0) > 0`))) {
      if (Date.now() - t0 > 10000) throw new Error('камера не запустилась');
      await sleep(100);
    }
    const v = await cdp.eval(`(() => { const v = document.querySelector('video');
      return { w: v.videoWidth, h: v.videoHeight, transform: getComputedStyle(v).transform }; })()`);
    await cdp.eval(`[...document.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent === 'Сделать фото').previousElementSibling.click()`);
    await waitLog(() => calls('api', '/api/visitors/photo').length === 1, 'POST /api/visitors/photo', 5000);
    const img = await cdp.eval(`getComputedStyle(document.querySelector('img')).transform`);
    const photo = calls('api', '/api/visitors/photo')[0].body;
    await waitText('Регистрация завершена', 10000);
    assert(photo.size && photo.size.w === v.w && photo.size.h === v.h, `снимок ${JSON.stringify(photo.size)}, камера ${v.w}x${v.h}`);
    assert(v.transform === 'matrix(-1, 0, 0, 1, 0, 0)' && img === 'matrix(-1, 0, 0, 1, 0, 0)', `transform: video ${v.transform}, img ${img}`);
    assert(calls('hw', '/confirm/').some((c) => c.body.allow === true), 'после фото карта не выдана');
    return `снимок ${photo.size.w}x${photo.size.h}`;
  });

  // Галерея экранов (dev).
  try {
    await open(`http://127.0.0.1:${P.vite}/?screen=success&lang=KK`, 'Тіркеу аяқталды');
    assert(/\d+ секунд ішінде/.test(await text()), 'нет отсчёта на казахском');
    await open(`http://127.0.0.1:${P.vite}/?screen=confirm&lang=EN`, 'Check the details');
    assert((await text()).includes('Сарсенбаева'), 'нет тестовой карточки');
    await open(`http://127.0.0.1:${P.vite}/?gallery`, 'галерея экранов');
    results.push(['PASS', 'галерея: ?screen=&lang= и ?gallery', '']);
  } catch (e) {
    results.push(['FAIL', 'галерея', e.message]);
  }

  // Боевая сборка: курсор скрыт, галереи нет; в dev курсор виден.
  try {
    const cursorOf = () => cdp.eval(`(() => { const b = [...document.querySelectorAll('body *')].find((el) => (el.innerText || '').trim() === 'Начать');
      return { cls: document.documentElement.classList.contains('hide-cursor'), cursor: getComputedStyle(b).cursor }; })()`);
    await open(`http://127.0.0.1:${P.preview}/?gallery`);
    const prod = await cursorOf();
    await open();
    const dev = await cursorOf();
    assert(prod.cls && prod.cursor === 'none' && !dev.cls && dev.cursor === 'pointer', `prod ${JSON.stringify(prod)}, dev ${JSON.stringify(dev)}`);
    results.push(['PASS', 'боевая сборка: курсор скрыт, ?gallery не работает; в dev курсор виден', '']);
  } catch (e) {
    results.push(['FAIL', 'боевая сборка', e.message]);
  }

  const proxied = allCalls.filter((c) => c.srv === 'api' && /\/api\/hardware|cards-ended/.test(c.path));
  results.push([proxied.length === 0 ? 'PASS' : 'FAIL', 'фронт не ходит в /api/hardware и cards-ended', proxied.length ? `${proxied.length} вызовов` : '']);

  const jsErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => (e.params.exceptionDetails?.exception?.description ?? e.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '').slice(0, 160));
  results.push([jsErrors.length === 0 ? 'PASS' : 'FAIL', 'нет ошибок JS/React в консоли', jsErrors.join(' | ')]);
}

// ─── Запуск ──────────────────────────────────────────────────────────────────
let browser, devServer, previewServer;
try {
  await hw.listen(P.hw, ['127.0.0.1']);
  await new Promise((r) => api.listen(P.api, '127.0.0.1', r));

  process.env.VITE_HARDWARE_URL = `http://127.0.0.1:${P.hw}`;
  const common = { configFile: CONFIG, root: FRONTEND, logLevel: 'error', clearScreen: false };
  // Боевая сборка — в отдельном процессе: build() выставляет NODE_ENV=production на весь процесс,
  // и dev-сервер после этого собирал бы страницу без React Refresh.
  execFileSync(process.execPath, [path.join(FRONTEND, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', path.join(TMP, 'dist'), '--emptyOutDir', '--logLevel', 'error'], { cwd: FRONTEND, stdio: 'inherit' });
  previewServer = serveStatic(path.join(TMP, 'dist'));
  await new Promise((r) => previewServer.listen(P.preview, '127.0.0.1', r));
  devServer = await createServer({
    ...common,
    cacheDir: path.join(TMP, 'vite-cache'),
    server: { port: P.vite, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${P.api}`, changeOrigin: true } } },
  });
  await devServer.listen();

  browser = spawn(findBrowser(), [
    '--headless=new', `--remote-debugging-port=${P.cdp}`, `--user-data-dir=${path.join(TMP, 'profile')}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', 'about:blank',
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
  // Изолированная сеть: Google Fonts недоступны (тест не зависит от интернета).
  await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await open(); // прогрев: Vite оптимизирует зависимости при первом заходе
  await sleep(1000);

  await run();
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
  await hw.close();
  api.closeAllConnections();
  api.close();
  await sleep(500);
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(failed ? 1 : 0);
}
