export type SendDigestResult = {
  ok: boolean;
  recipient: string;
  messageId?: string;
  error?: string;
};

/** US API (default). EU accounts need `MAILGUN_API_URL=https://api.eu.mailgun.net`. */
const MAILGUN_API_URL_US = "https://api.mailgun.net";

/**
 * Send one HTML email via Mailgun using the native fetch + FormData APIs.
 * No mailgun.js or form-data dependency — avoids the url.parse() deprecation warning.
 */
export async function sendDigestEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendDigestResult> {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM;

  if (!key || !domain || !from) {
    const err = "MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_FROM is not set";
    console.error(`[mailgun] ${err}`);
    return { ok: false, recipient: params.to, error: err };
  }

  const baseUrl = process.env.MAILGUN_API_URL?.trim() || MAILGUN_API_URL_US;
  const endpoint = `${baseUrl}/v3/${domain}/messages`;

  const body = new FormData();
  body.append("from", from);
  body.append("to", params.to);
  body.append("subject", params.subject);
  body.append("html", params.html);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}`,
      },
      body,
      // Bypass Next.js fetch cache — this is a side-effectful POST.
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      const errMsg = json.message ?? `HTTP ${res.status}`;
      console.error(`[mailgun] Failed to send to ${params.to}: ${errMsg}`);
      return { ok: false, recipient: params.to, error: errMsg };
    }

    const messageId = json.id;
    console.log(
      `[mailgun] Sent digest to ${params.to}${messageId ? ` (id: ${messageId})` : ""}`
    );
    return { ok: true, recipient: params.to, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mailgun] Failed to send to ${params.to}:`, message);
    return { ok: false, recipient: params.to, error: message };
  }
}
