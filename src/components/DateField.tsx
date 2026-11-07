import { useEffect, useRef, useState } from "react";

// A friendlier date field (v150, task forms first): type a date the way
// people write it — 11/20/2026 — or pick from the calendar button. The value
// in and out is the same YYYY-MM-DD string the native input used, so nothing
// downstream changes. The bare native input this replaces trapped people:
// typing landed in whichever segment had focus and corrupted the year, with
// no explanation.

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse typed text into YYYY-MM-DD, or null when it isn't a real date.
 *  Accepts M/D/YYYY (single digits fine) and YYYY-MM-DD. */
export function parseDateInput(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (slash) {
    m = Number(slash[1]); d = Number(slash[2]); y = Number(slash[3]);
  } else if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** YYYY-MM-DD -> M/D/YYYY for display in the text box. Tolerates a full
 *  ISO timestamp ("2026-11-25T00:00:00.000Z"): the date part is what a date
 *  field means. Some stored due/start values carry a time component, and
 *  v150's strict regex passed them through raw -- the walkthrough caught
 *  the task edit drawer showing the whole timestamp (v151, Part A4). */
export function formatDateForDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).slice(0, 10));
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

export function DateField({
  value,
  onChange,
  ariaLabel,
  title,
  id,
}: {
  /** YYYY-MM-DD, or "" when unset. */
  value: string;
  onChange: (iso: string) => void;
  ariaLabel?: string;
  title?: string;
  id?: string;
}) {
  const [text, setText] = useState(() => (value ? formatDateForDisplay(value) : ""));
  const [error, setError] = useState("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const errorId = id ? `${id}-error` : undefined;

  // Keep the box in step when the value changes from outside (the edit
  // drawer opening on a different task, the form clearing after a save).
  useEffect(() => {
    setText(value ? formatDateForDisplay(value) : "");
    setError("");
  }, [value]);

  function handleText(next: string) {
    setText(next);
    if (next.trim() === "") {
      setError("");
      onChange("");
      return;
    }
    const parsed = parseDateInput(next);
    if (parsed) {
      setError("");
      onChange(parsed);
    }
  }

  function handleBlur() {
    if (text.trim() === "") return;
    if (!parseDateInput(text)) {
      setError("That date doesn't look right. Try 11/20/2026.");
    }
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return; } catch { /* fall through to focus */ }
    }
    el.focus();
    el.click();
  }

  return (
    <span className="date-field">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="mm/dd/yyyy"
        title={title}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && errorId ? errorId : undefined}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={handleBlur}
      />
      <button type="button" className="btn-link date-field-picker" aria-label="Open calendar" onClick={openPicker}>
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-field-native"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Calendar date"
        value={String(value).slice(0, 10)}
        onChange={(e) => {
          setError("");
          onChange(e.target.value);
        }}
      />
      {error && (
        <span id={errorId} className="date-field-error" role="alert">{error}</span>
      )}
    </span>
  );
}
