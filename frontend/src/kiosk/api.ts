import axios from 'axios';
import type { VisitorCard } from './constants';

// Чуть больше бэкендового таймаута SOAP (15 с): если источник не отвечает, киоск
// гарантированно покажет экран ошибки, а не зависнет (как в старом терминале).
const REQUEST_TIMEOUT_MS = 20000;

export type VisitorLookup =
  | { kind: 'found'; card: VisitorCard }
  | { kind: 'notfound'; message?: string };

// 404 = посетитель не найден (нормальный исход поиска); прочие ошибки пробрасываем,
// чтобы вызывающий показал экран ошибки сети/сервиса.
export async function searchVisitor(searchValue: string): Promise<VisitorLookup> {
  try {
    const { data } = await axios.post<VisitorCard>(
      '/api/visitors/search',
      { searchValue },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    return { kind: 'found', card: data };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      const body = e.response.data as { message?: string };
      return { kind: 'notfound', message: body?.message };
    }
    throw e;
  }
}

export type SavePhotoResult = { kind: 'ok' } | { kind: 'rejected'; message: string };

// Бэкенд проверяет лицо локально (OpenCV) ДО отправки в SOAP — сам сервис лицо не валидирует.
// 422 — лицо не распознано (просим переснять). force=true (последняя попытка) пропускает проверку.
// Прочие ошибки (502 — реальный сбой сохранения, сеть) пробрасываются как жёсткие.
export async function savePhoto(
  cardId: string,
  base64Photo: string,
  dictPassCardTypeId: number,
  force: boolean,
): Promise<SavePhotoResult> {
  try {
    await axios.post(
      '/api/visitors/photo',
      { cardId, base64Photo, dictPassCardTypeId, force },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    return { kind: 'ok' };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const message = (e.response.data as { message?: string })?.message ?? 'Лицо не распознано. Переснимите фото.';
      return { kind: 'rejected', message };
    }
    throw e;
  }
}

// Привязка RFID выданной карты к пропуску в SOAP. false — не привязалась (терминал не найден
// по IP, сбой SOAP; причину бэкенд пишет в TerminalError): такую карту посетителю не отдаём.
export async function setRfid(cardId: string, rfidNumber: string): Promise<boolean> {
  const { data } = await axios.post<{ status: boolean }>(
    '/api/visitors/rfid',
    { cardId, rfidNumber },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data.status === true;
}

// Статус диспенсера — на бэкенд: по IP терминала он решает, сообщать ли в SOAP, что карты
// заканчиваются (легаси: Index.cshtml → SendCardEndInformation). Best-effort, ответа не ждём.
export function reportCardStatus(status: number): void {
  axios.post('/api/terminal/card-status', { status }, { timeout: REQUEST_TIMEOUT_MS }).catch(() => {});
}

// Ошибка на стороне киоска (диспенсер, камера) — в TerminalError с IP терминала
// (легаси: ErrorPage?errorMessage=…). Best-effort: сбой самой отправки сценарию не мешает.
export function reportError(description: string, notice?: string): void {
  axios.post('/api/terminal/errors', { description, notice }, { timeout: REQUEST_TIMEOUT_MS }).catch(() => {});
}

// Текст ошибки запроса для лога: HTTP-код и поле error из тела ответа, если оно есть.
export function errorText(e: unknown): string {
  if (!axios.isAxiosError(e)) return String(e);
  if (!e.response) return e.message;
  const detail = (e.response.data as { error?: unknown } | undefined)?.error;
  return detail ? `HTTP ${e.response.status}: ${String(detail)}` : `HTTP ${e.response.status}`;
}

// ─── Диспенсер карт: сервис на самом терминале, браузер ходит к нему напрямую ─────
// Как в легаси. Через бэкенд нельзя: он может стоять не на терминале и до его localhost не достанет.
// card-status и issue-card — POST без тела, как fetch в легаси (простой CORS-запрос, без preflight).

const HARDWARE_URL = (import.meta.env.VITE_HARDWARE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

export interface CardStatus {
  status: number;
}

export async function getCardStatus(): Promise<CardStatus> {
  const { data } = await axios.post<CardStatus>(`${HARDWARE_URL}/card-status/`, undefined, {
    timeout: REQUEST_TIMEOUT_MS,
  });
  return data;
}

export interface IssueCardResult {
  success: boolean;
  operationId?: string | null;
  uid?: string | null;
  error?: string | null;
}

export async function issueCard(): Promise<IssueCardResult> {
  const { data } = await axios.post<IssueCardResult>(`${HARDWARE_URL}/issue-card/`, undefined, {
    timeout: REQUEST_TIMEOUT_MS,
  });
  return data;
}

export interface ConfirmResult {
  action?: string | null;
  uid?: string | null;
  error?: string | null;
}

// allow=true — отдать карту посетителю, false — оставить её в диспенсере.
export async function confirmCard(operationId: string, allow: boolean): Promise<ConfirmResult> {
  const { data } = await axios.post<ConfirmResult>(
    `${HARDWARE_URL}/confirm/`,
    { operationId, allow },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}
