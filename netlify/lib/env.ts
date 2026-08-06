declare const Netlify: { env: { get(key: string): string | undefined } } | undefined;

export function getEnv(key: string): string | undefined {
  const fromNetlify = typeof Netlify !== "undefined" ? Netlify.env.get(key) : undefined;
  return fromNetlify || process.env[key];
}

/** Base URL used in outbound links (invite emails, reset links). Set SITE_URL
 *  once a custom domain is live; falls back to the default Netlify subdomain. */
export function getSiteUrl(): string {
  return getEnv("SITE_URL") || "https://charter-pm-karissa2026.netlify.app";
}
