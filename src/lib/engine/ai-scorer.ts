import type { Article, Entity } from "@/lib/types";
import {
  postChatCompletion,
  RELEVANCE_DISCARD_BELOW,
  truncateForModel,
  WISE_GROUP_MONITORING_CONTEXT,
} from "@/lib/engine/openrouter-client";

/** Default score when the API fails or the response cannot be parsed (project.md). */
export const DEFAULT_RELEVANCE_SCORE = 50;

export { RELEVANCE_DISCARD_BELOW };

const MAX_BODY_CHARS = 14_000;

export type ScoreArticleInput = {
  article: Pick<
    Article,
    "title" | "body" | "source" | "url" | "paywalled"
  >;
  entity: Pick<Entity, "name" | "keywords" | "description">;
};

export type RelevanceScoreResult = {
  score: number;
  reason: string;
};

/**
 * Relevance scoring via OpenRouter (Claude Haiku).
 * Call only after keyword pre-filter — do not send the full ingest set here.
 */
export async function scoreArticleRelevance(
  input: ScoreArticleInput
): Promise<RelevanceScoreResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[ai-scorer] OPENROUTER_API_KEY is not set");
    return {
      score: DEFAULT_RELEVANCE_SCORE,
      reason: "Relevance scoring unavailable (API key missing).",
    };
  }

  const { article, entity } = input;
  const body = truncateForModel(article.body, MAX_BODY_CHARS);

  const systemPrompt = `${WISE_GROUP_MONITORING_CONTEXT}

You output only valid JSON, no markdown fences.`;

  const entityContext = entity.description
    ? `Entity: ${entity.name}\nDescription: ${entity.description}\nMonitoring themes: ${entity.keywords.join(", ")}`
    : `Entity: ${entity.name}\nMonitoring themes: ${entity.keywords.join(", ")}`;

  const userPrompt = `Assess how relevant this news article is to the following entity.

${entityContext}

Article metadata:
- Source: ${article.source}
- URL: ${article.url}
- Paywalled (RSS summary only): ${article.paywalled ? "yes" : "no"}

Title:
${article.title}

Body / summary text:
${body}

Respond with a single JSON object exactly in this shape (numbers 0–100):
{"score": <number>, "reason": "<one sentence explaining the score>"}`;

  try {
    const { content } = await postChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const parsed = parseScoreJson(content);
    return {
      score: clampScore(parsed.score),
      reason: parsed.reason,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-scorer] OpenRouter call failed:", message);
    return {
      score: DEFAULT_RELEVANCE_SCORE,
      reason: "Relevance could not be scored automatically; default score applied.",
    };
  }
}

function clampScore(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_RELEVANCE_SCORE;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseScoreJson(content: string): { score: number; reason: string } {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object in model response");
  }
  const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reason?: unknown };
  const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
  const reason =
    typeof parsed.reason === "string" ? parsed.reason.trim() : String(parsed.reason ?? "");
  if (!Number.isFinite(score) || reason.length === 0) {
    throw new Error("Invalid score JSON shape");
  }
  return { score, reason };
}

function parseScoreAndSummaryJson(content: string): {
  score: number;
  reason: string;
  summary: string;
} {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object in model response");
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    score?: unknown;
    reason?: unknown;
    summary?: unknown;
  };
  const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
  const reason =
    typeof parsed.reason === "string" ? parsed.reason.trim() : String(parsed.reason ?? "");
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!Number.isFinite(score) || reason.length === 0) {
    throw new Error("Invalid score+summary JSON shape");
  }
  return { score, reason, summary };
}

export type ScoreAndSummaryResult = {
  score: number;
  reason: string;
  summary: string;
};

/**
 * Combined relevance scoring + summarisation in a single OpenRouter call.
 * Halves API round-trips vs calling scoreArticleRelevance + summariseArticle separately.
 * If score < RELEVANCE_DISCARD_BELOW, summary will be empty string.
 */
export async function scoreAndSummariseArticle(
  input: ScoreArticleInput
): Promise<ScoreAndSummaryResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[ai-scorer] OPENROUTER_API_KEY is not set");
    return {
      score: DEFAULT_RELEVANCE_SCORE,
      reason: "Relevance scoring unavailable (API key missing).",
      summary: "",
    };
  }

  const { article, entity } = input;
  const body = truncateForModel(article.body, MAX_BODY_CHARS);

  const systemPrompt = `${WISE_GROUP_MONITORING_CONTEXT}

You output only valid JSON, no markdown fences.`;

  const entityContext = entity.description
    ? `Entity: ${entity.name}\nDescription: ${entity.description}\nMonitoring themes: ${entity.keywords.join(", ")}`
    : `Entity: ${entity.name}\nMonitoring themes: ${entity.keywords.join(", ")}`;

  const userPrompt = `Assess how relevant this news article is to the following entity, and if relevant, provide a brief summary.

${entityContext}

Article metadata:
- Source: ${article.source}
- URL: ${article.url}
- Paywalled (RSS summary only): ${article.paywalled ? "yes" : "no"}

Title:
${article.title}

Body / summary text:
${body}

Respond with a single JSON object exactly in this shape:
{"score": <number 0-100>, "reason": "<one sentence explaining the score>", "summary": "<1-2 sentence factual summary for colleagues, or empty string if score is below 40>"}

Rules:
- Score 0-100 for how relevant this article is to the entity
- If score < 40, set summary to ""
- Summary should be factual and neutral — no editorial opinion or hype
- If the article is paywalled, base the summary only on the title and RSS description provided`;

  try {
    const { content } = await postChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const parsed = parseScoreAndSummaryJson(content);
    return {
      score: clampScore(parsed.score),
      reason: parsed.reason,
      summary: parsed.score >= RELEVANCE_DISCARD_BELOW ? parsed.summary : "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-scorer] OpenRouter call failed:", message);
    return {
      score: DEFAULT_RELEVANCE_SCORE,
      reason: "Relevance could not be scored automatically; default score applied.",
      summary: "",
    };
  }
}
