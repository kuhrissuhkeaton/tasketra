import { createContext, useCallback, useContext, useRef, useState } from "react";

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

  const confirm = useCallback<ConfirmFn>((msg: string) => {
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message !== null && (
        <div className="confirm-overlay" onClick={() => handle(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-message">{message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => handle(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handle(true)} autoFocus>
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
