/**
 * Tasketra's icon glyph -- "the Level": a spirit level's vial with its lime
 * bubble sitting dead center between the two marks, a project on level and
 * on track (brand mark decided 2026-11-19; same geometry as the favicon,
 * scaled from its 1024 viewBox). Drawn glyph-only, no tile: callers place
 * it on the brand's dark surfaces. Used where a compact mark is needed;
 * the sidebar wordmark lockup carries it too (Kk's call, 2026-11-19).
 */
export function Logomark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 58) / 148)}
      viewBox="26 71 148 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="32.8" y="77.7" width="134.4" height="44.5" rx="22.3" stroke="#F2EBD9" strokeWidth="6.25" />
      <rect x="74" y="89.8" width="5.1" height="20.3" rx="2.5" fill="#F2EBD9" />
      <rect x="120.9" y="89.8" width="5.1" height="20.3" rx="2.5" fill="#F2EBD9" />
      <rect x="83.6" y="88.7" width="32.8" height="22.7" rx="11.3" fill="#CFEA46" />
    </svg>
  );
}

type WordmarkProps = { size?: "sm" | "md"; className?: string; beta?: boolean; mark?: boolean };

/**
 * The Tasketra wordmark -- the bold serif "tasketra" name, no caption pill
 * above it. Earlier versions carried a parent-brand caption (first
 * "ProjectPMP", later "The Working PM") above the name, but now that
 * Tasketra is the umbrella brand itself, there's no separate parent name
 * to display -- a caption reading "Tasketra" above a name reading
 * "tasketra" would just be redundant. The `mark` prop adds the Level glyph
 * beside the name; only the sidebar opts in (Kk's call, 2026-11-19), every
 * other surface stays text-only.
 *
 * The optional `beta` prop adds a small outlined "Beta" tag next to the
 * name -- used on in-app screens (sidebar, auth) so people already using
 * the product are reminded this is beta software, distinct from the
 * marketing landing page's own "Join the beta" framing.
 */
export function Wordmark({ size = "md", className = "", beta = false, mark = false }: WordmarkProps) {
  return (
    <span className={`brand-lockup brand-lockup-${size}${className ? ` ${className}` : ""}`}>
      {mark && <Logomark size={44} />}
      <span className="brand-lockup-text">
        <span className="brand-lockup-name-row">
          <span className="brand-lockup-name">tasketra</span>
          {beta && <span className="brand-lockup-beta">Beta</span>}
        </span>
      </span>
    </span>
  );
}
