// Turn a stored email or phone number into a link that starts the contact.
// Both fields are free text, so these return null (no link) unless the value
// clearly looks usable, rather than producing a broken or misleading href.

export function mailtoHref(email: string | null | undefined): string | null {
  const value = (email || "").trim();
  // One address, no spaces or line breaks, something@something.tld. "?" and
  // "#" are rejected too, since in a mailto link they start extra fields
  // (subject, bcc, body) rather than being part of an address.
  if (!/^[^\s@,;<>?#]+@[^\s@,;<>?#]+\.[^\s@,;<>?#]+$/.test(value)) return null;
  return `mailto:${value}`;
}

export function telHref(phone: string | null | undefined): string | null {
  const value = (phone || "").trim();
  if (!value) return null;
  // Keep digits and a single leading "+"; drop spaces, dashes, dots, brackets
  // and anything typed after an extension marker like "x123" or "ext 4".
  const main = value.split(/\s*(?:x|ext\.?|extension)\s*\d/i)[0];
  const digits = main.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${main.trim().startsWith("+") ? "+" : ""}${digits}`;
}
