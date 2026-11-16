/** The Corkboard mark: an index card, ruled in blue under a red header line, held by a red pin. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
      <g transform="rotate(-5 32 34)">
        <rect x="6" y="16" width="52" height="38" rx="4" fill="var(--card)" stroke="var(--ink-rule)" strokeWidth="2" />
        <path d="M12 26h40" stroke="var(--pin)" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 34h40M12 41h40M12 48h26" stroke="var(--rule)" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="15" r="7" fill="var(--pin)" />
      <circle cx="30" cy="13" r="2.2" fill="#fff" opacity=".5" />
    </svg>
  );
}
