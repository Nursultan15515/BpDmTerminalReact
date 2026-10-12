import { useState, type CSSProperties, type ReactNode } from 'react';

export function PressBtn({
  children,
  onClick,
  style,
  pressScale = 0.985,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  pressScale?: number;
}) {
  const [down, setDown] = useState(false);
  return (
    <div
      onClick={onClick}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'transform .08s ease, box-shadow .14s ease',
        transform: down ? `scale(${pressScale})` : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
