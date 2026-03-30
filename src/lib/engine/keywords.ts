/**
 * TODO: Keyword matching engine (free, first-stage filter).
 * - Match article title/body against each entity’s `aliases` and `keywords` from `@/lib/config`.
 * - Support UTF-8 / macrons (do not strip diacritics for Te reo Māori).
 * - Return which keywords matched for downstream scoring and digest grouping.
 * - Only articles that match here should be sent to the AI scorer (cost control).
 */

export {};
