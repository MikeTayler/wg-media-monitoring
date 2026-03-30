/**
 * OpenRouter chat completions — OpenAI-compatible API.
 * @see project.md — never hardcode API keys; log usage for cost awareness.
 */

export const OPENROUTER_MODEL = "anthropic/claude-haiku-4.5";

/** Articles below this score are discarded before summaries / digest (project.md). */
export const RELEVANCE_DISCARD_BELOW = 40;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

export async function postChatCompletion(
  messages: ChatMessage[]
): Promise<{ content: string; usage?: ChatCompletionResponse["usage"] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenRouter HTTP ${res.status}: ${rawText.slice(0, 800)}`
    );
  }

  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(rawText) as ChatCompletionResponse;
  } catch {
    throw new Error("OpenRouter returned non-JSON response");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter response missing choices[0].message.content");
  }

  if (data.usage) {
    console.log("[openrouter] usage:", JSON.stringify(data.usage));
  }

  return { content, usage: data.usage };
}

/** Avoid oversized prompts — keep head of body for scoring/summary. */
export function truncateForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[…truncated for model context]`;
}
