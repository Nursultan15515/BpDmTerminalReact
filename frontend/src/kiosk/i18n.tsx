import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'KK' | 'RU' | 'EN';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'EN', label: 'ENG' },
  { id: 'KK', label: 'ҚАЗ' },
  { id: 'RU', label: 'РУС' },
];

type WelcomeRule = { kicker: string; text: string; chips?: string[] };

const ru = {
  status: { ready: 'Терминал готов к работе' },
  welcome: {
    kicker: 'Бюро пропусков',
    title: 'Получите пропуск',
    rulesTitle: 'Правила получения пропуска',
    pointsLabel: 'пункта',
    rules: [
      {
        kicker: 'Сохранность пропуска',
        text: 'Настоящим, даю свое согласие за сохранность разового пропуска, а также его возврат в картоприемник, установленный при выходе.',
      },
      {
        kicker: 'Утеря или порча',
        text: 'В случае утери или порчи пропуска, обязуюсь восстановить (предоставить пропуск того же рода и качества).',
      },
      {
        kicker: 'Ответственность за ущерб',
        chips: ['ст. 917 ГК РК', 'ст. 934 ГК РК'],
        text: 'Согласно ст.917 Гражданского Кодекса РК, вред, причиненный неправомерными действиями (бездействием) имущественным или неимущественным благам и правам граждан и юридических лиц, подлежит возмещению лицом, причинившим вред в полном объеме. Лицо, ответственное за вред, обязано полностью возместить причиненные убытки или возместить его в натуре (предоставить вещь того же рода и качества, исправить поврежденную вещь и т.п.) согласно ст.934 Гражданского Кодекса РК.',
      },
      {
        kicker: 'Контакты',
        text: 'В случае утери пропуска необходимо обратиться по тел. 4-50-00.',
      },
    ] as WelcomeRule[],
    sub: 'Для получения пропуска выберите язык и нажмите кнопку «Начать»',
    start: 'Начать',
  },
  manual: {
    title: 'Поиск пропуска',
    label: 'Введите ИИН или номер документа',
    placeholder: 'Например, 990101300123',
    back: 'Назад',
    search: 'Найти',
  },
  keyboard: { space: 'пробел' },
  found: {
    active: 'Активен',
    title: 'Пропуск найден',
    sub: 'Проверьте данные и посмотрите в камеру, чтобы сделать фото',
    visitor: 'Посетитель',
    invite: 'Приглашающий',
    invitePhone: 'Телефон приглашающего',
    floor: 'Этаж',
    cabinet: 'Кабинет',
    retake: 'Переснять',
    takePhoto: 'Сделать фото',
    sending: 'Отправка…',
    photoDone: 'Фото сделано',
    placeFace: 'Расположите лицо в овале',
    checking: 'Проверяем фото…',
    pillReady: 'Готово',
    pillChecking: 'Проверка',
    pillError: 'Ошибка',
    pillCamera: 'Камера',
    errCamera: 'Камера недоступна. Проверьте подключение.',
    errUpload: 'Не удалось отправить фото. Попробуйте снова.',
  },
  confirm: {
    title: 'Проверьте данные',
    sub: 'Убедитесь, что данные пропуска верны, и подтвердите',
    yes: 'Да, всё верно',
    no: 'Нет, отмена',
  },
  result: {
    title: 'Пропуск не найден',
    descPre: 'По запросу',
    descPost: ' пропуск не найден. Проверьте номер и попробуйте снова или обратитесь на пост охраны.',
  },
  giveCard: {
    title: 'Получите карту',
    issuing: 'Выдаём карту…',
    noCards: 'Карты закончились',
    noCardsDesc: 'В терминале закончились карты. Обратитесь на пост охраны.',
    errorTitle: 'Не удалось выдать карту',
    errorDesc: 'Карта не выдана. Обратитесь на пост охраны.',
  },
  error: {
    title: 'Сервис недоступен',
    desc: 'Не удалось получить данные пропуска. Проверьте соединение и попробуйте снова или обратитесь на пост охраны.',
  },
  loading: { text: 'Загрузка…' },
  success: {
    title: 'Регистрация завершена',
    desc: 'Заберите карту и пройдите на пост охраны.',
    // Отсчёт — как в легаси OfferTakeСard.
    takeWithin: (n: number) =>
      `Пожалуйста, заберите карту в течение ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'секунды' : 'секунд'}`,
  },
  common: { retry: 'Попробовать снова', home: 'На главную', done: 'Готово' },
};

type Dict = typeof ru;

const kk: Dict = {
  status: { ready: 'Терминал жұмысқа дайын' },
  welcome: {
    kicker: 'Рұқсат бюросы',
    title: 'Рұқсатнама алыңыз',
    rulesTitle: 'Рұқсаттаманы алу ережелері',
    pointsLabel: 'тармақ',
    rules: [
      {
        kicker: 'Рұқсаттаманың сақталуы',
        text: 'Мен осымен бір реттік рұқсаттаманың қауіпсіздігіне, сондай-ақ оны шығуда орнатылған картқабылдағышқа қайтаруға келісімімді беремін.',
      },
      {
        kicker: 'Жоғалу немесе бүліну',
        text: 'Рұқсаттаманың жоғалған немесе бүлінген жағдайда, мен қалпына келтіруге міндеттенемін (сол түрдегі және сападағы рұқсаттаманы қамтамасыз етемін).',
      },
      {
        kicker: 'Зиян үшін жауапкершілік',
        chips: ['ҚР АК 917-бабы', 'ҚР АК 934-бабы'],
        text: 'Қазақстан Республикасының азаматтық кодексінің 917 бабына сәйкес, азаматтар мен заңды тұлғалардың мүліктік немесе мүліктік емес игіліктері мен құқықтарына заңсыз іс-әрекеттермен (әрекетсіздікпен) келтірілген (мүліктік және (немесе) мүліктік емес) зиянды, оны келтірген тұлға толық көлемінде өтеуге тиіс. Қазақстан Республикасының азаматтық кодексінің 934 бабына сәйкес, жауапты адамды келтірген зиянды толық өтеуге немесе оны заттай өтеуге (тегі мен сапасы нақ сондай зат беру, бүлінген затты жөндеуге және т.б.) міндеттейді.',
      },
      {
        kicker: 'Байланыс',
        text: 'Рұқсаттаманы жоғалтқан жағдайда көрсетілген тел. арқылы хабарласу керек 4-50-00.',
      },
    ] as WelcomeRule[],
    sub: 'Рұқсаттама алу үшін тілді таңдап, «Бастау» батырмасын басыңыз',
    start: 'Бастау',
  },
  manual: {
    title: 'Рұқсатнаманы іздеу',
    label: 'ЖСН немесе құжат нөмірін енгізіңіз',
    placeholder: 'Мысалы, 990101300123',
    back: 'Артқа',
    search: 'Іздеу',
  },
  keyboard: { space: 'бос орын' },
  found: {
    active: 'Белсенді',
    title: 'Рұқсатнама табылды',
    sub: 'Деректерді тексеріп, фото түсіру үшін камераға қараңыз',
    visitor: 'Келуші',
    invite: 'Шақырушы',
    invitePhone: 'Шақырушының телефоны',
    floor: 'Қабат',
    cabinet: 'Кабинет',
    retake: 'Қайта түсіру',
    takePhoto: 'Фото түсіру',
    sending: 'Жіберілуде…',
    photoDone: 'Фото түсірілді',
    placeFace: 'Бетіңізді сопақшаға орналастырыңыз',
    checking: 'Фото тексерілуде…',
    pillReady: 'Дайын',
    pillChecking: 'Тексеру',
    pillError: 'Қате',
    pillCamera: 'Камера',
    errCamera: 'Камера қолжетімсіз. Қосылымды тексеріңіз.',
    errUpload: 'Фотоны жіберу мүмкін болмады. Қайталап көріңіз.',
  },
  confirm: {
    title: 'Деректерді тексеріңіз',
    sub: 'Рұқсатнама деректерінің дұрыстығын тексеріп, растаңыз',
    yes: 'Иә, бәрі дұрыс',
    no: 'Жоқ, болдырмау',
  },
  result: {
    title: 'Рұқсатнама табылмады',
    descPre: 'Сұраныс бойынша',
    descPost: ' рұқсатнама табылмады. Нөмірді тексеріп, қайталап көріңіз немесе күзет постына хабарласыңыз.',
  },
  giveCard: {
    title: 'Картаны алыңыз',
    issuing: 'Карта берілуде…',
    noCards: 'Карталар бітті',
    noCardsDesc: 'Терминалда карталар бітті. Күзет постына хабарласыңыз.',
    errorTitle: 'Картаны беру мүмкін болмады',
    errorDesc: 'Карта берілмеді. Күзет постына хабарласыңыз.',
  },
  error: {
    title: 'Қызмет қолжетімсіз',
    desc: 'Рұқсатнама деректерін алу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз немесе күзет постына хабарласыңыз.',
  },
  loading: { text: 'Жүктелуде…' },
  success: {
    title: 'Тіркеу аяқталды',
    desc: 'Картаны алып, күзет постына өтіңіз.',
    takeWithin: (n: number) => `${n} секунд ішінде картаны алуыңызды өтінеміз`,
  },
  common: { retry: 'Қайталап көру', home: 'Басты бетке', done: 'Дайын' },
};

const en: Dict = {
  status: { ready: 'Terminal ready' },
  welcome: {
    kicker: 'Pass office',
    title: 'Get your pass',
    rulesTitle: 'Pass issuance rules',
    pointsLabel: 'points',
    rules: [
      {
        kicker: 'Pass safekeeping',
        text: 'I hereby give my consent for the safety of a one-time pass, as well as its return to the card collector installed at the exit.',
      },
      {
        kicker: 'Loss or damage',
        text: 'In case of loss or damage to the pass, I undertake to restore it (provide a pass of the same type and quality).',
      },
      {
        kicker: 'Liability for damage',
        chips: ['Art. 917 Civil Code', 'Art. 934 Civil Code'],
        text: 'According to the Art. 917 of the Civil Code of the Republic of Kazakhstan, the injury (property and (or) non-property damage), caused by illegal actions (inaction) to the property or non-property benefits and rights of citizens and legal entities shall be subject to full redress by the person who inflicted the injury. According to the Art. 934 of the Civil Code of the Republic of Kazakhstan, the person responsible for the infliction of injury shall compensate for the losses incurred in full or redress injury in kind (to present a thing of the same sort and quality, to repair a damaged thing, etc.).',
      },
      {
        kicker: 'Contacts',
        text: 'In case of loss of the pass, you must contact by phone 4-50-00.',
      },
    ] as WelcomeRule[],
    sub: 'To get a pass, select a language and press “Start”',
    start: 'Start',
  },
  manual: {
    title: 'Find your pass',
    label: 'Enter IIN or document number',
    placeholder: 'e.g. 990101300123',
    back: 'Back',
    search: 'Search',
  },
  keyboard: { space: 'space' },
  found: {
    active: 'Active',
    title: 'Pass found',
    sub: 'Check the details and look at the camera to take a photo',
    visitor: 'Visitor',
    invite: 'Host',
    invitePhone: "Host's phone",
    floor: 'Floor',
    cabinet: 'Office',
    retake: 'Retake',
    takePhoto: 'Take photo',
    sending: 'Sending…',
    photoDone: 'Photo taken',
    placeFace: 'Position your face in the oval',
    checking: 'Checking photo…',
    pillReady: 'Done',
    pillChecking: 'Checking',
    pillError: 'Error',
    pillCamera: 'Camera',
    errCamera: 'Camera unavailable. Check the connection.',
    errUpload: 'Could not send the photo. Try again.',
  },
  confirm: {
    title: 'Check the details',
    sub: 'Make sure the pass details are correct and confirm',
    yes: 'Yes, correct',
    no: 'No, cancel',
  },
  result: {
    title: 'Pass not found',
    descPre: 'No pass found for',
    descPost: '. Check the number and try again or contact the security desk.',
  },
  giveCard: {
    title: 'Take your card',
    issuing: 'Issuing card…',
    noCards: 'Out of cards',
    noCardsDesc: 'The terminal is out of cards. Please contact the security desk.',
    errorTitle: 'Could not issue the card',
    errorDesc: 'The card was not issued. Please contact the security desk.',
  },
  error: {
    title: 'Service unavailable',
    desc: 'Could not retrieve pass data. Check the connection and try again or contact the security desk.',
  },
  loading: { text: 'Loading…' },
  success: {
    title: 'Registration complete',
    desc: 'Take your card and proceed to the security desk.',
    takeWithin: (n: number) => `Please take your card within ${n} ${n === 1 ? 'second' : 'seconds'}`,
  },
  common: { retry: 'Try again', home: 'Home', done: 'Done' },
};

const COPY: Record<Lang, Dict> = { KK: kk, RU: ru, EN: en };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang ?? 'RU');
  return <I18nContext.Provider value={{ lang, setLang, t: COPY[lang] }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
