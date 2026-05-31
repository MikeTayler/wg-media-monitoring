import { ensureTablesExist, query } from "@/lib/db";

export type DigestRunMode = "admin" | "entity";

export type DigestRunEntityCount = {
  entityName: string;
  articleCount: number;
};

/**
 * Persist per-entity article counts for a single digest send. Entities with
 * zero articles are skipped. Safe to call once per run after the emails go out.
 */
export async function recordDigestRunEntityCounts(
  runId: string,
  mode: DigestRunMode,
  counts: DigestRunEntityCount[]
): Promise<void> {
  const rows = counts.filter((c) => c.articleCount > 0);
  if (rows.length === 0) return;
  await ensureTablesExist();

  const params: unknown[] = [];
  const tuples = rows.map((c, i) => {
    const base = i * 4;
    params.push(runId, mode, c.entityName, c.articleCount);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });

  await query(
    `INSERT INTO digest_run_log (run_id, mode, entity_name, article_count) VALUES ${tuples.join(", ")}`,
    params
  );
}

export type DigestRunLogGroup = {
  runId: string;
  runAt: string;
  mode: string;
  totalArticles: number;
  entities: DigestRunEntityCount[];
};

/**
 * Recent digest runs, grouped by run and ordered newest-first. Each group lists
 * its per-entity article counts.
 */
export async function getRecentDigestRunLog(
  limitRuns = 30
): Promise<DigestRunLogGroup[]> {
  await ensureTablesExist();
  const rows = await query<{
    run_id: string;
    run_at: string;
    mode: string;
    entity_name: string;
    article_count: number | string;
  }>(
    `SELECT run_id, run_at, mode, entity_name, article_count
       FROM digest_run_log
      WHERE run_id IN (
        SELECT run_id FROM digest_run_log GROUP BY run_id ORDER BY MAX(run_at) DESC LIMIT $1
      )
      ORDER BY run_at DESC, entity_name ASC`,
    [limitRuns]
  );

  const groups = new Map<string, DigestRunLogGroup>();
  for (const r of rows) {
    let g = groups.get(r.run_id);
    if (!g) {
      g = { runId: r.run_id, runAt: r.run_at, mode: r.mode, totalArticles: 0, entities: [] };
      groups.set(r.run_id, g);
    }
    const count = Number(r.article_count);
    g.entities.push({ entityName: r.entity_name, articleCount: count });
    g.totalArticles += count;
  }

  return Array.from(groups.values());
}
