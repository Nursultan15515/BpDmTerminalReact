import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { VisitorCard } from '../kiosk/constants';
import {
  errorMessage,
  getSettings,
  searchVisitor,
  testDb,
  type DbTestResult,
  type DbValues,
  type DiagSettings,
  type DiagTerminal,
  type SearchResult,
  type SecretState,
} from './api';

// Страница диагностики (?diag): с какими настройками (appsettings) работает приложение, видит ли сервер приложения
// базу данных и SOAP-сервис. Проверки выполняет бэкенд, поэтому с терминала результат тот же, что и на самом сервере.
// Есть и в боевой сборке; на терминале вход — с экрана настройки. Пароли из настроек и тест с другими значениями —
// только на самом сервере (через RDP); поиск — на сервере и на терминалах из TerminalInfo.

type Run<T> = { state: 'idle' } | { state: 'busy' } | { state: 'done'; result: T } | { state: 'failed'; message: string };

const MAX_SEARCH_LENGTH = 30; // как MaxSearchValueLength на бэкенде

const fromSettings = (s: DiagSettings): DbValues => ({
  server: s.db.server ?? '',
  database: s.db.database ?? '',
  user: s.db.user ?? '',
  password: s.db.password ?? '',
});

// Как на бэкенде: пустое поле — значение из настроек, имена без учёта регистра и пробелов по краям.
const same = (value: string, configured: string) => !value.trim() || value.trim().toLowerCase() === configured.trim().toLowerCase();
const sameAsSettings = (v: DbValues, c: DbValues) =>
  same(v.server, c.server) && same(v.database, c.database) && same(v.user, c.user) && (!v.password || v.password === c.password);

const ms = (n: number) => (n < 1000 ? `${n} мс` : `${(n / 1000).toFixed(1)} с`);

function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

// ─── Оформление (как на ?idscan) ─────────────────────────────────────────────
const page: CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: '#f2f4f1', color: '#1e2a38', font: '15px/1.45 system-ui, sans-serif', padding: '20px 24px 40px' };
const panel: CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '14px 16px', marginTop: 14, maxWidth: 780 };
const heading: CSSProperties = { fontSize: 17, fontWeight: 700 };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: '8px 12px', alignItems: 'center', marginTop: 12 };
const row: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 };
const muted: CSSProperties = { color: '#5a6675' };
const detail: CSSProperties = { fontSize: 13, color: '#46515e', whiteSpace: 'pre-wrap' };
const field = (disabled: boolean): CSSProperties => ({
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #c2ccd8',
  font: 'inherit',
  background: disabled ? '#f2f4f7' : '#fff',
  color: disabled ? '#5a6675' : 'inherit',
});
const btn = (primary = false, disabled = false): CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: `1px solid ${primary ? '#1b4d8f' : '#c2ccd8'}`,
  background: primary ? '#1b4d8f' : '#fff',
  color: primary ? '#fff' : 'inherit',
  font: 'inherit',
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const TONES = {
  ok: { line: '#2e7d32', fill: '#eef7ef' },
  warn: { line: '#b7791f', fill: '#fdf6e7' },
  error: { line: '#c62828', fill: '#fdeeee' },
  busy: { line: '#94a0ae', fill: '#f6f8fa' },
} as const;

function Note({ tone, children, data }: { tone: keyof typeof TONES; children: ReactNode; data?: string }) {
  return (
    <div
      data-diag={data}
      style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, borderLeft: `4px solid ${TONES[tone].line}`, background: TONES[tone].fill, overflowWrap: 'anywhere' }}
    >
      {children}
    </div>
  );
}

const SECRETS: Record<SecretState, { text: string; color: string }> = {
  set: { text: 'задан', color: '#2e7d32' },
  placeholder: { text: 'CHANGE-ME — не заменён', color: '#c62828' },
  empty: { text: 'пусто', color: '#b7791f' },
  windows: { text: 'вход Windows, пароль не нужен', color: '#1b4d8f' },
};

function PasswordField(props: {
  id: string;
  value: string;
  onChange?: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  canReveal: boolean;
  state: SecretState;
}) {
  const [shown, setShown] = useState(false);
  const secret = SECRETS[props.state];
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        id={props.id}
        type={shown ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
        disabled={props.disabled}
        placeholder={props.placeholder}
        autoComplete="new-password"
        spellCheck={false}
        style={{ ...field(props.disabled), flex: '1 1 220px', width: 'auto' }}
      />
      {props.canReveal && (
        <label style={{ ...muted, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /> показать
        </label>
      )}
      <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        <span style={muted}>в настройках: </span>
        <b style={{ color: secret.color }}>{secret.text}</b>
      </span>
    </div>
  );
}

export function DiagPage() {
  const [settings, setSettings] = useState<DiagSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [db, setDb] = useState<DbValues>({ server: '', database: '', user: '', password: '' });
  const [dbRun, setDbRun] = useState<Run<DbTestResult>>({ state: 'idle' });
  const [testedChanged, setTestedChanged] = useState(false);
  const [terminals, setTerminals] = useState<DiagTerminal[]>([]);
  const [terminalName, setTerminalName] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [searchRun, setSearchRun] = useState<Run<SearchResult>>({ state: 'idle' });

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setDb(fromSettings(s));
      })
      .catch((e) => setSettingsError(errorMessage(e)));
  }, []);

  const editable = settings?.local === true;
  const changed = !!settings && editable && !sameAsSettings(db, fromSettings(settings));

  async function runDbTest(e: FormEvent) {
    e.preventDefault();
    setDbRun({ state: 'busy' });
    setTestedChanged(changed);
    try {
      // С терминала значения не меняются — бэкенд берёт свои настройки.
      const result = await testDb(editable ? db : {});
      setDbRun({ state: 'done', result });
      if (result.ok && result.terminals) {
        setTerminals(result.terminals);
        if (!terminalName.trim() && result.clientTerminal) setTerminalName(result.clientTerminal);
      }
    } catch (err) {
      setDbRun({ state: 'failed', message: errorMessage(err) });
    }
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    setSearchRun({ state: 'busy' });
    try {
      setSearchRun({ state: 'done', result: await searchVisitor(terminalName.trim(), searchValue.trim()) });
    } catch (err) {
      setSearchRun({ state: 'failed', message: errorMessage(err) });
    }
  }

  const dbBusy = dbRun.state === 'busy';
  const searchBusy = searchRun.state === 'busy';
  const canSearch = !searchBusy && !!terminalName.trim() && !!searchValue.trim();
  const update = (key: keyof DbValues) => (value: string) => setDb((v) => ({ ...v, [key]: value }));

  return (
    <div style={page} data-diag-settings={settings ? 'loaded' : settingsError ? 'error' : 'loading'}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Диагностика</h1>
        <a href={import.meta.env.BASE_URL}>← к киоску</a>
      </div>
      <p style={{ ...muted, marginTop: 4 }}>
        Связь сервера приложения с базой данных и SOAP-сервисом. Проверки выполняет сервер — с терминала результат тот же,
        что и на самом сервере.
      </p>

      {settingsError && <Note tone="error">Не удалось получить настройки: {settingsError}</Note>}
      {!settings && !settingsError && <Note tone="busy">Загружаю настройки…</Note>}

      {settings && (
        <>
          <p style={{ marginTop: 8 }}>
            Режим <b>{settings.environment}</b> · сервер {settings.machine} · файлы настроек:{' '}
            {settings.configFiles.map((f, i) => (
              <span key={f.name}>
                {i > 0 && ', '}
                {f.name}
                {!f.exists && <span style={muted}> (нет файла)</span>}
              </span>
            ))}
          </p>
          <p style={{ ...muted, marginTop: 2 }}>
            {settings.local
              ? 'Открыто на самом сервере: пароли видны, можно проверить другие значения.'
              : `Открыто с ${settings.clientIp ?? 'неизвестного адреса'}: пароли скрыты, другие значения проверяются только на самом сервере.`}
          </p>

          {/* ─── База данных ─── */}
          <form style={panel} onSubmit={runDbTest}>
            <h2 style={heading}>База данных</h2>
            <div style={grid}>
              <label htmlFor="diag-db-server">Сервер</label>
              <input id="diag-db-server" value={db.server} onChange={(e) => update('server')(e.target.value)} disabled={!editable} spellCheck={false} style={field(!editable)} />
              <label htmlFor="diag-db-database">База</label>
              <input id="diag-db-database" value={db.database} onChange={(e) => update('database')(e.target.value)} disabled={!editable} spellCheck={false} style={field(!editable)} />
              <label htmlFor="diag-db-user">Логин SQL</label>
              <input
                id="diag-db-user"
                value={db.user}
                onChange={(e) => update('user')(e.target.value)}
                disabled={!editable}
                placeholder={settings.db.windowsAuth ? 'вход Windows' : ''}
                spellCheck={false}
                autoComplete="off"
                style={field(!editable)}
              />
              <label htmlFor="diag-db-password">Пароль</label>
              <PasswordField
                id="diag-db-password"
                value={db.password}
                onChange={update('password')}
                disabled={!editable}
                placeholder={!editable ? 'скрыт — виден только на сервере' : settings.db.windowsAuth ? 'не нужен' : 'из настроек'}
                canReveal={editable}
                state={settings.db.passwordState}
              />
            </div>
            {settings.db.error && <Note tone="error">{settings.db.error}</Note>}
            <div style={row}>
              <button type="submit" disabled={dbBusy} style={btn(true, dbBusy)}>
                {dbBusy ? 'Проверяю…' : 'Тест подключения'}
              </button>
              {changed && (
                <button type="button" onClick={() => setDb(fromSettings(settings))} style={btn()}>
                  Вернуть из настроек
                </button>
              )}
              {!editable && <span style={muted}>Другие значения можно проверить только на самом сервере.</span>}
            </div>
            <DbResultView run={dbRun} local={settings.local} changed={testedChanged} />
          </form>

          {/* ─── SOAP-сервис: только показ, меняется в файле настроек ─── */}
          <section style={panel}>
            <h2 style={heading}>SOAP-сервис</h2>
            <div style={grid}>
              <label htmlFor="diag-soap-endpoint">Адрес</label>
              <input id="diag-soap-endpoint" value={settings.soap.endpoint} disabled style={field(true)} />
              <label htmlFor="diag-soap-password">Пароль</label>
              <PasswordField
                id="diag-soap-password"
                value={settings.soap.password ?? ''}
                disabled
                placeholder={settings.local ? 'пусто' : 'скрыт — виден только на сервере'}
                canReveal={settings.local && !!settings.soap.password}
                state={settings.soap.passwordState}
              />
              <label htmlFor="diag-soap-stub">Заглушка</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input id="diag-soap-stub" type="checkbox" checked={settings.soap.useStub} disabled />
                <span style={muted}>
                  {settings.soap.useStub ? 'включена — поиск идёт в заглушку, а не в настоящий сервис' : 'выключена — поиск идёт в настоящий сервис'}
                </span>
              </label>
            </div>
            {settings.soap.useStub && settings.environment === 'Production' && (
              <Note tone="error">В боевом режиме включена заглушка (TerminalSoap:UseStub): киоск не ходит в настоящий сервис.</Note>
            )}
            <p style={{ ...muted, marginTop: 10 }}>Меняются только в файле настроек; после правки перезапустите пул приложений.</p>
          </section>

          {/* ─── Поиск ─── */}
          <form style={panel} onSubmit={runSearch}>
            <h2 style={heading}>Поиск посетителя</h2>
            <p style={{ ...muted, marginTop: 4 }}>
              Тот же запрос GetVisitor, что делает киоск, — от имени указанного терминала. В журналы БД не пишется.
            </p>
            <div style={grid}>
              <label htmlFor="diag-terminal">TerminalName</label>
              <input
                id="diag-terminal"
                list="diag-terminals"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                style={field(false)}
              />
              <label htmlFor="diag-iin">ИИН</label>
              <input
                id="diag-iin"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                maxLength={MAX_SEARCH_LENGTH}
                spellCheck={false}
                autoComplete="off"
                style={field(false)}
              />
            </div>
            <datalist id="diag-terminals">
              {terminals.map((t, i) => t.name && <option key={`${i}-${t.name}`} value={t.name}>{t.ip ?? ''}</option>)}
            </datalist>
            <div style={row}>
              <button type="submit" disabled={!canSearch} style={btn(true, !canSearch)}>
                {searchBusy ? 'Ищу…' : 'Найти'}
              </button>
              {terminals.length === 0 && <span style={muted}>Имена терминалов подскажет «Тест подключения».</span>}
            </div>
            <SearchResultView run={searchRun} />
          </form>
        </>
      )}
    </div>
  );
}

function DbResultView({ run, local, changed }: { run: Run<DbTestResult>; local: boolean; changed: boolean }) {
  if (run.state === 'idle') return null;
  if (run.state === 'busy') return <Note tone="busy" data="busy">Подключаюсь… Если сервер не отвечает — до 10 с.</Note>;
  if (run.state === 'failed') return <Note tone="error" data="failed">{run.message}</Note>;

  const r = run.result;
  if (!r.ok)
    return (
      <Note tone="error" data="error">
        <b>
          Не подключилось{r.elapsedMs ? ` — ${ms(r.elapsedMs)}` : ''}
          {r.errorNumber != null && `, код ${r.errorNumber}`}
        </b>
        {r.hint && <p style={{ marginTop: 6 }}>{r.hint}</p>}
        {r.tcpProbe && <p style={{ marginTop: 6 }}>{r.tcpProbe}</p>}
        {r.error && <p style={{ ...detail, marginTop: 6 }}>{r.error}</p>}
      </Note>
    );

  return (
    <Note tone="ok" data="ok">
      <b>Подключено за {ms(r.elapsedMs)}</b>
      <p style={{ marginTop: 4 }}>
        SQL Server {r.version}
        {r.edition && ` · ${r.edition}`}
      </p>
      <p>
        Сервер {r.serverName} · база {r.database} · логин {r.login}
      </p>
      {r.transport && (
        <p>
          Соединение: {r.transport}
          {r.serverAddress && `, ${r.serverAddress}`}
          {r.encrypted ? ', шифрованное' : ', без шифрования'}
        </p>
      )}
      {r.terminalsError ? (
        <p style={{ color: '#c62828', marginTop: 6 }}>TerminalInfo не читается: {r.terminalsError}</p>
      ) : (
        r.terminals && <TerminalsView terminals={r.terminals} clientIp={local ? null : r.clientIp} />
      )}
      {!local && !r.terminalsError && (
        <p style={{ marginTop: 6 }}>
          {r.clientTerminal
            ? `Этот терминал в TerminalInfo: ${r.clientTerminal} (${r.clientIp}).`
            : `IP ${r.clientIp} нет в TerminalInfo — поиск в киоске с этого компьютера не пройдёт.`}
        </p>
      )}
      {changed && (
        <p style={{ marginTop: 8 }}>
          Это проверка значений из формы, приложение по-прежнему работает с настройками из файла. Чтобы оно использовало
          эти значения, пропишите их в appsettings.Production.json и перезапустите пул приложений.
        </p>
      )}
    </Note>
  );
}

function TerminalsView({ terminals, clientIp }: { terminals: DiagTerminal[]; clientIp: string | null }) {
  const cell: CSSProperties = { padding: '2px 16px 2px 0', textAlign: 'left' };
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer' }}>
        В TerminalInfo {terminals.length} {plural(terminals.length, 'терминал', 'терминала', 'терминалов')}
      </summary>
      <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
        <thead>
          <tr style={muted}>
            <th style={cell}>TerminalName</th>
            <th style={cell}>IP</th>
          </tr>
        </thead>
        <tbody>
          {terminals.map((t, i) => (
            <tr key={i} style={clientIp && t.ip?.trim() === clientIp ? { fontWeight: 700 } : undefined}>
              <td style={cell}>{t.name ?? '—'}</td>
              <td style={cell}>{t.ip ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function SearchResultView({ run }: { run: Run<SearchResult> }) {
  if (run.state === 'idle') return null;
  if (run.state === 'busy') return <Note tone="busy" data="busy">Ищу… Если сервис не отвечает — до минуты.</Note>;
  if (run.state === 'failed') return <Note tone="error" data="failed">{run.message}</Note>;

  const r = run.result;
  const stub = r.stub ? ' (заглушка, не настоящий сервис)' : '';
  if (!r.ok)
    return (
      <Note tone="error" data="error">
        <b>Сервис недоступен — ошибка через {ms(r.elapsedMs)}{stub}</b>
        {r.hint && <p style={{ marginTop: 6 }}>{r.hint}</p>}
        {r.error && <p style={{ ...detail, marginTop: 6 }}>{r.error}</p>}
      </Note>
    );

  if (!r.found || !r.card)
    return (
      <Note tone="warn" data="notfound">
        <b>Пропуск не найден — сервис ответил за {ms(r.elapsedMs)}{stub}</b>
        {r.message && <p style={{ marginTop: 6 }}>Ответ сервиса: {r.message}</p>}
      </Note>
    );

  return (
    <Note tone="ok" data="found">
      <b>Найден — сервис ответил за {ms(r.elapsedMs)}{stub}</b>
      <CardView card={r.card} />
      {r.message && <p style={{ marginTop: 6 }}>Ответ сервиса: {r.message}</p>}
    </Note>
  );
}

function CardView({ card }: { card: VisitorCard }) {
  const type = card.dictPassCardTypeId;
  const rows: [string, ReactNode][] = [
    ['Посетитель', card.visitorFullname],
    ['Пригласил', card.invitersFullname],
    ['Телефон', card.invitersPhoneNumber],
    ['Этаж / кабинет', `${card.cabinetFloor ?? '—'} / ${card.cabinetNumber ?? '—'}`],
    ['Тип пропуска', type === 3 ? '3 — фото с красной рамкой' : type],
    ['Фото', card.needPhoto ? 'нужно — киоск откроет камеру' : 'не нужно'],
    ['CardID', card.cardId],
  ];
  return (
    <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ ...muted, padding: '2px 16px 2px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
            <td style={{ padding: '2px 0' }}>{value ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
