/**
 * ProjectPMP's icon glyph -- a simplified version of the ascending
 * mountain-and-flags motif from projectpmp.com's hero illustration. Used
 * only where a compact square mark is needed (favicon, OG image) since the
 * real site's own nav has no icon at all, just two-tone text.
 */
export function Logomark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M20 165 L70 100 L110 135 L180 40" stroke="#F2EBD9" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 165 L60 165 L110 135 L150 165 L180 165 L180 40" fill="#CFEA46" opacity="0.9" />
      <circle cx="180" cy="40" r="14" fill="#F2EBD9" />
    </svg>
  );
}

type WordmarkProps = { size?: "sm" | "md"; className?: string; beta?: boolean };

/**
 * The Tasketra wordmark -- a small lime pill badge reading "ProjectPMP"
 * (mirrors the badge-chip component used all over projectpmp.com, e.g. the
 * "PROJECT PMP" and "ABOUT KARISSA" tags) sitting above the bold serif
 * "tasketra" name. No icon glyph here, matching the real site's own nav,
 * which is text-only.
 *
 * The optional `beta` prop adds a small outlined "Beta" tag next to the
 * name -- used on in-app screens (sidebar, auth) so people already using
 * the product are reminded this is beta software, distinct from the
 * marketing landing page's own "Join the beta" framing.
 */
export function Wordmark({ size = "md", className = "", beta = false }: WordmarkProps) {
  return (
    <span className={`brand-lockup brand-lockup-${size}${className ? ` ${className}` : ""}`}>
      <span className="brand-lockup-text">
        <span className="brand-lockup-caption">ProjectPMP</span>
        <span className="brand-lockup-name-row">
          <span className="brand-lockup-name">tasketra</span>
          {beta && <span className="brand-lockup-beta">Beta</span>}
        </span>
      </span>
    </span>
  );
}
