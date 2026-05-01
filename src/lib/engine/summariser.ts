import type { Article } from "@/lib/types";
import {
  hasGatewayApiKey,
  postChatCompletion,
  RELEVANCE_DISCARD_BELOW,
  truncateForModel,
  WISE_GROUP_MONITORING_CONTEXT,
} from "@/lib/engine/ai-gateway-client";

/** Summaries are only generated for articles at or above this relevance score. */
export const SUMMARY_RELEVANCE_THRESHOLD = RELEVANCE_DISCARD_BELOW;

const MAX_INPUT_CHARS = 12_000;

/** In-memory cache: article id → summary text (PoC; replace with persistent store in MVP). */
const summaryCache = new Map<string, string>();

export function clearSummaryCache(): void {
  summaryCache.clear();
}

/**
 * 1–2 sentence factual summary via Vercel AI Gateway. Only runs when `relevanceScore` ≥ threshold.
 * NZ Herald (`paywalled`): uses title + body only (body is RSS description).
 */
export async function summariseArticle(
  article: Article,
  options: { relevanceScore: number }
): Promise<string> {
  if (options.relevanceScore < SUMMARY_RELEVANCE_THRESHOLD) {
    return "";
  }

  const cached = summaryCache.get(article.id);
  if (cached !== undefined) {
    return cached;
  }

  if (!hasGatewayApiKey()) {
    console.error(
      "[summariser] AI_GATEWAY_API_KEY is not set (or legacy OPENROUTER_API_KEY)"
    );
    return "";
  }

  const userContent = article.paywalled
    ? `This item is paywalled — use only the title and RSS summary below. Do not infer details not stated.

Title: ${article.title}

RSS summary / description:
${truncateForModel(article.body, MAX_INPUT_CHARS)}`
    : `Title: ${article.title}

Article text:
${truncateForModel(article.body, MAX_INPUT_CHARS)}`;

  const systemPrompt = `${WISE_GROUP_MONITORING_CONTEXT}

Write 1–2 short sentences summarising the article for colleagues. Be factual and neutral — no editorial opinion or hype.`;

  try {
    const { content } = await postChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ]);

    const summary = content.trim();
    summaryCache.set(article.id, summary);
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[summariser] AI Gateway call failed:", message);
    return "";
  }
}
