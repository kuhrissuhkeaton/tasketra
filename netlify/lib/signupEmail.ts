import { validateEmail } from "./accountRules.ts";
import { domainCanReceiveMail, suggestEmailFix } from "./emailChecks.ts";

export type EmailProblem = { error: string; suggestion?: string };

/** Every check an address has to pass before we'll create an account for it or
 *  switch an account to it: shape, disposable domains, likely typos, and a
 *  domain that can actually receive mail. Returns null when it passes. */
export async function checkNewEmail(email: string): Promise<EmailProblem | null> {
  const shape = validateEmail(email);
  if (shape) return { error: shape };
  const suggestion = suggestEmailFix(email);
  if (suggestion) {
    return { error: `That email address looks like a typo. Did you mean ${suggestion}?`, suggestion };
  }
  if (!(await domainCanReceiveMail(email.split("@")[1]))) {
    return { error: "That email domain can't receive mail. Check the spelling after the @ sign." };
  }
  return null;
}
