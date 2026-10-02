// Two checks that catch an email address which is well-formed but wrong:
// a likely typo of a well-known mail provider (gmail.co, gmial.com ...), and
// a domain that can't receive mail at all. Neither replaces verification (the
// confirmation link is the real proof); they just stop most mistakes before
// an account is created, with a helpful message.

import { promises as dns } from "node:dns";

// Typos of the big providers. ".co" is a real, widely used ending for other
// sites, so it's only corrected for the providers below, never in general.
const DOMAIN_FIXES: Record<string, string> = {
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com",
  "gmail.comm": "gmail.com", "gmail.vom": "gmail.com", "gmail.cim": "gmail.com", "gmail.ocm": "gmail.com",
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmaill.com": "gmail.com", "gamil.com": "gmail.com",
  "gnail.com": "gmail.com", "gmil.com": "gmail.com", "gmali.com": "gmail.com", "gmail.net": "gmail.com",
  "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.cm": "yahoo.com", "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com", "yhoo.com": "yahoo.com", "yahou.com": "yahoo.com",
  "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "outlook.co": "outlook.com", "outlook.con": "outlook.com", "outlok.com": "outlook.com",
  "outloook.com": "outlook.com", "outlool.com": "outlook.com",
  "icloud.co": "icloud.com", "icloud.con": "icloud.com", "iclould.com": "icloud.com", "icoud.com": "icloud.com",
  "aol.co": "aol.com", "aol.con": "aol.com",
  "comcast.nett": "comcast.net", "comcast.ne": "comcast.net",
};

// Misspelled ".com" endings that are never real on their own.
const BAD_COM_ENDINGS = new Set(["con", "cmo", "ocm", "vom", "xom", "comm", "cim", "cpm", "clm"]);

/** If the address looks like a typo, returns the corrected address; else null. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  const known = DOMAIN_FIXES[domain];
  if (known) return `${local}@${known}`;
  const dot = domain.lastIndexOf(".");
  if (dot > 0 && BAD_COM_ENDINGS.has(domain.slice(dot + 1))) {
    return `${local}@${domain.slice(0, dot)}.com`;
  }
  return null;
}

export type MailResolver = {
  resolveMx(domain: string): Promise<{ exchange: string }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
};

export type MailDomainResult = "ok" | "no_mail" | "unknown";

const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** "ok": the domain can receive mail. "no_mail": it doesn't exist or has no mail
 *  server. "unknown": DNS itself failed or timed out, which is never a reason
 *  to turn someone away. */
export async function checkMailDomain(domain: string, resolver: MailResolver = dns, timeoutMs = 3000): Promise<MailDomainResult> {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), timeoutMs);
    if (mx.length > 0) {
      // A single "." mail server is the "this domain accepts no mail" marker.
      const nullMx = mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".");
      return nullMx ? "no_mail" : "ok";
    }
  } catch (err: any) {
    if (!MISSING.has(err?.code)) return "unknown";
  }
  // No mail record: mail can still be delivered to the domain's own address.
  let sawMissing = false;
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      const addrs = await withTimeout(lookup.call(resolver, domain), timeoutMs);
      if (addrs.length > 0) return "ok";
      sawMissing = true;
    } catch (err: any) {
      if (!MISSING.has(err?.code)) return "unknown";
      sawMissing = true;
    }
  }
  return sawMissing ? "no_mail" : "unknown";
}

/** True unless the domain is known not to receive mail. Skipped when running
 *  under the test runner (no network) or when EMAIL_DNS_CHECK=off. */
export async function domainCanReceiveMail(domain: string): Promise<boolean> {
  if (process.env.VITEST || process.env.EMAIL_DNS_CHECK === "off") return true;
  return (await checkMailDomain(domain)) !== "no_mail";
}
