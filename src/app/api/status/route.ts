import { NextResponse } from "next/server";
import { DIGEST_SOLO_TEST_EMAIL, getDigestRecipientEmails } from "@/lib/config";
import {
  filterErrorsLast24h,
  readPipelineStatus,
} from "@/lib/status/store";

export const dynamic = "force-dynamic";

/**
 * Public PoC status — no auth (`project.md`).
 * Reads `/tmp/wg-pipeline-status.json` (written by ingest/digest on each run).
 */
export async function GET() {
  try {
    const raw = await readPipelineStatus();
    const errors = filterErrorsLast24h(raw.errors);
    const recipientEmails = await getDigestRecipientEmails();
    const configuredRecipientCount = recipientEmails.length;

    return NextResponse.json({
      ok: true,
      lastIngestionAt: raw.lastIngestion?.at ?? null,
      articleCount: raw.lastIngestion?.articleCount ?? null,
      lastDigestAt: raw.lastDigest?.at ?? null,
      digestRecipientCount: raw.lastDigest?.recipientCount ?? null,
      digestEmailsSent: raw.lastDigest?.emailsSent ?? null,
      configuredRecipientCount,
      soloTestRecipientEmail: DIGEST_SOLO_TEST_EMAIL,
      recentErrors: errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        lastIngestionAt: null,
        articleCount: null,
        lastDigestAt: null,
        digestRecipientCount: null,
        digestEmailsSent: null,
        configuredRecipientCount: null,
        soloTestRecipientEmail: null,
        recentErrors: [],
      },
      { status: 500 }
    );
  }
}
