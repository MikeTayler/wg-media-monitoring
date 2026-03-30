/**
 * Hardcoded PoC configuration (entities, aliases, keywords, recipients).
 * Replace or extend entries with confirmed participant input — see `project.md`.
 * No admin UI; edit and redeploy for PoC changes.
 */

import type { Entity } from "@/lib/types";

/**
 * `global` has sector-wide terms; `recipients` is empty — digest delivery should
 * treat this bucket as “all participants” (wired in the digest step).
 */
export const entities: Entity[] = [
  {
    id: "leva",
    name: "Le Va",
    aliases: ["Le Va"],
    recipients: ["kirsten.brown@leva.co.nz"],
    keywords: [
      "Le Va",
      "suicide prevention",
      "Pacific mental health",
      "Pasifika wellbeing",
    ],
  },
  {
    id: "pathways",
    name: "Pathways",
    aliases: ["Pathways"],
    recipients: ["kelly.moran@pathways.co.nz"],
    keywords: [
      "Pathways",
      "mental health services",
      "community support",
      "disability support",
    ],
  },
  {
    id: "linkpeople",
    name: "LinkPeople",
    aliases: ["LinkPeople", "Link People"],
    recipients: ["alerts@linkpeople.co.nz"],
    keywords: [
      "LinkPeople",
      "Link People",
      "employment services",
      "disability employment",
    ],
  },
  {
    id: "tepou",
    name: "Te Pou",
    aliases: ["Te Pou"],
    recipients: ["alerts@tepou.co.nz"],
    keywords: [
      "Te Pou",
      "Blueprint for Learning",
      "Mental Health First Aid",
      "MHFA",
      "Riana Manuel",
    ],
  },
  {
    id: "justathought",
    name: "Just a thought",
    aliases: ["Just a thought"],
    recipients: ["alerts@justathought.org.nz"],
    keywords: [
      "Just a thought",
      "online therapy",
      "iCBT",
      "digital mental health",
    ],
  },
  {
    id: "global",
    name: "Global (all recipients)",
    aliases: ["Wise Group"],
    recipients: [],
    keywords: [
      "Wise Group",
      "Matt Doocey",
      "mental health policy",
      "Mental Health Act",
      "social services",
      "disability support",
      "housing",
      "employment",
    ],
  },
];
