import { readFile, writeFile } from "fs/promises";

/** PoC pipeline status next to other `/tmp` JSON stores (see `project.md`). */
export const PIPELINE_STATUS_PATH = "/tmp/wg-pipeline-status.json";

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

function defaultStatus(): PipelineStatusFile {
  return {
    lastIngestion: null,
    lastDigest: null,
    errors: [],
  };
}

export async function readPipelineStatus(): Promise<PipelineStatusFile> {
  try {
    const raw = await readFile(PIPELINE_STATUS_PATH, "utf8");
    const data = JSON.parse(raw) as PipelineStatusFile;
    return {
      lastIngestion: data.lastIngestion ?? null,
      lastDigest: data.lastDigest ?? null,
      errors: Array.isArray(data.errors) ? data.errors : [],
    };
  } catch {
    return defaultStatus();
  }
}

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

async function persist(status: PipelineStatusFile): Promise<void> {
  const trimmed = {
    ...status,
    errors: trimErrorsTo24h(status.errors),
  };
  await writeFile(
    PIPELINE_STATUS_PATH,
    JSON.stringify(trimmed, null, 2),
    "utf8"
  );
}

export async function recordIngestSuccess(
  articleCount: number,
  perSourceErrors: Record<string, string>
): Promise<void> {
  const status = await readPipelineStatus();
  status.lastIngestion = {
    at: new Date().toISOString(),
    articleCount,
  };
  const now = new Date().toISOString();
  for (const [sourceKey, message] of Object.entries(perSourceErrors)) {
    status.errors.push({
      at: now,
      source: `ingest:${sourceKey}`,
      message,
    });
  }
  await persist(status);
}

export async function recordDigestRun(stats: {
  recipientCount: number;
  emailsSent: number;
}): Promise<void> {
  const status = await readPipelineStatus();
  status.lastDigest = {
    at: new Date().toISOString(),
    recipientCount: stats.recipientCount,
    emailsSent: stats.emailsSent,
  };
  await persist(status);
}

export async function recordPipelineError(
  source: string,
  message: string
): Promise<void> {
  const status = await readPipelineStatus();
  status.errors.push({
    at: new Date().toISOString(),
    source,
    message,
  });
  await persist(status);
}
