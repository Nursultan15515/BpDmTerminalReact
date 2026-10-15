import axios from 'axios';
import type { VisitorCard } from '../kiosk/constants';

// Бэкенд страницы диагностики: DiagController (api/diag).

/** set — задан, placeholder — остался CHANGE-ME, empty — пусто, windows — вход Windows (пароля нет). */
export type SecretState = 'set' | 'placeholder' | 'empty' | 'windows';

export interface DiagSettings {
  environment: string;
  machine: string;
  clientIp: string | null;
  /** Страница открыта на самом сервере: видны пароли, можно проверять другие значения. */
  local: boolean;
  configFiles: { name: string; exists: boolean }[];
  db: {
    server: string | null;
    database: string | null;
    user: string | null;
    windowsAuth: boolean;
    password: string | null;
    passwordState: SecretState;
    error: string | null;
  };
  soap: { endpoint: string; password: string | null; passwordState: SecretState; useStub: boolean };
}

export interface DbValues {
  server: string;
  database: string;
  user: string;
  password: string;
}

export interface DiagTerminal {
  name: string | null;
  ip: string | null;
}

export interface DbTestResult {
  ok: boolean;
  elapsedMs: number;
  serverName: string | null;
  database: string | null;
  login: string | null;
  version: string | null;
  edition: string | null;
  transport: string | null;
  encrypted: boolean | null;
  serverAddress: string | null;
  terminals: DiagTerminal[] | null;
  terminalsError: string | null;
  clientIp: string | null;
  clientTerminal: string | null;
  error: string | null;
  errorNumber: number | null;
  hint: string | null;
  /** Проверка TCP-порта сервера — при неудачном подключении: сеть это или уже SQL Server. */
  tcpProbe: string | null;
}

export interface SearchResult {
  ok: boolean;
  elapsedMs: number;
  found: boolean;
  message: string | null;
  card: VisitorCard | null;
  stub: boolean;
  error: string | null;
  hint: string | null;
}

export async function getSettings(): Promise<DiagSettings> {
  return (await axios.get<DiagSettings>('/api/diag/settings', { timeout: 15000 })).data;
}

/** Пустые поля — значения из настроек; с терминала передаётся пустой объект. */
export async function testDb(values: Partial<DbValues>): Promise<DbTestResult> {
  return (await axios.post<DbTestResult>('/api/diag/db-test', values, { timeout: 30000 })).data;
}

// Поиск ждёт сам SOAP-вызов, а у WCF таймаут по умолчанию — минута: ждём дольше, чтобы увидеть ответ бэкенда.
export async function searchVisitor(terminalName: string, searchValue: string): Promise<SearchResult> {
  return (await axios.post<SearchResult>('/api/diag/search', { terminalName, searchValue }, { timeout: 90000 })).data;
}

export function errorMessage(e: unknown): string {
  if (!axios.isAxiosError(e)) return String(e);
  const body = e.response?.data as { error?: string; title?: string } | undefined;
  if (body?.error) return body.error;
  if (e.response) return `HTTP ${e.response.status}${body?.title ? `: ${body.title}` : ''}`;
  return e.code === 'ECONNABORTED' ? 'бэкенд не ответил вовремя' : `бэкенд недоступен (${e.message})`;
}
