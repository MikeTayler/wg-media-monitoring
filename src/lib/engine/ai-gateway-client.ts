/**
 * Vercel AI Gateway — OpenAI-compatible Chat Completions.
 * @see https://vercel.com/docs/ai-gateway/openai-compat
 */

export const GATEWAY_CHAT_MODEL = "anthropic/claude-haiku-4.5";

/** Articles below this score are discarded before summaries / digest (project.md). */
export const RELEVANCE_DISCARD_BELOW = 40;

const AI_GATEWAY_CHAT_COMPLETIONS_URL =
  "https://ai-gateway.vercel.sh/v1/chat/completions";

/** Shared context for scoring and summarisation prompts. */
export const WISE_GROUP_MONITORING_CONTEXT = `This is a New Zealand media monitoring tool for the Wise Group, a social services organisation. Articles about mental health, disability, social services, housing, employment, and government policy in these areas are likely relevant.`;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Prefer AI_GATEWAY_API_KEY; OPENROUTER_API_KEY supported as a transitional alias. */
export function hasGatewayApiKey(): boolean {
  return resolveGatewayApiKey() !== undefined;
}

function resolveGatewayApiKey(): string | undefined {
  return (
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    undefined
  );
}

export async function postChatCompletion(
  messages: ChatMessage[]
): Promise<{ content: string; usage?: ChatCompletionResponse["usage"] }> {
  const apiKey = resolveGatewayApiKey();
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set (legacy: OPENROUTER_API_KEY)"
    );
  }

  const res = await fetch(AI_GATEWAY_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GATEWAY_CHAT_MODEL,
      messages,
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `AI Gateway HTTP ${res.status}: ${rawText.slice(0, 800)}`
    );
  }

  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(rawText) as ChatCompletionResponse;
  } catch {
    throw new Error("AI Gateway returned non-JSON response");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      "AI Gateway response missing choices[0].message.content"
    );
  }

  if (data.usage) {
    console.log("[ai-gateway] usage:", JSON.stringify(data.usage));
  }

  return { content, usage: data.usage };
}

/** Avoid oversized prompts — keep head of body for scoring/summary. */
export function truncateForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[…truncated for model context]`;
}
