// Blocks the outbound-webhook feature (Connections tab) from being pointed
// at internal/private infrastructure. Checked at two points: when a user
// saves a webhook URL (fast feedback, string-based) and again right before
// every dispatch (DNS-resolved, so a hostname that resolves to a private IP
// -- including via DNS rebinding after the URL was saved -- is still
// caught, not just the literal string the user typed).

import dns from "node:dns/promises";

const PRIVATE_V4_RANGES: [number, number][] = [
  [ip4("0.0.0.0"), ip4("0.255.255.255")],
  [ip4("10.0.0.0"), ip4("10.255.255.255")],
  [ip4("127.0.0.0"), ip4("127.255.255.255")],
  [ip4("169.254.0.0"), ip4("169.254.255.255")], // link-local -- covers cloud metadata endpoints
  [ip4("172.16.0.0"), ip4("172.31.255.255")],
  [ip4("192.168.0.0"), ip4("192.168.255.255")],
];

function ip4(addr: string): number {
  const parts = addr.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateV4(addr: string): boolean {
  const n = ip4(addr);
  return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

function isPrivateV6(addr: string): boolean {
  const a = addr.toLowerCase();
  return (
    a === "::1" || // loopback
    a.startsWith("fc") || a.startsWith("fd") || // unique local (fc00::/7)
    a.startsWith("fe80") // link-local
  );
}

/** Cheap, synchronous first pass at save time -- catches the obvious cases
 *  (localhost, literal IPs in a private range) without a DNS round trip. */
export function isObviouslyUnsafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateV4(host);
  if (host.includes(":")) return isPrivateV6(host);
  return false;
}

/** Full check at dispatch time -- resolves the hostname and checks the
 *  actual IP(s) it points to right now, so a public hostname that's been
 *  re-pointed at a private address since the URL was saved doesn't sneak
 *  through. Fails closed: any DNS error is treated as unsafe. */
export async function isWebhookUrlSafeToDispatch(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !isPrivateV4(host);
  if (host.includes(":")) return !isPrivateV6(host);

  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return records.every((r) =>
      r.family === 4 ? !isPrivateV4(r.address) : !isPrivateV6(r.address)
    );
  } catch {
    return false;
  }
}
