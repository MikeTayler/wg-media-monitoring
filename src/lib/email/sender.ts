import FormData from "form-data";
import Mailgun from "mailgun.js";

export type SendDigestResult = {
  ok: boolean;
  recipient: string;
  messageId?: string;
  error?: string;
};

function getMailgunClient() {
  const key = process.env.MAILGUN_API_KEY;
  if (!key) {
    throw new Error("MAILGUN_API_KEY is not set");
  }
  const mailgun = new Mailgun(FormData);
  return mailgun.client({ username: "api", key });
}

/**
 * Send one HTML email via Mailgun. Logs success or failure to the console.
 */
export async function sendDigestEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendDigestResult> {
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM;
  if (!domain || !from) {
    const err = "MAILGUN_DOMAIN or MAILGUN_FROM is not set";
    console.error(`[mailgun] ${err}`);
    return { ok: false, recipient: params.to, error: err };
  }

  try {
    const mg = getMailgunClient();
    const res = await mg.messages.create(domain, {
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });

    const messageId =
      typeof res === "object" && res !== null && "id" in res
        ? String((res as { id?: string }).id)
        : undefined;

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
