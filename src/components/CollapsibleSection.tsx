import { useEffect, useId, useState } from "react";
import { prefKey, readPref, writePref } from "../lib/dashPrefs";

/**
 * A compact, collapsible dashboard section. The heading holds one real button
 * (aria-expanded + aria-controls) so it works from the keyboard and reads correctly
 * in a screen reader. The body is only mounted while open (a table measured while
 * hidden would size itself wrong). The open state defaults differ by screen size
 * and the user's own choice is remembered per section and per size.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  wide,
  defaultOpenWide,
  defaultOpenNarrow,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  wide: boolean;
  defaultOpenWide: boolean;
  defaultOpenNarrow: boolean;
  children: React.ReactNode;
}) {
  const key = prefKey(id, wide);
  const fallback = wide ? defaultOpenWide : defaultOpenNarrow;
  const [open, setOpen] = useState<boolean>(() => readPref(key) ?? fallback);
  useEffect(() => {
    setOpen(readPref(key) ?? fallback);
  }, [key, fallback]);

  const panelId = useId();
  const headId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    writePref(key, next);
  }

  return (
    <section className="dash-sec" aria-labelledby={headId}>
      <h2 className="dash-sec-head" id={headId}>
        <button type="button" className="dash-sec-btn" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          <span className="dash-sec-title">{title}</span>
          {summary && <span className="dash-sec-summary">{summary}</span>}
          <span className={`dash-sec-chev${open ? " is-open" : ""}`} aria-hidden="true">▾</span>
        </button>
      </h2>
      <div id={panelId} className="dash-sec-body" hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
