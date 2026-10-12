import { useEffect, useRef, useState } from 'react';
import { type VisitorCard } from '../constants';
import {
  confirmCard,
  errorText,
  getCardStatus,
  issueCard,
  reportCardStatus,
  reportError,
  setRfid,
  type IssueCardResult,
} from '../api';
import { useI18n } from '../i18n';
import { NoCardsScreen } from './NoCardsScreen';
import { ErrorScreen } from './ErrorScreen';

type Outcome = 'issued' | 'nocards' | 'error';
type Phase = 'issuing' | Exclude<Outcome, 'issued'>;

// Экран «карты закончились» сам уходит на главную.
const AUTO_HOME_MS = 30000;

// Порт легаси GiveCard.cshtml: issue-card → SetVisitorsRFID → confirm.
async function issueCardFor(cardId: string): Promise<Outcome> {
  const notice = `GiveCard; cardId=${cardId}`;

  let issued: IssueCardResult;
  try {
    issued = await issueCard();
  } catch (e) {
    reportError(`issue-card: ${errorText(e)}`, notice);
    return 'error';
  }

  if (!issued.success) {
    // success:false бывает не только при пустом диспенсере (например, не прочитался UID):
    // уточняем статус, чтобы не слать в SOAP ложное «карты закончились».
    const status = await getCardStatus().catch(() => null);
    if (status?.status === 0) {
      reportCardStatus(0);
      return 'nocards';
    }
    reportError(`issue-card: ${issued.error ?? 'success=false'}`, notice);
    return 'error';
  }

  const { operationId, uid } = issued;
  if (!operationId) {
    reportError('issue-card: no operationId', notice);
    return 'error';
  }

  // Как в легаси: карту отдаём, только если RFID привязался к пропуску. Иначе confirm(allow=false) —
  // карта остаётся в диспенсере. Отказ сервиса бэкенд уже записал в TerminalError.
  let bound = false;
  if (!uid) {
    reportError('issue-card: no uid', notice);
  } else {
    try {
      bound = await setRfid(cardId, uid);
    } catch (e) {
      reportError(`rfid: ${errorText(e)}`, notice);
    }
  }

  if (!bound) {
    await confirmCard(operationId, false).catch((e) => reportError(`confirm(allow=false): ${errorText(e)}`, notice));
    return 'error';
  }

  // Сбой подтверждения только логируем и ведём на экран «заберите карту» — как легаси (там был alert).
  try {
    const confirmed = await confirmCard(operationId, true);
    if (confirmed.error) reportError(`confirm: ${confirmed.error}`, notice);
  } catch (e) {
    reportError(`confirm: ${errorText(e)}`, notice);
  }
  return 'issued';
}

export function GiveCardScreen({
  accent,
  card,
  onDone,
  onHome,
}: {
  accent: string;
  card: VisitorCard;
  onDone: () => void;
  onHome: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('issuing');
  // Выдаём карту один раз на монтировании, даже при повторных рендерах под StrictMode.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    issueCardFor(card.cardId ?? '').then((outcome) => (outcome === 'issued' ? onDone() : setPhase(outcome)));
  }, [card.cardId, onDone]);

  // Пока идёт выдача, на главную сами не уходим: каждый запрос ограничен таймаутом, а уход
  // посреди сценария выпустил бы карту, когда посетитель уже на главном экране.
  // Экран ошибки возвращается на главную сам.
  useEffect(() => {
    if (phase !== 'nocards') return;
    const id = setTimeout(onHome, AUTO_HOME_MS);
    return () => clearTimeout(id);
  }, [phase, onHome]);

  if (phase === 'nocards') return <NoCardsScreen accent={accent} onHome={onHome} />;
  if (phase === 'error') {
    return <ErrorScreen accent={accent} title={t.giveCard.errorTitle} desc={t.giveCard.errorDesc} onHome={onHome} />;
  }

  return (
    <div
      className="screen"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 80px 80px',
      }}
    >
      <div
        style={{
          width: 168,
          height: 168,
          borderRadius: '50%',
          background: 'var(--accent-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            border: '8px solid #fff',
            borderTopColor: accent,
            animation: 'spin 0.9s linear infinite',
          }}
        />
      </div>

      <h1
        style={{
          fontSize: 64,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: '-.02em',
          marginTop: 44,
          textAlign: 'center',
          animation: 'popIn .5s .05s both',
        }}
      >
        {t.giveCard.title}
      </h1>

      <p
        style={{
          fontSize: 30,
          lineHeight: 1.45,
          color: 'var(--ink-soft)',
          fontWeight: 500,
          maxWidth: 880,
          textAlign: 'center',
          marginTop: 20,
          textWrap: 'pretty',
          animation: 'popIn .5s .1s both',
        }}
      >
        {t.giveCard.issuing}
      </p>
    </div>
  );
}
