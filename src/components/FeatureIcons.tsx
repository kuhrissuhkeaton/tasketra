/**
 * A small set of brand-matched line icons for the landing page's compact
 * feature grid. Geometric, single-weight stroke (1.75), rounded caps/joins --
 * same restrained, flat-line language as the Logomark in Wordmark.tsx, just
 * without the mountain motif itself (that stays reserved for the brand mark).
 * Each renders at `currentColor` so it inherits --navy from its wrapper.
 */
const shared = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconDecisions({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <path d="M6 8h20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H15l-6.5 5v-5H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
      <path d="M11.5 15l3 3 6-6" />
    </svg>
  );
}

export function IconMeetings({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <rect x="5" y="7" width="22" height="20" rx="2" />
      <path d="M5 13h22" />
      <path d="M10.5 4v6M21.5 4v6" />
      <path d="M11 20l3 3 7-7" />
    </svg>
  );
}

export function IconDocuments({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <path d="M9 4h9l7 7v17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M18 4v7h7" />
      <path d="M11.5 18h9M11.5 23h6" />
    </svg>
  );
}

export function IconTeam({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <circle cx="12.5" cy="11" r="4" />
      <path d="M4.5 27c0-5.2 3.6-8.5 8-8.5s8 3.3 8 8.5" />
      <circle cx="23.5" cy="10" r="3.2" />
      <path d="M21 15.3c3.4.4 5.8 3.3 6 8.7" />
    </svg>
  );
}

export function IconLessons({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <path d="M16 9c-2.6-2.1-6.3-3.1-11-2.2v17.7c4.7-.9 8.4.1 11 2.2 2.6-2.1 6.3-3.1 11-2.2V6.8C22.3 5.9 18.6 6.9 16 9Z" />
      <path d="M16 9v17.7" />
    </svg>
  );
}

export function IconAuditTrail({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      <path d="M5.5 10.5A12 12 0 1 1 4 17" />
      <path d="M3 4.5v6h6" />
      <path d="M16 10v7l5 3" />
    </svg>
  );
}
