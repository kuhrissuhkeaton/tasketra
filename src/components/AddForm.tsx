import { useRef, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { refocusFirstField, useRequiredFields } from "../lib/requiredFields";

/**
 * A plain <form> for the add rows that are not QuickAddForm registers (Tasks,
 * Add cost, Roadmap, Meetings, Stakeholders). Same behavior as QuickAddForm:
 * a required field left empty gets a message and focus instead of a silent
 * no-op, and after a successful add the cursor returns to the first field.
 * Mark required fields with aria-required="true".
 */
export function AddForm({
  className,
  style,
  onSubmit,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  children: ReactNode;
}) {
  const required = useRequiredFields();
  const inputKind = useRef<"keyboard" | "mouse" | "touch">("mouse");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    if (!required.check(form)) {
      e.preventDefault();
      return;
    }
    const result = onSubmit(e) as unknown;
    Promise.resolve(result).then(() => {
      requestAnimationFrame(() => refocusFirstField(form, inputKind.current));
    });
  }

  return (
    <form
      className={className}
      style={style}
      onSubmit={handleSubmit}
      onInput={(e) => required.clearInvalid(e.target)}
      onPointerDownCapture={(e) => { inputKind.current = e.pointerType === "touch" ? "touch" : "mouse"; }}
      onKeyDownCapture={() => { inputKind.current = "keyboard"; }}
    >
      {children}
      {required.message && (
        <p id={required.messageId} className="form-error add-form-error" role="alert">{required.message}</p>
      )}
    </form>
  );
}
