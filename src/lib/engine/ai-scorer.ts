/**
 * TODO: Relevance scoring via OpenRouter → Claude Haiku (OpenAI-compatible chat completions).
 * - Use `OPENROUTER_API_KEY`; model `anthropic/claude-haiku-4-5-20251001` per `project.md`.
 * - POST `https://openrouter.ai/api/v1/chat/completions` with Wise Group / NZ social-sector context in system prompt.
 * - Return 0–100 score plus one-sentence reason; discard below 40 when wired into pipeline.
 * - On API failure: log, continue pipeline, default score 50 (per project.md).
 * - Log token usage for cost awareness.
 */

export {};
