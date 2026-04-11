import { NextResponse } from "next/server";
import { getEntityRecipientEmails, getAdminRecipientEmails } from "@/lib/config";
import {
  filterErrorsLast24h,
  readPipelineStatus,
} from "@/lib/status/store";

export const dynamic = "force-dynamic";

/**
 * Public PoC status — no auth (`project.md`).
 * Reads pipeline status from the Neon `pipeline_status` table.
 */
export async function GET() {
  try {
    const raw = await readPipelineStatus();
    const errors = filterErrorsLast24h(raw.errors);
    const [entityEmails, adminEmails] = await Promise.all([
      getEntityRecipientEmails(),
      getAdminRecipientEmails(),
    ]);

    return NextResponse.json({
      ok: true,
      lastIngestionAt: raw.lastIngestion?.at ?? null,
      articleCount: raw.lastIngestion?.articleCount ?? null,
      lastDigestAt: raw.lastDigest?.at ?? null,
      digestRecipientCount: raw.lastDigest?.recipientCount ?? null,
      digestEmailsSent: raw.lastDigest?.emailsSent ?? null,
      configuredRecipientCount: entityEmails.length,
      adminRecipientCount: adminEmails.length,
      recentErrors: errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[status] Failed to read pipeline status:", message);
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
        adminRecipientCount: null,
        recentErrors: [],
      },
      { status: 500 }
    );
  }
}
