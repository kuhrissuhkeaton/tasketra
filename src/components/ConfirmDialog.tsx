import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replaces window.confirm() with an on-brand modal. window.confirm() is a
 * native browser dialog that blocks the whole page (including devtools /
 * automation), looks inconsistent with the rest of the app, and can't be
 * styled. Wrap the app in <ConfirmProvider> once, then call useConfirm() in
 * any component to get an async confirm(message) => Promise<boolean>.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const opener = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((msg: string) => {
    // Remember what had focus *before* the dialog's own autoFocus moves it.
    opener.current = document.activeElement as HTMLElement | null;
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function handle(result: boolean) {
    setMessage(null);
    resolver.current?.(result);
    resolver.current = null;
  }

  // Escape cancels, and focus returns to whatever opened the dialog.
  const open = message !== null;
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handle(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener.current?.focus?.();
    };
  }, [open]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message !== null && (
        <div className="confirm-overlay" onClick={() => handle(false)}>
          <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-message" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-message" id="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => handle(false)} autoFocus>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handle(true)}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
