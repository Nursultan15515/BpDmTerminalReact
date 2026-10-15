import { PressBtn } from '../PressBtn';
import { Arrow } from '../icons';
import { LangSwitch } from '../LangSwitch';
import { useI18n } from '../i18n';
import { HOLD_MS, useHold } from '../useHold';

export function WelcomeScreen({ accent, onStart, onHold }: { accent: string; onStart: () => void; onHold?: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { holding, handlers } = useHold(onHold);

  return (
    <div
      className="screen"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        padding: '96px 80px 56px',
      }}
    >
      <div style={{ position: 'absolute', right: 44, top: 14, height: 64, display: 'flex', alignItems: 'center', zIndex: 6 }}>
        <LangSwitch accent={accent} value={lang} onChange={setLang} />
      </div>

      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        {/* Второй вход в настройку для наладчика (первый — статус-бар): удержание HOLD_MS. За это время плашка
            заливается акцентом; текст белеет быстро и около середины — плавно он на полпути сливался бы с фоном. */}
        <div
          {...handlers}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 22px',
            borderRadius: 999,
            backgroundColor: holding ? accent : 'var(--accent-50)',
            color: holding ? '#fff' : accent,
            transition: holding
              ? `background-color ${HOLD_MS}ms linear, color 120ms linear ${HOLD_MS * 0.45}ms`
              : 'background-color .2s ease, color .2s ease',
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 22,
            cursor: onHold ? 'pointer' : 'default',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          {t.welcome.kicker}
        </div>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: '-.02em',
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {t.welcome.title}
        </h1>
      </div>

      {/* Правила получения пропуска — нажатие «Начать» означает согласие с ними (как в старом терминале). */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          marginTop: 34,
          width: 1320,
          maxWidth: '100%',
          alignSelf: 'center',
          background: 'var(--surface)',
          border: '1.5px solid var(--line)',
          borderRadius: 28,
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '24px 48px',
            borderBottom: '1.5px solid var(--line)',
          }}
        >
          <span style={{ flexShrink: 0, width: 6, height: 34, borderRadius: 3, background: accent }} />
          <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>
            {t.welcome.rulesTitle}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              padding: '8px 18px',
              borderRadius: 999,
              background: 'var(--accent-50)',
              color: accent,
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {t.welcome.rules.length} {t.welcome.pointsLabel}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '34px 48px' }}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 28 }}>
            {t.welcome.rules.map((rule, i) => (
              <li key={i} style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'var(--accent-50)',
                    color: accent,
                    fontSize: 24,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: accent }}>
                      {rule.kicker}
                    </span>
                    {rule.chips?.map((chip) => (
                      <span
                        key={chip}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 999,
                          border: `1.5px solid ${accent}`,
                          color: accent,
                          fontSize: 18,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  {rule.chips ? (
                    <span
                      style={{
                        paddingLeft: 18,
                        borderLeft: `3px solid var(--line)`,
                        fontSize: 23,
                        lineHeight: 1.5,
                        fontWeight: 500,
                        color: 'var(--ink-faint)',
                        textWrap: 'pretty',
                      }}
                    >
                      {rule.text}
                    </span>
                  ) : (
                    <span style={{ fontSize: 26, lineHeight: 1.5, fontWeight: 500, color: 'var(--ink-soft)', textWrap: 'pretty' }}>
                      {rule.text}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 600, color: 'var(--ink-soft)', textAlign: 'center' }}>{t.welcome.sub}</p>
        <PressBtn
          onClick={onStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            height: 116,
            padding: '0 28px 0 64px',
            borderRadius: 999,
            background: `linear-gradient(180deg, rgba(255,255,255,.16), rgba(0,0,0,.12)), ${accent}`,
            color: '#fff',
            fontSize: 38,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            boxShadow: `0 24px 48px -16px ${accent}, inset 0 2px 0 rgba(255,255,255,.24)`,
          }}
        >
          {t.welcome.start}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.18)',
            }}
          >
            <Arrow size={34} />
          </span>
        </PressBtn>
      </div>
    </div>
  );
}
