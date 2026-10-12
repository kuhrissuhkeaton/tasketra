import { useId, useState } from "react";

/**
 * Empty-submit feedback for the add forms. A field is opted in with
 * aria-required="true" (and data-positive="true" for an amount that must be
 * above zero). On submit, check() finds the first one that is empty (spaces
 * only count as empty), shows a message, marks the field invalid, and puts
 * focus on it. The message is a role="alert", so screen readers hear it. It
 * clears as soon as the person types.
 *
 * Fields are marked with aria-required rather than the browser's own
 * `required`, so the message looks the same everywhere and a field that holds
 * only spaces is caught too.
 */
export function fieldLabel(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.replace(/\s*\(optional\)\s*/i, "").trim();
  const id = el.id;
  if (id) {
    const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const ph = el.getAttribute("placeholder");
  return (ph ?? "this field").trim();
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function useRequiredFields() {
  const [message, setMessage] = useState<string | null>(null);
  const messageId = useId();

  function clearInvalid(target?: EventTarget | null) {
    setMessage(null);
    const el = target as HTMLElement | null;
    if (el && el.getAttribute?.("aria-invalid") === "true") {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    }
  }

  /** Returns true when every required field is filled in. */
  function check(form: HTMLFormElement): boolean {
    const fields = Array.from(form.querySelectorAll<Field>('[aria-required="true"]'));
    for (const f of fields) {
      const value = (f.value ?? "").trim();
      const needsPositive = f.getAttribute("data-positive") === "true";
      const bad = value === "" || (needsPositive && !(Number(value) > 0));
      if (!bad) continue;
      const label = fieldLabel(f);
      setMessage(
        needsPositive && value !== ""
          ? `"${label}" needs to be more than 0.`
          : `Please fill in "${label}" before adding.`,
      );
      f.setAttribute("aria-invalid", "true");
      f.setAttribute("aria-describedby", messageId);
      f.focus();
      return false;
    }
    setMessage(null);
    return true;
  }

  return { message, messageId, check, clearInvalid };
}

/**
 * After a successful add, put the cursor back in the first field so the next
 * item can be typed straight away. "Successful" means the field was cleared by
 * the parent. Skipped on touch, where it would pop the keyboard back up, and
 * when focus has moved somewhere else on purpose.
 */
export function refocusFirstField(form: HTMLFormElement | null, how: "keyboard" | "mouse" | "touch") {
  if (!form || how === "touch") return;
  const first = form.querySelector<Field>('[aria-required="true"]') ?? form.querySelector<Field>("input:not([type=hidden]), textarea");
  if (!first || first.value !== "") return;
  const active = document.activeElement;
  if (active && active !== document.body && !form.contains(active)) return;
  first.focus();
}
