// Эмулятор диспенсера карт для стенда без терминала. Тот же HTTP-API, что у сервиса на терминале
// (card-status / issue-card / confirm, CORS для страницы киоска), плюс панель управления и журнал:
// видно, выдана карта посетителю (allow=true) или осталась в аппарате (allow=false).
//
//   node dev/fake-dispenser.mjs [--port 8080]      панель: http://localhost:8080/
//
// Используется и автотестом (frontend/e2e): createFakeDispenser({ delays: false, onRequest }).
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Сколько настоящий диспенсер ждёт confirm (легаси test.cshtml: data.timeoutSec).
const OPERATION_TIMEOUT_SEC = 30;

export const CARD_STATUSES = {
  0: 'карт нет',
  1: 'обычный терминал: карты заканчиваются (бэкенд шлёт CardsEnded)',
  2: 'обычный терминал: карты есть',
};

export const ISSUE_OUTCOMES = {
  ok: 'карта в считывателе (success: true)',
  'uid-error': 'не прочитался UID (success: false)',
  http500: 'сбой сервиса (HTTP 500)',
  slow: 'ответ через 25 с — дольше таймаута киоска',
};

const DEFAULT_STATE = { cardStatus: 2, issue: 'ok', down: false };

// onRequest — для тестов: каждый запрос к API устройства ({ method, url, contentType, body }).
export function createFakeDispenser({ delays = true, onRequest } = {}) {
  const state = { ...DEFAULT_STATE };
  const events = [];
  const ops = new Map();
  let opSeq = 0;
  let servers = [];

  const wait = (ms) => (delays ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const log = (kind, text) => {
    events.push({ time: new Date().toLocaleTimeString('ru-RU'), kind, text });
    if (events.length > 300) events.shift();
  };
  const send = (res, code, body, headers = CORS) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  async function issueCard() {
    if (state.issue === 'http500') {
      log('error', 'issue-card → HTTP 500');
      return [500, { error: 'dispenser jam' }];
    }
    await (state.issue === 'slow' ? new Promise((r) => setTimeout(r, 25000)) : wait(1200));
    // Пустой диспенсер выдать не может, что бы ни было выбрано в «Выдаче».
    if (state.cardStatus === 0) {
      log('error', 'issue-card → success:false (карт нет)');
      return [200, { success: false, error: 'no cards' }];
    }
    if (state.issue === 'uid-error') {
      log('error', 'issue-card → success:false (UID read error)');
      return [200, { success: false, error: 'UID read error' }];
    }
    const operationId = `op-${++opSeq}`;
    const uid = randomBytes(4).toString('hex').toUpperCase();
    const op = { uid, status: 'pending' };
    op.timer = setTimeout(() => {
      if (op.status !== 'pending') return;
      op.status = 'expired';
      log('expired', `${operationId}: confirm не пришёл за ${OPERATION_TIMEOUT_SEC} с — карта убрана в аппарат`);
    }, OPERATION_TIMEOUT_SEC * 1000);
    op.timer.unref?.();
    ops.set(operationId, op);
    log('info', `issue-card → ${operationId}, UID ${uid}${state.issue === 'slow' ? ' (ответ через 25 с)' : ''}`);
    return [200, { success: true, operationId, uid, timeoutSec: OPERATION_TIMEOUT_SEC }];
  }

  async function confirm(body) {
    await wait(400);
    const op = ops.get(body?.operationId);
    if (!op) {
      log('error', `confirm ${body?.operationId}: неизвестная операция`);
      return [200, { error: 'unknown operation' }];
    }
    if (op.status !== 'pending') {
      log('error', `confirm ${body.operationId}: операция уже ${op.status}`);
      return [200, { error: `operation ${op.status}` }];
    }
    clearTimeout(op.timer);
    op.status = body.allow ? 'issued' : 'retained';
    log(op.status, body.allow
      ? `confirm ${body.operationId} allow=true → КАРТА ВЫДАНА посетителю (UID ${op.uid})`
      : `confirm ${body.operationId} allow=false → КАРТА ОСТАЛАСЬ в аппарате (UID ${op.uid})`);
    return [200, { action: body.allow ? 'issued' : 'returned', uid: op.uid }];
  }

  function set(partial) {
    if ('cardStatus' in partial && Number(partial.cardStatus) in CARD_STATUSES) state.cardStatus = Number(partial.cardStatus);
    if ('issue' in partial && partial.issue in ISSUE_OUTCOMES) state.issue = partial.issue;
    if ('down' in partial) state.down = Boolean(partial.down);
    log('control', `настройки: статус ${state.cardStatus}, выдача «${state.issue}»${state.down ? ', ДИСПЕНСЕР НЕДОСТУПЕН' : ''}`);
  }

  function reset() {
    for (const op of ops.values()) clearTimeout(op.timer);
    ops.clear();
    events.length = 0;
    Object.assign(state, DEFAULT_STATE);
  }

  async function handler(req, res) {
    const url = req.url.split('?')[0];
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* не JSON */ }

    // Панель управления.
    if (url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PANEL_HTML);
    }
    if (url === '/__api/state') {
      if (req.method === 'POST' && body) set(body);
      return send(res, 200, { state, cardStatuses: CARD_STATUSES, issueOutcomes: ISSUE_OUTCOMES, events: [...events].reverse() }, {});
    }
    if (url === '/__api/reset' && req.method === 'POST') {
      reset();
      return send(res, 200, {}, {});
    }

    // API устройства.
    onRequest?.({ method: req.method, url, contentType: req.headers['content-type'] ?? null, body });
    if (state.down) {
      log('error', `${req.method} ${url} — диспенсер недоступен (соединение оборвано)`);
      return req.socket.destroy();
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === 'POST' && url === '/card-status/') {
      await wait(150);
      log('info', `card-status → ${state.cardStatus}`);
      return send(res, 200, { status: state.cardStatus });
    }
    if (req.method === 'POST' && url === '/issue-card/') {
      const [code, result] = await issueCard();
      return send(res, code, result);
    }
    if (req.method === 'POST' && url === '/confirm/') {
      const [code, result] = await confirm(body);
      return send(res, code, result);
    }
    send(res, 404, { error: 'unknown endpoint' });
  }

  // Настоящий сервис слушает localhost — и IPv4, и IPv6.
  async function listen(port = 8080, hosts = ['127.0.0.1', '::1']) {
    servers = await Promise.all(hosts.map((host) => new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => handler(req, res).catch((e) => send(res, 500, { error: String(e) })));
      // IPv6 выключен — хватает IPv4; занятый порт и прочее — настоящая ошибка запуска.
      server.once('error', (e) => (host === '::1' && e.code !== 'EADDRINUSE' ? resolve(null) : reject(e)));
      server.listen(port, host, () => resolve(server));
    })));
    servers = servers.filter(Boolean);
  }

  async function close() {
    for (const op of ops.values()) clearTimeout(op.timer);
    await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections(); s.close(r); })));
  }

  return { state, events, ops, set, reset, listen, close };
}

const PANEL_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Эмулятор диспенсера</title>
<style>
  body { font: 15px/1.45 system-ui, sans-serif; margin: 0; padding: 24px 32px; background: #f2f4f1; color: #1e2a38; }
  h1 { font-size: 22px; margin: 0 0 4px; } .sub { color: #5a6675; margin: 0 0 20px; }
  .row { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  fieldset { background: #fff; border: 1px solid #e3e8ef; border-radius: 12px; padding: 12px 18px 14px; min-width: 300px; }
  legend { font-weight: 700; padding: 0 6px; } label { display: block; margin: 6px 0; cursor: pointer; }
  .down { color: #b3261e; font-weight: 600; }
  button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid #c2ccd8; background: #fff; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; background: #fff; border-radius: 12px; overflow: hidden; }
  td { padding: 7px 12px; border-top: 1px solid #eef1f5; vertical-align: top; } td:first-child { color: #94a0ae; width: 90px; font-variant-numeric: tabular-nums; }
  tr.issued td:last-child { color: #13804b; font-weight: 700; } tr.retained td:last-child { color: #a35c00; font-weight: 700; }
  tr.expired td:last-child { color: #5a6675; font-style: italic; } tr.error td:last-child { color: #b3261e; } tr.control td:last-child { color: #5a6675; }
</style></head><body>
<h1>Эмулятор диспенсера карт</h1>
<p class="sub">Киоск обращается сюда вместо сервиса на терминале. Настройки применяются сразу.</p>
<div class="row">
  <fieldset><legend>Статус карт (card-status)</legend><div id="status"></div></fieldset>
  <fieldset><legend>Выдача карты (issue-card)</legend><div id="issue"></div></fieldset>
  <fieldset><legend>Связь</legend>
    <label class="down"><input type="checkbox" id="down"> диспенсер недоступен (обрывать соединения)</label>
    <p><button id="clear">Очистить журнал</button></p>
  </fieldset>
</div>
<table><tbody id="log"></tbody></table>
<script>
  const $ = (id) => document.getElementById(id);
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  let built = false;
  function radios(el, name, options, current) {
    el.innerHTML = Object.entries(options).map(([v, text]) =>
      '<label><input type="radio" name="' + name + '" value="' + v + '"' + (String(current) === v ? ' checked' : '') + '> <b>' + v + '</b> — ' + text + '</label>').join('');
    el.onchange = (e) => post('/__api/state', { [name]: e.target.value }).then(refresh);
  }
  async function refresh() {
    const s = await (await fetch('/__api/state')).json();
    if (!built) {
      radios($('status'), 'cardStatus', s.cardStatuses, s.state.cardStatus);
      radios($('issue'), 'issue', s.issueOutcomes, s.state.issue);
      $('down').onchange = (e) => post('/__api/state', { down: e.target.checked }).then(refresh);
      $('clear').onclick = () => post('/__api/reset').then(() => { built = false; refresh(); });
      built = true;
    }
    $('down').checked = s.state.down;
    $('log').innerHTML = s.events.map((e) => '<tr class="' + e.kind + '"><td>' + e.time + '</td><td>' + e.text.replace(/</g, '&lt;') + '</td></tr>').join('')
      || '<tr><td></td><td>Журнал пуст — нажмите «Начать» на киоске.</td></tr>';
  }
  refresh();
  setInterval(refresh, 1000);
</script></body></html>`;

// Запуск как скрипт: node dev/fake-dispenser.mjs [--port 8080]
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 8080;
  const dispenser = createFakeDispenser();
  await dispenser.listen(port);
  console.log(`Эмулятор диспенсера запущен: http://localhost:${port}/ (панель управления)`);
}
