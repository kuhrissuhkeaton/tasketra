import { useEffect, useRef, useState } from "react";

/**
 * One click-to-edit bullet list (v167, the Weekly Sync kit layout Kk
 * chose from the mockups): the Wins / Blockers / Next week columns.
 * A line renders as a button so it is keyboard-reachable; clicking (or
 * Enter/Space on the focused line) swaps it for an input holding the
 * same words. Enter or leaving the field commits, Esc cancels, the ×
 * removes the line, and "+ Add a line" appends a fresh line already
 * open for typing. Committing an emptied line removes it -- a blank
 * bullet is never a real bullet. The list is presentation state only:
 * the parent owns the lines and nothing is persisted anywhere, the
 * same contract the v160 textareas had.
 */
export function SyncBulletEditor({
  title,
  lines,
  onChange,
}: {
  title: string;
  lines: string[];
  onChange: (lines: string[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Enter commits and unmounts the input; the blur that follows must not
  // commit a second time against the already-updated list.
  const liveRef = useRef(false);

  useEffect(() => {
    if (editing !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit(index: number) {
    setDraft(lines[index]);
    setEditing(index);
    liveRef.current = true;
  }

  function commit() {
    if (editing === null || !liveRef.current) return;
    liveRef.current = false;
    const text = draft.trim();
    const next = [...lines];
    if (text === "") next.splice(editing, 1);
    else next[editing] = text;
    setEditing(null);
    onChange(next);
  }

  function cancel() {
    liveRef.current = false;
    setEditing(null);
  }

  function remove(index: number) {
    if (editing === index) {
      liveRef.current = false;
      setEditing(null);
    }
    onChange(lines.filter((_, i) => i !== index));
  }

  function addLine() {
    onChange([...lines, ""]);
    setDraft("");
    setEditing(lines.length);
    liveRef.current = true;
  }

  return (
    <div className="sync-editor">
      <div className="sync-editor-head">
        <h3 className="sync-editor-title">{title}</h3>
        <span className="sync-editor-hint">Click to edit</span>
      </div>
      {lines.length === 0 && editing === null ? (
        <p className="sync-editor-empty">Nothing here yet.</p>
      ) : (
        <ul className="sync-bullets">
          {lines.map((line, i) => (
            <li className="sync-bullet" key={i}>
              {editing === i ? (
                <input
                  ref={inputRef}
                  className="sync-bullet-input"
                  value={draft}
                  aria-label={`${title} line ${i + 1}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancel();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sync-bullet-text"
                  onClick={() => startEdit(i)}
                  title="Click to edit"
                >
                  {line}
                </button>
              )}
              <button
                type="button"
                className="sync-bullet-remove"
                aria-label={`Remove this ${title.toLowerCase()} line`}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="sync-add-line" onClick={addLine}>
        + Add a line
      </button>
    </div>
  );
}
