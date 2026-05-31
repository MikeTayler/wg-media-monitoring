/**
 * Throwaway: preview digest HTML in a browser.
 *
 *   npx tsx src/lib/email/__test__/template-preview.ts
 *
 * Opens: file:///tmp/digest-preview.html (after run)
 */

import { writeFile } from "fs/promises";
import {
  renderDigestHtml,
  type DigestSection,
} from "@/lib/email/template";

const sections: DigestSection[] = [
  {
    entityName: "Le Va",
    articles: [
      {
        title:
          "Pacific providers welcome new suicide prevention funding in Budget estimates",
        url: "https://www.stuff.co.nz/example/le-va-funding",
        sourceLabel: "Stuff",
        publishedLabel: "30 Apr 2026",
        paywalled: false,
        relevanceBand: "High",
        relevanceScore: 88,
        summary:
          "Community health leaders said the funding would support early intervention programmes across Auckland and Wellington. The article notes ongoing workforce shortages in Pacific mental health services.",
        matchedKeywords: ["Le Va", "suicide prevention", "Pacific"],
        relevanceReason: "Directly names Le Va and its suicide-prevention work.",
        sentiment: "positive",
      },
      {
        title:
          "Pasifika wellbeing hui draws hundreds as families discuss youth mental health",
        url: "https://www.rnz.co.nz/news/example-pasifika-hui",
        sourceLabel: "RNZ",
        publishedLabel: "29 Apr 2026",
        paywalled: false,
        relevanceBand: "Medium",
        relevanceScore: 62,
        summary:
          "Organisers described strong turnout at a two-day forum focused on culturally led care. Ministers were invited but did not speak on the record.",
        matchedKeywords: ["Pasifika", "youth mental health"],
        relevanceReason: "Covers Pasifika youth mental health themes relevant to Le Va.",
        sentiment: "neutral",
      },
    ],
  },
  {
    entityName: "Pathways",
    articles: [
      {
        title:
          "Disability support providers say community contracts need clearer KPIs",
        url: "https://www.newstalkzb.co.nz/example-disability-kpis",
        sourceLabel: "Newstalk ZB",
        publishedLabel: "28 Apr 2026",
        paywalled: false,
        relevanceBand: "High",
        relevanceScore: 76,
        summary:
          "Advocates argued that national contracts should recognise travel time and coordination across rural networks. The Ministry of Health said a review is scheduled for later in the year.",
        matchedKeywords: ["Pathways", "disability support"],
        relevanceReason: "Discusses disability support contracts central to Pathways' work.",
        sentiment: "negative",
      },
    ],
  },
  {
    entityName: "Wise Group",
    articles: [
      {
        title:
          "Minister flags Mental Health Act review timeline after sector submissions",
        url: "https://www.nzherald.co.nz/nz/example-mha-review",
        sourceLabel: "NZ Herald",
        publishedLabel: "30 Apr 2026",
        paywalled: true,
        relevanceBand: "Medium",
        relevanceScore: 55,
        summary:
          "The Minister told reporters that officials are analysing submissions on compulsory treatment criteria. Full article text is not available outside the paywall; this summary is based on the RSS headline and description only.",
        matchedKeywords: ["Mental Health Act", "Wise Group"],
        relevanceReason: "Sector-wide Mental Health Act review affects Wise Group entities.",
        sentiment: "neutral",
      },
      {
        title:
          "Wise Group subsidiary announces partnership with iwi on housing support pilot",
        url: "https://www.scoop.co.nz/stories/example-wise-group",
        sourceLabel: "Scoop",
        publishedLabel: "27 Apr 2026",
        paywalled: false,
        relevanceBand: "High",
        relevanceScore: 82,
        summary:
          "The pilot will combine housing navigation with peer support in three regions. Funding is drawn from the existing social services budget.",
        matchedKeywords: ["Wise Group", "housing support"],
        relevanceReason: "Announces a Wise Group subsidiary housing pilot.",
        sentiment: "positive",
      },
    ],
  },
  {
    entityName: "Te Pou",
    articles: [
      {
        title:
          "Workplace Mental Health First Aid courses report record enrolments",
        url: "https://www.stuff.co.nz/example-mhfa-enrolments",
        sourceLabel: "Stuff",
        publishedLabel: "26 Apr 2026",
        paywalled: false,
        relevanceBand: "Medium",
        relevanceScore: 68,
        summary:
          "Training providers said demand from schools and NGOs has doubled year on year. The story notes Te Pou’s role in accrediting course materials.",
        matchedKeywords: ["Te Pou", "Mental Health First Aid"],
        relevanceReason: "Notes Te Pou's role accrediting Mental Health First Aid courses.",
        sentiment: "neutral",
      },
    ],
  },
];

async function main(): Promise<void> {
  const html = renderDigestHtml(sections);
  const outPath = "/tmp/digest-preview.html";
  await writeFile(outPath, html, "utf8");
  console.log(`Wrote ${outPath} (${html.length} bytes)`);
  console.log(`Open: file://${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
