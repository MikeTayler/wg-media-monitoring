import { query } from "@/lib/db";

export type PipelineErrorEntry = {
  at: string;
  source: string;
  message: string;
};

export type PipelineStatusFile = {
  lastIngestion: { at: string; articleCount: number } | null;
  lastDigest: {
    at: string;
    recipientCount: number;
    emailsSent: number;
  } | null;
  errors: PipelineErrorEntry[];
};

const MS_24H = 24 * 60 * 60 * 1000;

function trimErrorsTo24h(errors: PipelineErrorEntry[]): PipelineErrorEntry[] {
  const cutoff = Date.now() - MS_24H;
  return errors.filter((e) => {
    const t = new Date(e.at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/** Errors from the last 24 hours (by `at` timestamp). */
export function filterErrorsLast24h(errors: PipelineErrorEntry[]): PipelineErrorEntry[] {
  return trimErrorsTo24h(errors);
}

function parseJsonbValue<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  return raw as T;
}

export async function readPipelineStatus(): Promise<PipelineStatusFile> {
  try {
    const rows = await query<{ key: string; value: unknown }>(
      "SELECT key, value FROM pipeline_status"
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const lastIngestion = parseJsonbValue<PipelineStatusFile["lastIngestion"]>(map.get("last_ingestion"));
    const lastDigest = parseJsonbValue<PipelineStatusFile["lastDigest"]>(map.get("last_digest"));
    const errors = parseJsonbValue<PipelineErrorEntry[]>(map.get("errors")) ?? [];

    return {
      lastIngestion,
      lastDigest,
      errors: Array.isArray(errors) ? errors : [],
    };
  } catch {
    return { lastIngestion: null, lastDigest: null, errors: [] };
  }
}

async function persistErrors(errors: PipelineErrorEntry[]): Promise<void> {
  const trimmed = trimErrorsTo24h(errors);
  const value = JSON.stringify(trimmed);
  await query(
    `INSERT INTO pipeline_status (key, value, updated_at) VALUES ('errors', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [value]
  );
}

export async function recordIngestSuccess(
  articleCount: number,
  perSourceErrors: Record<string, string>
): Promise<void> {
  console.log(`[status] Recording ingest success: articleCount=${articleCount}`);
  const value = JSON.stringify({ at: new Date().toISOString(), articleCount });
  await query(
    `INSERT INTO pipeline_status (key, value, updated_at) VALUES ('last_ingestion', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [value]
  );

  if (Object.keys(perSourceErrors).length > 0) {
    const status = await readPipelineStatus();
    const now = new Date().toISOString();
    for (const [sourceKey, message] of Object.entries(perSourceErrors)) {
      status.errors.push({ at: now, source: `ingest:${sourceKey}`, message });
    }
    await persistErrors(status.errors);
  }
}

export async function recordDigestRun(stats: {
  recipientCount: number;
  emailsSent: number;
}): Promise<void> {
  const value = JSON.stringify({
    at: new Date().toISOString(),
    recipientCount: stats.recipientCount,
    emailsSent: stats.emailsSent,
  });
  await query(
    `INSERT INTO pipeline_status (key, value, updated_at) VALUES ('last_digest', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [value]
  );
}

export async function recordPipelineError(
  source: string,
  message: string
): Promise<void> {
  const status = await readPipelineStatus();
  status.errors.push({ at: new Date().toISOString(), source, message });
  await persistErrors(status.errors);
}
