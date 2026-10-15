import type { ResultType, Screen, VisitorCard } from './constants';
import type { Lang } from './i18n';

// Галерея экранов — только в dev: ?screen=<id>&lang=RU|KK|EN открывает экран сразу, с тестовыми
// данными, без прохода сценария (список ссылок — ?gallery). В боевой сборке import.meta.env.DEV
// равен false, и всё это вырезается.
export const GALLERY_SCREENS = {
  welcome: 'Приветствие и правила',
  choose: 'Выбор: сканировать удостоверение или ввести вручную',
  scan: 'Сканирование удостоверения (нужна камера)',
  manual: 'Ручной ввод',
  loading: 'Загрузка',
  notfound: 'Пропуск не найден',
  error: 'Сервис недоступен',
  confirm: 'Проверка данных',
  photo: 'Фото (нужна камера)',
  giveCard: 'Выдача карты (идёт в эмулятор диспенсера)',
  success: 'Заберите карту — отсчёт 15 с',
  nocards: 'Карты закончились',
  settings: 'Настройка экрана (наладчик)',
} as const;

export type GalleryScreen = keyof typeof GALLERY_SCREENS;

// Длинные значения — чтобы видеть переносы и обрезку на всех языках. Номер заканчивается на 4:
// у заглушки SOAP это обычный сценарий (см. StubTerminalSoapClient).
export const SAMPLE_CARD: VisitorCard = {
  cardId: 'STUB-990101300124',
  visitorFullname: 'Сарсенбаева-Константинопольская Әйгерім Бауыржанқызы',
  invitersFullname: 'Жумагалиев Ерлан Бакытжанович',
  invitersPhoneNumber: '+7 (7172) 74-56-98',
  cabinetFloor: '12',
  cabinetNumber: '1204',
  needPhoto: true,
  dictPassCardTypeId: 1,
};

export interface DevStart {
  screen: Screen;
  resultType: ResultType;
  card: VisitorCard | null;
  query: string;
  settingsOpen: boolean;
}

export function readDevStart(): DevStart | null {
  if (!import.meta.env.DEV) return null;
  const id = new URLSearchParams(window.location.search).get('screen');
  if (!id || !(id in GALLERY_SCREENS)) return null;

  const s = id as GalleryScreen;
  const isResult = s === 'loading' || s === 'notfound' || s === 'error';
  return {
    screen: isResult ? 'result' : s === 'settings' ? 'welcome' : s,
    resultType: s === 'notfound' ? 'notfound' : s === 'error' ? 'error' : 'loading',
    card: s === 'confirm' || s === 'photo' || s === 'giveCard' ? SAMPLE_CARD : null,
    query: '990101300120',
    settingsOpen: s === 'settings',
  };
}

export function readDevLang(): Lang | undefined {
  if (!import.meta.env.DEV) return undefined;
  const lang = new URLSearchParams(window.location.search).get('lang')?.toUpperCase();
  return lang === 'RU' || lang === 'KK' || lang === 'EN' ? lang : undefined;
}
