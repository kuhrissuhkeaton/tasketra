import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";

// Compact entry form for the project registers: the fields people need to log an
// item sit on one quick row; everything else lives under a "More details" toggle.
//
// Layout only. The extra fields stay mounted (hidden, not removed), so nothing a
// person has typed is lost when the section is collapsed, and the parent's own
// submit handler and state are used unchanged.
//
// The open/closed choice is remembered for the current browser session. With no
// saved choice the section starts open for an empty register (first-time users see
// the full form) and closed once the register has rows. A register can opt out with
// startExpanded={false} so that, even when empty, only the compact row shows.

function readChoice(key: string): boolean | null {
  try {
    const v = sessionStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function saveChoice(key: string, open: boolean) {
  try {
    sessionStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

export function QuickAddForm({
  storageKey,
  hasRows,
  onSubmit,
  quick,
  more,
  moreLabel = "More details",
  startExpanded,
}: {
  storageKey: string;
  hasRows: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  quick: ReactNode;
  more: ReactNode;
  moreLabel?: string;
  /** Initial state when nothing is saved for this session. Defaults to "open while the register is empty". */
  startExpanded?: boolean;
}) {
  const key = `tasketra.quickAdd.${storageKey}`;
  const [open, setOpen] = useState<boolean>(() => readChoice(key) ?? startExpanded ?? !hasRows);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    saveChoice(key, next);
    // Expanding moves focus to the first extra field; collapsing leaves it on the toggle.
    if (next) {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
      });
    }
  }

  // If the browser reports a hidden field as invalid (for example a field marked
  // required), reveal the section and put focus on that field.
  function onInvalidCapture(e: FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLElement;
    if (!open && panelRef.current?.contains(target)) {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => target.focus());
    }
  }

  return (
    <form className="stacked-form quick-add" onSubmit={onSubmit} onInvalidCapture={onInvalidCapture}>
      <div className="quick-add-row">{quick}</div>
      <button
        type="button"
        className="btn-link quick-add-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        {open ? `Hide ${moreLabel.toLowerCase()}` : moreLabel}
        <span aria-hidden="true"> {open ? "▴" : "▾"}</span>
      </button>
      <div id={panelId} ref={panelRef} className="quick-add-more" hidden={!open}>
        {more}
      </div>
    </form>
  );
}
