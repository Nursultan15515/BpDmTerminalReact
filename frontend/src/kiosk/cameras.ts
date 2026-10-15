import { loadSaved, save } from '../idscan/setup';
import { findCamera, type CameraChoice } from './cameraMatch';

export { choiceFor, findCamera, type CameraChoice } from './cameraMatch';

// Камеры терминала: для фото лица и для документа. Выбирают на странице «Камеры» (?cameras), камеру документа —
// ещё и на ?idscan (там к ней рисуют рамку карты). Запоминается в localStorage этого браузера: id, название и номер
// среди одноимённых — как камера находится, см. cameraMatch.ts. Не выбрана или не подключена — камера
// по умолчанию (браузер берёт первую в списке).

const PHOTO_KEY = 'camera.photo';

export function loadPhotoCamera(): CameraChoice | null {
  try {
    const choice = JSON.parse(localStorage.getItem(PHOTO_KEY) ?? 'null') as CameraChoice | null;
    return choice?.deviceId ? choice : null;
  } catch {
    return null;
  }
}

export function savePhotoCamera(choice: CameraChoice | null) {
  try {
    if (choice) localStorage.setItem(PHOTO_KEY, JSON.stringify(choice));
    else localStorage.removeItem(PHOTO_KEY);
  } catch {
    /* без localStorage выбор просто не запоминается */
  }
}

// Камера документа хранится в настройках распознавания (?idscan): к её id там привязана рамка карты.
export function loadDocumentCamera(): CameraChoice | null {
  const saved = loadSaved();
  return saved.deviceId ? { deviceId: saved.deviceId, label: saved.deviceLabel ?? '', index: saved.deviceIndex } : null;
}

export function saveDocumentCamera(choice: CameraChoice | null) {
  save({ deviceId: choice?.deviceId ?? '', deviceLabel: choice?.label ?? '', deviceIndex: choice?.index ?? 0 });
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

/**
 * Камера для фото лица: id выбранной; null — камера по умолчанию. missing — выбранная, но не подключённая
 * (о ней стоит сообщить в журнал ошибок). Нашлась не по id — запоминаем её нынешний id.
 */
export async function resolvePhotoCamera(): Promise<{ deviceId: string | null; missing: CameraChoice | null }> {
  const choice = loadPhotoCamera();
  if (!choice) return { deviceId: null, missing: null };
  const found = findCamera(await listCameras(), choice);
  if (!found) return { deviceId: null, missing: choice };
  if (found.deviceId !== choice.deviceId) savePhotoCamera({ ...choice, deviceId: found.deviceId });
  return { deviceId: found.deviceId, missing: null };
}

/**
 * Камера документа: id выбранной ('' — по умолчанию). Нашлась не по id — запоминаем её нынешний id и переносим
 * на него рамку карты. Не нашлась — отдаём запомненный id: тот, кто открывает камеру, сам возьмёт камеру
 * по умолчанию, если такой нет.
 */
export async function resolveDocumentCamera(): Promise<string> {
  const choice = loadDocumentCamera();
  if (!choice) return '';
  const found = findCamera(await listCameras(), choice);
  if (!found) return choice.deviceId;
  if (found.deviceId !== choice.deviceId) {
    const cards = loadSaved().cameraCards ?? {};
    const card = cards[choice.deviceId];
    save({ deviceId: found.deviceId, cameraCards: card ? { ...cards, [found.deviceId]: card } : cards });
  }
  return found.deviceId;
}
