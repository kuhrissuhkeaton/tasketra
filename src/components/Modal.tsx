import { useEffect, useId, useRef } from "react";

/**
 * Small accessible dialog shell: role="dialog" + aria-modal, labelled by its
 * title, Escape and backdrop click close it, Tab stays inside, focus moves to
 * the first field on open (or the element marked data-autofocus) and returns
 * to whatever opened it on close. Content stays mounted only while open.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const focusables = () =>
      card
        ? Array.from(
            card.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.closest("[hidden]"))
        : [];
    const first = card?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !card?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !card?.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="confirm-overlay modal-overlay" onClick={() => closeRef.current()}>
      <div
        ref={cardRef}
        className="confirm-card modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => closeRef.current()}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
