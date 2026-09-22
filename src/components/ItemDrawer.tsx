import { useEffect, useRef } from "react";

// A generic slide-in detail panel, shared by any tab that needs more room
// than an inline table row can give an item -- Tasks, Issues, and Risks all
// use this shell today (each supplying its own field layout as children),
// rather than three near-duplicate one-off drawers.
export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            {eyebrow && <div className="drawer-eyebrow">{eyebrow}</div>}
            <h3>{title}</h3>
          </div>
          <button className="drawer-close" type="button" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </div>
  );
}
