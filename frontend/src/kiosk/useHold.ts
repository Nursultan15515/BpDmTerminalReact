import { useEffect, useRef, useState } from 'react';

// Служебный вход для наладчика: удержание HOLD_MS открывает настройку. Таких мест два — «Терминал готов к работе»
// в статус-баре и «Бюро пропусков» на главной. Отпустил раньше (или увёл палец) — ничего не происходит.
export const HOLD_MS = 3000;

export function useHold(onHold?: () => void) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  const start = () => {
    if (!onHold) return;
    clearTimeout(timer.current); // второй палец не заводит второй таймер
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onHold();
    }, HOLD_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    holding,
    handlers: { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel },
  };
}
