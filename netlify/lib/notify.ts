// Best-effort email notifications via Resend. If RESEND_API_KEY is not
// configured, this silently no-ops -- the app is fully usable without it,
// since the in-app share link and feed already surface everything.

import { getEnv } from "./env.ts";

export async function sendEmail(to: string, subject: string, text: string, replyTo?: string) {
  const apiKey = getEnv("RESEND_API_KEY");
  const from = getEnv("NOTIFY_FROM_EMAIL") || "tasketra <info@tasketra.com>";
  if (!apiKey || !to) return { sent: false, reason: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) return { sent: false, reason: `resend_error_${res.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "network_error" };
  }
}
