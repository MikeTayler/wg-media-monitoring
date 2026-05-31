/**
 * Daily digest HTML — inline CSS only, mobile-friendly. No images.
 * Markup is built without embedding newline characters in the output string; spacing uses tags only.
 * @see project.md — group by entity, High/Medium relevance, Paywalled badge for NZ Herald.
 */

export type RelevanceBand = "High" | "Medium";

/** Tone of the coverage toward the entity. */
export type Sentiment = "positive" | "neutral" | "negative";

export type DigestArticleRow = {
  title: string;
  url: string;
  sourceLabel: string;
  /** Article publication date, display-only (already localised). */
  publishedLabel: string;
  paywalled: boolean;
  relevanceBand: RelevanceBand;
  relevanceScore: number;
  summary: string;
  matchedKeywords: string[];
  /** One-sentence explanation of the relevance score. */
  relevanceReason: string;
  sentiment: Sentiment;
};

/** Article that matched keywords but scored below the relevance threshold. */
export type ExcludedArticleRow = {
  title: string;
  url: string;
  sourceLabel: string;
  publishedLabel: string;
  paywalled: boolean;
  relevanceScore: number;
  relevanceReason: string;
  matchedKeywords: string[];
  sentiment: Sentiment;
};

export type DigestSection = {
  entityName: string;
  articles: DigestArticleRow[];
  /** Optional: keyword matches that fell below the relevance threshold. */
  excludedArticles?: ExcludedArticleRow[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(url: string): string {
  return escapeHtml(url);
}

/** Summary may contain line breaks from the model — turn them into &lt;br /&gt; after escaping. */
function formatSummaryHtml(summary: string): string {
  const segments = summary.split(/\r\n|\r|\n/g);
  return segments
    .map((line) => escapeHtml(line.trimEnd()))
    .join("<br />");
}

/** Map numeric score to High (≥70) or Medium (40–69). */
export function scoreToRelevanceBand(score: number): RelevanceBand {
  return score >= 70 ? "High" : "Medium";
}

/** Coloured pill for the coverage sentiment. Neutral renders nothing. */
function renderSentimentBadge(sentiment: Sentiment): string {
  if (sentiment === "neutral") return "";
  const label = sentiment === "positive" ? "Positive" : "Negative";
  const color = sentiment === "positive" ? "#166534" : "#991b1b";
  const bg = sentiment === "positive" ? "#dcfce7" : "#fee2e2";
  return `<span style="display:inline-block;margin-left:6px;padding:2px 8px;font-size:12px;font-weight:600;color:${color};background-color:${bg};border-radius:999px;">${label}</span>`;
}

/** Render the AI relevance reason as a small italic line. */
function renderReasonHtml(reason: string): string {
  if (!reason) return "";
  return [
    "<tr>",
    '<td style="padding-top:6px;font-size:13px;line-height:1.45;color:#6b7280;font-style:italic;">',
    `Why it matters: ${escapeHtml(reason)}`,
    "</td>",
    "</tr>",
  ].join("");
}

/** No qualifying articles for this recipient. */
export function renderEmptyDigestHtml(): string {
  return wrapLayout({
    title: "Daily digest",
    innerHtml:
      '<p style="margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#374151;">No relevant coverage found today.</p>',
  });
}

type LayoutOptions = { title: string; innerHtml: string };

function wrapLayout({ title, innerHtml }: LayoutOptions): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en-NZ">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${escapeHtml(title)}</title>`,
    "</head>",
    '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:24px 12px;">',
    "<tr>",
    '<td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">',
    "<tr>",
    '<td style="padding:24px 24px 16px 24px;border-bottom:1px solid #e5e7eb;background-color:#fafafa;">',
    '<h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;letter-spacing:-0.02em;">Wise Group Media Monitor</h1>',
    '<p style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">Daily digest</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:24px;">',
    innerHtml,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:16px 24px 24px 24px;border-top:1px solid #e5e7eb;background-color:#fafafa;">',
    '<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">This digest was generated automatically by the Wise Group Media Monitor PoC.</p>',
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function renderArticleRow(row: DigestArticleRow): string {
  const badge = row.paywalled
    ? '<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:11px;font-weight:600;color:#92400e;background-color:#fef3c7;border-radius:4px;vertical-align:middle;">Paywalled</span>'
    : "";
  const bandColor = row.relevanceBand === "High" ? "#166534" : "#854d0e";
  const bandBg = row.relevanceBand === "High" ? "#dcfce7" : "#fef9c3";
  const kwText = row.matchedKeywords.length > 0
    ? `Matched: ${row.matchedKeywords.map(escapeHtml).join(", ")}`
    : "";

  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;border-bottom:1px solid #f3f4f6;padding-bottom:20px;">',
    "<tr>",
    "<td>",
    `<a href="${escapeAttr(row.url)}" style="color:#1d4ed8;font-size:17px;font-weight:600;line-height:1.35;text-decoration:none;">${escapeHtml(row.title)}</a>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding-top:8px;">',
    `<span style="font-size:13px;color:#6b7280;">${escapeHtml(row.sourceLabel)} · ${escapeHtml(row.publishedLabel)}</span>`,
    badge,
    `<span style="display:inline-block;margin-left:8px;padding:2px 8px;font-size:12px;font-weight:600;color:${bandColor};background-color:${bandBg};border-radius:999px;">${row.relevanceBand}</span>`,
    renderSentimentBadge(row.sentiment),
    `<span style="font-size:12px;color:#9ca3af;margin-left:6px;">(${row.relevanceScore})</span>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding-top:10px;font-size:15px;line-height:1.55;color:#374151;">',
    formatSummaryHtml(row.summary),
    "</td>",
    "</tr>",
    renderReasonHtml(row.relevanceReason),
    kwText
      ? [
          "<tr>",
          '<td style="padding-top:6px;font-size:12px;color:#9ca3af;line-height:1.4;">',
          kwText,
          "</td>",
          "</tr>",
        ].join("")
      : "",
    "</table>",
  ].join("");
}

function renderSection(section: DigestSection, rowsHtml: string): string {
  return [
    '<h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">',
    escapeHtml(section.entityName),
    "</h2>",
    rowsHtml,
  ].join("");
}

/** Compact row for a keyword match that didn't reach the relevance threshold. */
function renderExcludedArticleRow(row: ExcludedArticleRow): string {
  const badge = row.paywalled
    ? '<span style="display:inline-block;margin-left:6px;padding:1px 5px;font-size:10px;font-weight:600;color:#92400e;background-color:#fef3c7;border-radius:4px;vertical-align:middle;">Paywalled</span>'
    : "";
  const kwText = row.matchedKeywords.length > 0
    ? `Matched: ${row.matchedKeywords.map(escapeHtml).join(", ")}`
    : "";

  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">',
    "<tr>",
    "<td>",
    `<a href="${escapeAttr(row.url)}" style="color:#4b5563;font-size:14px;font-weight:600;line-height:1.35;text-decoration:none;">${escapeHtml(row.title)}</a>`,
    badge,
    renderSentimentBadge(row.sentiment),
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding-top:4px;">',
    `<span style="font-size:12px;color:#9ca3af;">${escapeHtml(row.sourceLabel)} · ${escapeHtml(row.publishedLabel)} · Score: ${row.relevanceScore}</span>`,
    "</td>",
    "</tr>",
    row.relevanceReason
      ? [
          "<tr>",
          '<td style="padding-top:4px;font-size:13px;line-height:1.45;color:#6b7280;">',
          escapeHtml(row.relevanceReason),
          "</td>",
          "</tr>",
        ].join("")
      : "",
    kwText
      ? [
          "<tr>",
          '<td style="padding-top:4px;font-size:12px;color:#9ca3af;line-height:1.4;">',
          kwText,
          "</td>",
          "</tr>",
        ].join("")
      : "",
    "</table>",
  ].join("");
}

/** Grey "Other keyword matches" block listing below-threshold articles. */
function renderExcludedBlock(rows: ExcludedArticleRow[]): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => b.relevanceScore - a.relevanceScore);
  return [
    '<div style="margin:4px 0 24px 0;padding:14px 16px;background-color:#f9fafb;border:1px solid #f3f4f6;border-radius:6px;">',
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#6b7280;">Other keyword matches</p>',
    '<p style="margin:0 0 12px 0;font-size:12px;color:#9ca3af;line-height:1.4;">These articles matched the keywords but scored below the relevance threshold, so they were not included above.</p>',
    sorted.map(renderExcludedArticleRow).join(""),
    "</div>",
  ].join("");
}

/* ------------------------------------------------------------------ */
/*  Admin (aggregated) digest — includes matched keywords + scores     */
/* ------------------------------------------------------------------ */

export type AdminDigestArticleRow = DigestArticleRow & {
  matchedKeywords: string[];
};

export type AdminDigestSection = {
  entityName: string;
  articles: AdminDigestArticleRow[];
  /** Optional: keyword matches that fell below the relevance threshold. */
  excludedArticles?: ExcludedArticleRow[];
};

function renderAdminArticleRow(row: AdminDigestArticleRow): string {
  const badge = row.paywalled
    ? '<span style="display:inline-block;margin-left:6px;padding:2px 6px;font-size:11px;font-weight:600;color:#92400e;background-color:#fef3c7;border-radius:4px;vertical-align:middle;">Paywalled</span>'
    : "";
  const bandColor = row.relevanceBand === "High" ? "#166534" : "#854d0e";
  const bandBg = row.relevanceBand === "High" ? "#dcfce7" : "#fef9c3";
  const kwText = row.matchedKeywords.length > 0
    ? `Matched: ${row.matchedKeywords.map(escapeHtml).join(", ")}`
    : "";

  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;border-bottom:1px solid #f3f4f6;padding-bottom:20px;">',
    "<tr>",
    "<td>",
    `<a href="${escapeAttr(row.url)}" style="color:#1d4ed8;font-size:17px;font-weight:600;line-height:1.35;text-decoration:none;">${escapeHtml(row.title)}</a>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding-top:8px;">',
    `<span style="font-size:13px;color:#6b7280;">${escapeHtml(row.sourceLabel)} · ${escapeHtml(row.publishedLabel)}</span>`,
    badge,
    `<span style="display:inline-block;margin-left:8px;padding:2px 8px;font-size:12px;font-weight:600;color:${bandColor};background-color:${bandBg};border-radius:999px;">${row.relevanceBand}</span>`,
    renderSentimentBadge(row.sentiment),
    `<span style="font-size:12px;color:#9ca3af;margin-left:6px;">Score: ${row.relevanceScore}</span>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding-top:10px;font-size:15px;line-height:1.55;color:#374151;">',
    formatSummaryHtml(row.summary),
    "</td>",
    "</tr>",
    renderReasonHtml(row.relevanceReason),
    kwText
      ? [
          "<tr>",
          '<td style="padding-top:6px;font-size:12px;color:#9ca3af;line-height:1.4;">',
          kwText,
          "</td>",
          "</tr>",
        ].join("")
      : "",
    "</table>",
  ].join("");
}

export function renderAdminDigestHtml(sections: AdminDigestSection[]): string {
  const hasContent = sections.some(
    (s) => s.articles.length > 0 || (s.excludedArticles?.length ?? 0) > 0
  );
  if (!hasContent) {
    return renderEmptyDigestHtml();
  }

  const parts: string[] = [];
  for (const section of sections) {
    const excluded = section.excludedArticles ?? [];
    if (section.articles.length === 0 && excluded.length === 0) continue;
    const rows = section.articles.map(renderAdminArticleRow).join("");
    parts.push(renderSection(section, rows + renderExcludedBlock(excluded)));
  }

  return wrapLayout({
    title: "Daily digest — Admin",
    innerHtml: parts.join(""),
  });
}

/**
 * Render grouped digest sections. Pass empty sections to get the empty-day message.
 */
export function renderDigestHtml(sections: DigestSection[]): string {
  const hasContent = sections.some(
    (s) => s.articles.length > 0 || (s.excludedArticles?.length ?? 0) > 0
  );
  if (!hasContent) {
    return renderEmptyDigestHtml();
  }

  const parts: string[] = [];
  for (const section of sections) {
    const excluded = section.excludedArticles ?? [];
    if (section.articles.length === 0 && excluded.length === 0) continue;
    const rows = section.articles.map(renderArticleRow).join("");
    parts.push(renderSection(section, rows + renderExcludedBlock(excluded)));
  }

  return wrapLayout({
    title: "Daily digest",
    innerHtml: parts.join(""),
  });
}
