import { authorizeCron } from "@/lib/api/cron-auth";
import { ingestAll } from "@/lib/ingest/all";
import { recordIngestSuccess, recordPipelineError } from "@/lib/status/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streaming RSS ingestion for the dashboard. Emits Server-Sent Events with live
 * progress (`source_start`, `source_done`, `enrich_progress`, …) followed by a
 * final `done` (or `error`) event carrying the full ingest result.
 *
 * Auth: `?secret=` (EventSource/fetch cannot send custom headers easily) or the
 * usual `Authorization: Bearer` / `x-cron-secret` headers.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const result = await ingestAll({ onProgress: (e) => send(e) });
        try {
          await recordIngestSuccess(result.totalUnique, result.errors ?? {});
        } catch (persistErr) {
          console.error("[ingest/stream] Failed to persist status:", persistErr);
        }
        send({ type: "done", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ingest/stream] ingestAll failed:", message);
        try {
          await recordPipelineError("ingest", message);
        } catch {
          /* ignore */
        }
        send({ type: "error", error: message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
