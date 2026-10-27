/** StruggleMore mark: slope + boulder in a sienna rounded square (STRUGGLEMORE §1.1). */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="20" height="20" rx="5" fill="var(--accent)" />
      <path d="M3.5 16 L16.5 8.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11.6" cy="7.6" r="3.4" fill="#fff" />
    </svg>
  );
}

/** Wordmark: "Struggle" roman + "More" italic in the accent (Fraunces 600). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.01em' }}>
      Struggle<em style={{ fontStyle: 'italic', color: 'var(--accent-text)' }}>More</em>
    </span>
  );
}
