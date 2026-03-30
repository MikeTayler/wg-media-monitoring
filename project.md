# project.md — Wise Group Media Monitor (PoC)

## What This Project Is

A custom-built media monitoring tool for the Wise Group (New Zealand). It scrapes NZ news sources daily via RSS feeds, uses AI to score articles for relevance against entity-specific keywords, and delivers a daily email digest to subscribers via Mailgun.

This is the **Proof of Concept** — a 2–3 week build to validate the core concept before committing to a full MVP. Keep everything simple, functional, and easy to iterate on. Do not over-engineer.

---

## Tech Stack — Do Not Deviate

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | Next.js 14+ (App Router) | TypeScript throughout |
| Hosting | Vercel | Free tier for PoC |
| AI | OpenRouter API (openrouter.ai) | Routes to Claude Haiku for summaries/scoring. OpenAI-compatible format |
| RSS | rss-parser (npm) | All sources are RSS-based for the PoC |
| Email | Mailgun (mailgun.js) | Existing Wise Group account |
| Scraping | Cheerio + node-fetch | Only if RSS doesn't provide full text |
| Storage | JSON file or in-memory | No database for the PoC. Postgres comes in the MVP |

**Do not introduce new dependencies** without being explicitly asked. Do not suggest alternatives to the above stack.

---

## Project Structure

```
/src
  /app
    /api
      /ingest/route.ts        — Triggers RSS ingestion across all sources
      /digest/route.ts         — Compiles and sends the daily email digest
      /status/route.ts         — Returns system health and last run info
    page.tsx                   — Simple status dashboard
  /lib
    /sources
      stuff.ts                 — Stuff.co.nz RSS parser
      rnz.ts                   — RNZ RSS parser
      scoop.ts                 — Scoop RSS parser
      newstalkzb.ts            — Newstalk ZB RSS parser
      nzherald.ts              — NZ Herald RSS parser (title + summary only)
    /engine
      keywords.ts              — Keyword matching against entity rules
      ai-scorer.ts             — Claude API relevance scoring (0–100)
      summariser.ts            — Claude API summary generation
    /email
      template.ts              — HTML email digest template
      sender.ts                — Mailgun send function
    /types
      index.ts                 — TypeScript interfaces
    config.ts                  — Hardcoded entity/keyword/recipient config
```

Follow this structure. If you need a new file, put it in the most logical existing directory. Do not reorganise or rename existing files unless asked.

---

## Data Model (TypeScript Interfaces)

```typescript
interface Article {
  id: string;                  // Generated UUID
  source: string;              // "stuff" | "rnz" | "scoop" | "newstalkzb" | "nzherald"
  url: string;                 // Unique — used for deduplication
  title: string;
  body: string;                // Full text where available; RSS description for paywalled
  publishedAt: Date;
  ingestedAt: Date;
  paywalled: boolean;          // true for NZ Herald
}

interface Entity {
  id: string;                  // e.g. "leva", "pathways"
  name: string;                // Display name
  aliases: string[];           // Name variants to match on
  keywords: string[];          // Terms that indicate relevance
  recipients: string[];        // Email addresses for digest delivery
}

interface ArticleMatch {
  article: Article;
  entityId: string;
  matchedKeywords: string[];   // Which keywords triggered the match
  relevanceScore: number;      // 0–100 from Claude API
  relevanceReason: string;     // One-sentence explanation from Claude
  summary: string;             // 1–2 sentence AI-generated summary
}
```

---

## PoC News Sources

All sources use RSS feeds. No HTML scraping for the PoC unless a feed doesn't provide enough content.

| Source | RSS Feed | Content Available | Notes |
|--------|----------|-------------------|-------|
| Stuff | `https://www.stuff.co.nz/rss` | Summary / full text when the feed includes it | Atom feed; often summary-only in practice |
| RNZ | `https://www.rnz.co.nz/rss/national.xml` | Description / encoded content when present | The bare `rnz.co.nz/rss` path is an HTML index, not XML — PoC uses the national headlines XML feed |
| Scoop | `https://www.scoop.co.nz/rss` | Full text | Press releases and news. **May need a different feed URL or User-Agent** to work reliably — some environments return WAF challenges or non-XML responses |
| Newstalk ZB | `https://www.newstalkzb.co.nz/rss` | Near-full text | Articles, not audio transcripts |
| NZ Herald | `https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/nz/?outputType=xml&_website=nzh` | **Title + summary only** | Paywalled. Flag with `paywalled: true`. The bare `nzherald.co.nz/rss` path is an HTML listing — PoC uses NZ Herald’s Arc outbound RSS (NZ section) |

**Important:** RSS feed URLs may need verification at build time. If a URL returns a 404 or empty feed, check the source website for the current feed location before asking for help.

---

## Entity Configuration (Hardcoded for PoC)

Entities and keywords are defined in `/lib/config.ts` as a static array. No database, no admin UI. This will be replaced with database-backed config in the MVP.

Five entities participate in the PoC. There is also a "global" entity for sector-wide topics that all recipients should see.

Placeholder keywords (to be replaced with confirmed participant input):

- **Le Va** — Le Va, suicide prevention, Pacific mental health, Pasifika wellbeing
- **Pathways** — Pathways, mental health services, community support, disability support
- **LinkPeople** — LinkPeople, Link People, employment services, disability employment
- **Te Pou** — Te Pou, Blueprint for Learning, Mental Health First Aid, MHFA, Riana Manuel
- **Just a thought** — Just a thought, online therapy, iCBT, digital mental health
- **Global (all recipients)** — Wise Group, Matt Doocey, mental health policy, Mental Health Act

---

## AI Integration Rules

- **Provider:** OpenRouter (openrouter.ai). Uses an OpenAI-compatible API format.
- **Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`
- **Auth header:** `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Model:** Use `anthropic/claude-haiku-4-5-20251001` for all PoC tasks (scoring and summaries). It's fast and cheap.
- **Response format:** OpenAI-compatible — access content via `data.choices[0].message.content`
- **API key:** Always use the `OPENROUTER_API_KEY` environment variable. Never hardcode.
- **Two-step filtering:** Run keyword matching first (free, instant). Only send keyword-matched articles to the API for scoring. Do not send every ingested article to the API.
- **Relevance scoring:** Ask the model to rate 0–100 with a one-sentence reason. Articles below 40 are discarded.
- **Summaries:** 1–2 sentences, factual and neutral. No editorialising. For paywalled articles (NZ Herald), summarise from the RSS title and description only.
- **System prompt context:** Always include that this is a NZ media monitoring tool for the Wise Group, a social services organisation. Articles about mental health, disability, social services, housing, employment, and government policy in these areas are likely relevant.
- **Error handling:** Wrap all API calls in try/catch. If a call fails, log the error and continue — do not crash the pipeline. Assign a default score of 50 to articles that fail scoring.
- **Cost awareness:** Log token usage. Check openrouter.ai/activity for costs. If a single ingestion run costs more than $1 USD, flag it.

---

## Email Digest Rules

- **One email per recipient** containing only the entities they're subscribed to.
- **Group articles by entity** within the email.
- **Sort by relevance score** (highest first) within each entity section.
- **Each article shows:** headline (linked to source URL), source name, relevance indicator (High/Medium), AI summary.
- **NZ Herald articles:** show a "Paywalled" badge next to the source name.
- **Empty days:** If no articles matched, send a short email saying "No relevant coverage found today" rather than sending nothing.
- **Use inline CSS** — email clients don't support external stylesheets.
- **Mobile-responsive** — the email must be readable on a phone.
- **Dry run mode:** The `/api/digest` route must accept `?dry_run=true` to preview the email HTML without sending.

---

## Environment Variables

```
OPENROUTER_API_KEY=sk-or-...
MAILGUN_API_KEY=key-...
MAILGUN_DOMAIN=mg.wisegroup.co.nz
MAILGUN_FROM=Media Monitor <digest@mg.wisegroup.co.nz>
CRON_SECRET=<random-string>
```

Never commit `.env.local`. A `.env.local.example` file with placeholder values must exist in the repo root.

---

## Cron Schedule (Vercel)

- **Ingestion:** Every 2 hours between 5am–10pm NZST (adjust UTC offset for current daylight saving).
- **Digest:** Once daily at 6:30am NZST.
- Both routes must validate `CRON_SECRET` and return 401 if it doesn't match.

---

## Coding Conventions

- TypeScript strict mode. No `any` types unless genuinely unavoidable.
- Async/await over raw promises.
- Descriptive variable names. No single-letter variables except loop counters.
- Error handling on all external calls (RSS fetches, API calls, email sends).
- Console.log for PoC-level logging — no need for a logging framework yet.
- If one source fails during ingestion, continue with the others. Never let a single failure crash the run.
- Keep functions focused and single-purpose. If a function exceeds ~50 lines, consider splitting it.

---

## What NOT to Build (PoC Scope Boundaries)

Do not build any of the following unless explicitly asked:

- Admin dashboard or UI for managing entities/keywords/recipients
- Database (Postgres, Supabase, etc.) — use JSON file or in-memory storage
- User authentication or login
- Historical search or digest archive
- Social media monitoring
- Hansard/parliamentary monitoring
- Radio transcription
- Sentiment analysis
- Real-time alerting (Slack, Teams, push notifications)
- Full-text extraction from paywalled sources
- Analytics or reporting dashboards
- CI/CD pipeline configuration beyond Vercel's built-in Git deploy

If you think something outside this scope would improve the PoC, mention it as a comment but do not implement it.

---

## NZ-Specific Context

- **Timezone:** NZST is UTC+12 (standard) or NZDT UTC+13 (daylight saving, late September to early April). Cron expressions must account for the current offset.
- **Macrons:** Te reo Māori words use macrons (ā, ē, ī, ō, ū). Handle UTF-8 correctly throughout. Do not strip or normalise macrons.
- **Wise Group entities:** Le Va, Pathways, LinkPeople, Te Pou, Just a thought. These are separate organisations under the Wise Group umbrella, each with their own focus area and media interests.
- **Minister for Mental Health:** Matt Doocey — a key figure for sector monitoring.
- **Media landscape:** NZ has a small media market. Stuff and NZ Herald are the two dominant online news sources. RNZ is the public broadcaster. Scoop publishes press releases. Newstalk ZB is talk radio with an online article presence.
