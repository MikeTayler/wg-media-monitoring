import { NextResponse } from "next/server";

/**
 * TODO: Daily email digest (triggered by Vercel Cron or manual call).
 * - Validate `CRON_SECRET` like `/api/ingest`; return 401 if invalid.
 * - Support `?dry_run=true` to return rendered HTML without sending via Mailgun.
 * - Load matched/scored articles from storage; group by entity and recipient per project.md email rules.
 * - Use `@/lib/email/template` for HTML and `@/lib/email/sender` for Mailgun.
 * - Send one email per recipient; handle empty days with a short “no coverage” message.
 * - Record last digest send time for the status page.
 */

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Digest not implemented yet." },
    { status: 501 }
  );
}
