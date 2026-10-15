// Сопоставление запомненной камеры с подключёнными. Без браузера и без импортов — проверяется юнит-тестами
// (test/cameras.test.mjs).

export interface CameraChoice {
  deviceId: string;
  label: string;
  /** Номер среди камер с тем же названием (одна модель — одно название) — по порядку, в каком их отдаёт браузер. */
  index?: number;
}

type Camera = Pick<MediaDeviceInfo, 'deviceId' | 'label'>;

/** Что запомнить о камере из списка: id, название и номер среди одноимённых. */
export function choiceFor(cameras: Camera[], camera: Camera): CameraChoice {
  const index = cameras.filter((d) => d.label === camera.label).indexOf(camera);
  return { deviceId: camera.deviceId, label: camera.label, index: Math.max(index, 0) };
}

/**
 * Подключённая камера для запомненного выбора. Id в Chrome бывает новым на каждой загрузке страницы (если разрешение
 * на камеру не сохранено — например, его даёт флаг киоска) и меняется, если камеру переткнуть в другой порт.
 * Поэтому: по id, иначе по названию, а у одинаковых камер (одно название) — по их порядку в списке.
 */
export function findCamera<T extends Camera>(cameras: T[], choice: CameraChoice | null): T | null {
  if (!choice) return null;
  const byId = cameras.find((d) => d.deviceId === choice.deviceId);
  if (byId) return byId;
  if (!choice.label) return null;
  const same = cameras.filter((d) => d.label === choice.label);
  return same.length === 1 ? same[0] : (same[choice.index ?? 0] ?? null);
}
