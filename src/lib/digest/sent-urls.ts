import { ensureTablesExist, query } from "@/lib/db";
import { normalizeArticleUrl } from "@/lib/util/normalize-url";

/** Default dedupe window — a URL is only treated as "already sent" if it was
 *  first sent within this many days. Override with `DEDUPE_WINDOW_DAYS`. */
const DEFAULT_DEDUPE_WINDOW_DAYS = 14;

/** Resolve the dedupe window (in days) from env, falling back to the default. */
export function getDedupeWindowDays(): number {
  const raw = process.env.DEDUPE_WINDOW_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEDUPE_WINDOW_DAYS;
}

/** Unique normalised URLs, stable order preserved. */
export function uniqueNormalizeUrls(canonicalUrls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of canonicalUrls) {
    const n = normalizeArticleUrl(u);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * URLs that were sent within the dedupe window. URLs sent longer ago than the
 * window are intentionally excluded so the ledger self-heals over time.
 */
export async function loadSentDigestNormalizedUrls(
  windowDays: number = getDedupeWindowDays()
): Promise<Set<string>> {
  await ensureTablesExist();
  const rows = await query<{ url_norm: string }>(
    "SELECT url_norm FROM digest_sent_urls WHERE first_sent_at >= now() - ($1 || ' days')::interval",
    [String(windowDays)]
  );
  return new Set(rows.map((r) => r.url_norm));
}

/**
 * Record normalised URLs as sent, tagged with a run id so a single run can be
 * rolled back later. Existing URLs keep their original timestamp / run id.
 */
export async function recordDigestSentUrls(
  urlsNormalized: string[],
  runId?: string
): Promise<void> {
  if (urlsNormalized.length === 0) return;
  await ensureTablesExist();
  const rid = runId ?? new Date().toISOString();
  const ridParamIndex = urlsNormalized.length + 1;
  const valueTuples = urlsNormalized
    .map((_, i) => `($${i + 1}, $${ridParamIndex})`)
    .join(", ");
  await query(
    `INSERT INTO digest_sent_urls (url_norm, digest_run_id) VALUES ${valueTuples} ON CONFLICT (url_norm) DO NOTHING`,
    [...urlsNormalized, rid]
  );
}

export type DedupeLedgerStats = {
  /** Total rows in the ledger (all time). */
  total: number;
  /** Rows that are still active within the dedupe window. */
  activeWithinWindow: number;
  windowDays: number;
  lastRunId: string | null;
  lastRunCount: number;
  lastSentAt: string | null;
};

/** Summary of the dedupe ledger for display in the dashboard. */
export async function getDedupeLedgerStats(): Promise<DedupeLedgerStats> {
  await ensureTablesExist();
  const windowDays = getDedupeWindowDays();

  const totals = await query<{ total: string; active: string; last_sent: string | null }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE first_sent_at >= now() - ($1 || ' days')::interval)::text AS active,
       MAX(first_sent_at)::text AS last_sent
     FROM digest_sent_urls`,
    [String(windowDays)]
  );

  const latest = await query<{ digest_run_id: string }>(
    "SELECT digest_run_id FROM digest_sent_urls WHERE digest_run_id IS NOT NULL ORDER BY first_sent_at DESC LIMIT 1"
  );
  const lastRunId = latest[0]?.digest_run_id ?? null;

  let lastRunCount = 0;
  if (lastRunId) {
    const c = await query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM digest_sent_urls WHERE digest_run_id = $1",
      [lastRunId]
    );
    lastRunCount = Number(c[0]?.count ?? "0");
  }

  return {
    total: Number(totals[0]?.total ?? "0"),
    activeWithinWindow: Number(totals[0]?.active ?? "0"),
    windowDays,
    lastRunId,
    lastRunCount,
    lastSentAt: totals[0]?.last_sent ?? null,
  };
}

/** Delete every row in the dedupe ledger. Returns the number of rows cleared. */
export async function clearAllSentDigestUrls(): Promise<number> {
  await ensureTablesExist();
  const rows = await query<{ url_norm: string }>(
    "DELETE FROM digest_sent_urls RETURNING url_norm"
  );
  return rows.length;
}

/**
 * Delete only the rows recorded by the most recent digest run. Useful for
 * retrying after a digest that failed or sent incorrect content.
 */
export async function clearLastDigestRunUrls(): Promise<{
  cleared: number;
  runId: string | null;
}> {
  await ensureTablesExist();
  const latest = await query<{ digest_run_id: string }>(
    "SELECT digest_run_id FROM digest_sent_urls WHERE digest_run_id IS NOT NULL ORDER BY first_sent_at DESC LIMIT 1"
  );
  const runId = latest[0]?.digest_run_id ?? null;
  if (!runId) return { cleared: 0, runId: null };

  const rows = await query<{ url_norm: string }>(
    "DELETE FROM digest_sent_urls WHERE digest_run_id = $1 RETURNING url_norm",
    [runId]
  );
  return { cleared: rows.length, runId };
}
