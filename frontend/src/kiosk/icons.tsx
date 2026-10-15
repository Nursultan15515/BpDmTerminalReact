export function OrgGlyph({ accent }: { accent: string }) {
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
      <rect x="10" y="14" width="34" height="46" rx="5" fill={accent} opacity="0.12" />
      <rect x="10" y="14" width="34" height="46" rx="5" stroke={accent} strokeWidth="3" />
      <rect x="40" y="26" width="20" height="34" rx="5" fill={accent} opacity="0.18" />
      <rect x="40" y="26" width="20" height="34" rx="5" stroke={accent} strokeWidth="3" />
      <rect x="18" y="23" width="7" height="7" rx="1.5" fill={accent} />
      <rect x="30" y="23" width="7" height="7" rx="1.5" fill={accent} />
      <rect x="18" y="36" width="7" height="7" rx="1.5" fill={accent} />
      <rect x="30" y="36" width="7" height="7" rx="1.5" fill={accent} />
      <rect x="47" y="35" width="6" height="6" rx="1.5" fill={accent} />
      <rect x="47" y="46" width="6" height="6" rx="1.5" fill={accent} />
      <rect x="24" y="50" width="10" height="10" rx="2" fill="#FFFFFF" stroke={accent} strokeWidth="3" />
    </svg>
  );
}

export function Arrow({
  dir = 'right',
  color = '#fff',
  size = 30,
}: {
  dir?: 'left' | 'right';
  color?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: dir === 'left' ? 'rotate(180deg)' : 'none' }}
    >
      <path
        d="M5 12 H18 M13 7 L18 12 L13 17"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="#fff" strokeWidth="2.4" />
      <path d="M16.5 16.5 L21 21" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11 L12 4 L20 11 M6 10 V20 H18 V10"
        stroke="#fff"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrgChipDot({ accent }: { accent: string }) {
  return <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />;
}

export function GlobeIcon({ size = 30, color = '#fff', sw = 2 }: { size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
      <path
        d="M3 12 H21 M12 3 C15 6.5 15 17.5 12 21 C9 17.5 9 6.5 12 3"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="46" height="36" viewBox="0 0 46 36" fill="none">
      <path
        d="M16 5 H40 a3 3 0 0 1 3 3 V28 a3 3 0 0 1 -3 3 H16 L3 18 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M22 13 L33 24 M33 13 L22 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 30, color = '#fff', sw = 2.7 }: { size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5 L10 17.5 L19 7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CameraIcon({ size = 34, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 8.5 A2 2 0 0 1 5 6.5 H7.5 L9 4.5 H15 L16.5 6.5 H19 A2 2 0 0 1 21 8.5 V17 A2 2 0 0 1 19 19 H5 A2 2 0 0 1 3 17 Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.5" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function IdCardIcon({ size = 34, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5.5" width="18" height="13" rx="2" stroke={color} strokeWidth="2" />
      <circle cx="8.5" cy="10.5" r="1.8" stroke={color} strokeWidth="1.8" />
      <path d="M5.9 15.6 Q8.5 12.6 11.1 15.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.8 10 H18 M13.8 13.6 H16.8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RetakeIcon({ size = 28, color = '#5A6675' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20.5 12 A8.5 8.5 0 1 1 17.5 5.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M18 3 L18 7.5 L13.5 7.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Удостоверение личности: фото, строки данных и ИИН внизу. */
export function IdCardGlyph({ size = 160, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={(size * 3) / 4} viewBox="0 0 160 120" fill="none">
      <rect x="12" y="18" width="136" height="86" rx="11" stroke={color} strokeWidth="4" />
      <rect x="25" y="32" width="34" height="42" rx="5" fill={color} opacity="0.22" />
      <circle cx="42" cy="47" r="7" fill={color} />
      <path d="M30 70 q0 -12 12 -12 q12 0 12 12 Z" fill={color} />
      <rect x="70" y="35" width="62" height="7" rx="3.5" fill={color} opacity="0.55" />
      <rect x="70" y="50" width="46" height="7" rx="3.5" fill={color} opacity="0.55" />
      <rect x="70" y="65" width="54" height="7" rx="3.5" fill={color} opacity="0.55" />
      <rect x="25" y="85" width="76" height="8" rx="4" fill={color} />
    </svg>
  );
}

/** Экранная клавиатура. */
export function KeyboardGlyph({ size = 160, color = '#fff' }: { size?: number; color?: string }) {
  const keys = [0, 1, 2, 3, 4, 5].flatMap((col) => [0, 1].map((row) => ({ x: 28 + col * 18.5, y: 40 + row * 18 })));
  return (
    <svg width={size} height={(size * 3) / 4} viewBox="0 0 160 120" fill="none">
      <rect x="12" y="24" width="136" height="80" rx="11" stroke={color} strokeWidth="4" />
      {keys.map((k) => (
        <rect key={`${k.x}-${k.y}`} x={k.x} y={k.y} width="11" height="10" rx="2.5" fill={color} opacity="0.55" />
      ))}
      <rect x="46" y="78" width="68" height="10" rx="3" fill={color} />
    </svg>
  );
}

export function PersonGlyph({ size = 120, color = '#C4D2E2' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="44" r="23" fill={color} />
      <path d="M20 104 q0 -36 40 -36 q40 0 40 36 Z" fill={color} />
    </svg>
  );
}

export function NotFoundGlyph() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
      <circle cx="90" cy="90" r="90" fill="#F0F2F5" />
      <rect x="52" y="46" width="62" height="82" rx="10" fill="#FFFFFF" stroke="#CBD3DD" strokeWidth="3" />
      <rect x="64" y="64" width="38" height="6" rx="3" fill="#D7DEE6" />
      <rect x="64" y="78" width="30" height="6" rx="3" fill="#D7DEE6" />
      <rect x="64" y="92" width="22" height="6" rx="3" fill="#D7DEE6" />
      <circle cx="104" cy="104" r="26" fill="#FFFFFF" stroke="#94A0AE" strokeWidth="6" />
      <path d="M123 123 L139 139" stroke="#94A0AE" strokeWidth="9" strokeLinecap="round" />
      <circle cx="104" cy="104" r="13" fill="#E1574C" />
      <path d="M99 99 L109 109 M109 99 L99 109" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorGlyph() {
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
      <circle cx="90" cy="90" r="90" fill="#FCEEEC" />
      <path d="M90 44 L142 132 H38 Z" fill="#FFFFFF" stroke="#E1574C" strokeWidth="6" strokeLinejoin="round" />
      <rect x="84" y="74" width="12" height="34" rx="6" fill="#E1574C" />
      <circle cx="90" cy="119" r="7" fill="#E1574C" />
    </svg>
  );
}
