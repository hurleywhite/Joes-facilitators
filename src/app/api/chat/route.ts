import { NextResponse } from "next/server";
import { Facilitator } from "@/types/facilitator";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { mergeIndustries } from "@/lib/industry-parser";
import { callToolModel, hasLLM } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Natural-language facilitator finder.
 *
 * Two modes:
 *   1. ANTHROPIC_API_KEY set → Claude reads the question + a compact
 *      facilitator dossier and returns ranked matches with a written
 *      explanation.
 *   2. No key → keyword scoring over location, focus, languages, industries,
 *      and bio. The UI works the same; the answer is shorter.
 *
 * The route always returns:
 *   { answer: string, matches: ChatMatch[], usedClaude: boolean, total: number }
 */

type ChatMatch = {
  facilitator: Facilitator;
  reason: string;
};

type ChatResponse = {
  answer: string;
  matches: ChatMatch[];
  usedClaude: boolean;
  total: number;
};

/**
 * One turn of the prior conversation. Sent from the chat UI so the
 * model has memory across follow-up questions ("how about around
 * tech?" only makes sense if the model remembers we were just talking
 * about APAC exec workshops).
 */
type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      message?: string;
      history?: ChatHistoryTurn[];
    };
    const message = (body.message || "").trim();
    const history = (body.history || []).filter(
      (t) => t && (t.role === "user" || t.role === "assistant") && t.content
    );
    if (!message) {
      return NextResponse.json({
        answer: "Ask me something like: 'who's available in Europe with healthcare experience?'",
        matches: [],
        usedClaude: false,
        total: 0,
      } satisfies ChatResponse);
    }

    const pool = await loadPool();

    if (hasLLM()) {
      return NextResponse.json(await answerWithLLM(message, pool, history));
    }
    return NextResponse.json(answerWithHeuristic(message, pool));
  } catch (err) {
    return NextResponse.json(
      {
        answer: `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`,
        matches: [],
        usedClaude: false,
        total: 0,
      } satisfies ChatResponse,
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/* Pool loading                                                        */
/* ------------------------------------------------------------------ */

async function loadPool(): Promise<Facilitator[]> {
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  let pool: Facilitator[] = [];
  if (sheetUrl) {
    try {
      pool = await fetchFromGoogleSheet(toGoogleSheetCsvUrl(sheetUrl));
    } catch {
      pool = dummyFacilitators;
    }
  } else {
    pool = dummyFacilitators;
  }

  // Make sure industries are populated even on the dummy path (the sheet
  // parser already merges; this catches the rest).
  return pool.map((f) => ({
    ...f,
    industryExperience: mergeIndustries(f.industryExperience || [], f.bio || ""),
  }));
}

/* ------------------------------------------------------------------ */
/* LLM path (OpenAI or Anthropic via lib/llm helper)                   */
/* ------------------------------------------------------------------ */

async function answerWithLLM(
  message: string,
  pool: Facilitator[],
  history: ChatHistoryTurn[] = []
): Promise<ChatResponse> {
  // Compact dossier — the model doesn't need every field.
  const dossier = pool.map((f) => ({
    id: f.id,
    name: f.name,
    location: f.location,
    region: f.region,
    focus: f.focus || "Unspecified",
    experienceLevel: f.experienceLevel,
    availability: f.availability,
    languages: f.languages,
    industries: f.industryExperience,
    pastCompanies: f.pastCompanies || [],
    pastRoles: f.pastRoles || [],
    // Self-service availability windows (from /availability form). Lets
    // Claude answer "who's available in October" or "who's free for a
    // Q3 engagement" via direct date arithmetic on these ranges.
    availableWindows: f.availableWindows || [],
    willingToTravel: f.willingToTravel || "unspecified",
    bio: f.bio,
  }));

  const tools = [
    {
      name: "return_matches",
      description:
        "Return the ranked list of facilitator IDs that best match the user's request, with a one-line reason for each, plus a 1-3 sentence summary answer.",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "1-3 sentence plain-English answer addressing the user. State how many people fit and call out anything notable (e.g. 'Only one person in Morocco — but two more across MEA could travel').",
          },
          matches: {
            type: "array",
            description:
              "Ranked best-fit first. Empty array if nothing fits — explain in summary.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                reason: {
                  type: "string",
                  description:
                    "One short line citing the specific qualifier(s) that made them match (e.g. 'Available, based in Casablanca, healthcare bio mention').",
                },
              },
              required: ["id", "reason"],
            },
          },
        },
        required: ["summary", "matches"],
      },
    },
  ];

  const systemPrompt = `You help match facilitators to client engagements for an AI training company.

Given a free-form question and the full pool dossier (JSON), pick the best-fit people and call return_matches once.

# HARD CONSTRAINT RULES — VIOLATING THESE IS A BUG

A "hard constraint" is anything the user asks for explicitly: a specific language, country, city, industry, focus, availability state, etc.

1. **A facilitator only satisfies a hard constraint if the constraint's value appears LITERALLY in their dossier fields.** Examples:
   - "Korean-speaking" → \`languages\` must contain "Korean" (case-insensitive substring). Living in Asia, speaking Malay, or being "Asia-Pacific" does NOT qualify.
   - "English-speaking" → \`languages\` must contain "English". An EMPTY \`languages: []\` array means UNKNOWN — do NOT assume English just because they're in the US/Americas, or because their bio is written in English, or because of their name. Unknown is not a match.
   - "based in Japan" → \`location\`/\`region\`/\`city\` must mention Japan. Being elsewhere in Asia-Pacific does NOT qualify.
   - "healthcare experience" → \`industries\` must list it OR \`bio\` must mention it. "Generally experienced" does NOT qualify.

   **Empty arrays mean unknown, not "default value".** \`languages: []\`, \`industries: []\`, \`pastCompanies: []\` all mean we don't have that data — they NEVER satisfy a hard constraint on that field.

2. **NEVER substitute proximity for the literal constraint.** A Malaysian for Korean. A Brazilian for Spanish. An "APAC" person for Japan. None of these are valid matches. Regional similarity is not the same as the constraint.

3. **NEVER include a facilitator with a hedge in the reason.** If you would have to write "cannot confirm", "may speak", "possibly", "no explicit X listed but…", or "however…" — that person does NOT match. Leave them out.

4. **If ZERO facilitators satisfy the literal constraint, return an empty matches array.** Say so plainly in the summary: "No facilitator in the pool lists Korean among their languages." Do not suggest a runner-up. Do not list someone "as the closest". An honest "no match" is the correct answer.

5. **Available vs Unavailable:** "Unavailable" is disqualified when the user asks for available people. "On Assignment" is allowed only as a fallback if no Available person fits — and you must say so in the summary.

# RANKING WITHIN THE QUALIFIED SET

Among facilitators who pass every hard constraint:
- Prefer specific over generic: a Casablanca-based facilitator beats a "global" one for a Morocco deal.
- Industry/expertise can come from explicit \`industries\` tags OR the \`bio\` text. Cite which.
- Cap matches at 12. Quality beats padding — return fewer if fewer fit cleanly.

# REASON FIELD FORMAT

Each match's \`reason\` must be a single short factual line stating WHICH dossier fields satisfy WHICH constraint. Examples:
- ✓ "languages: ['Korean', 'English']; based in Seoul; healthcare in industries"
- ✗ "Strong APAC presence; might know Korean"  (hedging — not allowed)
- ✗ "Closest match given the pool"  (admits they don't actually match — leave them out instead)

If the reason needs the words "however", "but", "though", "cannot confirm", or "no explicit" — delete the match.`;

  const llm = await callToolModel({
    system: systemPrompt,
    messages: buildMessages_(message, dossier, history),
    tools,
    toolChoice: "return_matches",
    maxTokens: 2000,
  });

  const toolCall = llm.toolCalls.find((c) => c.name === "return_matches");
  if (!toolCall) {
    return {
      answer:
        "I didn't get a structured answer back from the model. Try rephrasing the question.",
      matches: [],
      usedClaude: true,
      total: pool.length,
    };
  }

  const input = toolCall.input as {
    summary?: string;
    matches?: { id: string; reason: string }[];
  };
  // Detect language + industry constraints from the user's question so we can
  // validate every returned match against the dossier deterministically.
  const requiredLanguages = detectLanguageConstraints_(message);
  const requiredIndustries = detectIndustryConstraints_(message);
  const requiredRegion = detectRegionConstraint_(message);
  const requiresAvailable = /\bavailable\b/i.test(message) && !/not\s+available/i.test(message);

  const byId = new Map(pool.map((f) => [f.id, f]));
  const matches: ChatMatch[] = [];
  let droppedHedged = 0;
  let droppedLanguage = 0;
  let droppedIndustry = 0;
  let droppedRegion = 0;
  let droppedAvailability = 0;
  for (const m of input.matches || []) {
    const facilitator = byId.get(m.id);
    if (!facilitator) continue;
    // Safety net 1: if the model admits in its own reason that the person
    // doesn't actually satisfy a constraint (hedge words, negation), drop
    // the match.
    if (reasonIsHedged_(m.reason)) {
      droppedHedged++;
      continue;
    }
    // Safety net 2: deterministic language verification.
    if (requiredLanguages.length > 0) {
      const have = (facilitator.languages || []).map((l) => l.toLowerCase());
      const allSatisfied = requiredLanguages.every((req) =>
        have.some((h) => h.includes(req) || req.includes(h))
      );
      if (!allSatisfied) {
        droppedLanguage++;
        continue;
      }
    }
    // Safety net 3: industry must appear in industries array OR bio.
    if (requiredIndustries.length > 0) {
      const haveTags = (facilitator.industryExperience || []).map((i) => i.toLowerCase());
      const bioLower = (facilitator.bio || "").toLowerCase();
      const allSatisfied = requiredIndustries.every((req) => {
        const aliases = INDUSTRY_ALIASES[req] || [req];
        return aliases.some(
          (a) => haveTags.some((t) => t.includes(a)) || bioLower.includes(a)
        );
      });
      if (!allSatisfied) {
        droppedIndustry++;
        continue;
      }
    }
    // Safety net 4: region must match if user named one.
    if (requiredRegion && facilitator.region !== requiredRegion) {
      droppedRegion++;
      continue;
    }
    // Safety net 5: availability must be "Available" if user asked for it.
    if (requiresAvailable && facilitator.availability !== "Available") {
      droppedAvailability++;
      continue;
    }
    matches.push({ facilitator, reason: m.reason });
  }

  let answer = input.summary || "Here's who I found.";
  const totalDropped =
    droppedHedged + droppedLanguage + droppedIndustry + droppedRegion + droppedAvailability;
  if (totalDropped > 0 && matches.length === 0) {
    const reasons: string[] = [];
    if (droppedLanguage > 0 && requiredLanguages.length > 0) {
      reasons.push(`no facilitator's dossier lists ${requiredLanguages.join(" / ")}`);
    }
    if (droppedIndustry > 0 && requiredIndustries.length > 0) {
      reasons.push(`no facilitator has ${requiredIndustries.join(" / ")} in industries or bio`);
    }
    if (droppedRegion > 0 && requiredRegion) {
      reasons.push(`no facilitator is in ${requiredRegion}`);
    }
    if (droppedAvailability > 0) {
      reasons.push("no facilitator is currently Available");
    }
    const detail = reasons.length > 0 ? ` Specifically: ${reasons.join("; ")}.` : "";
    answer = `${answer} (${totalDropped} candidate${totalDropped === 1 ? "" : "s"} filtered out for not meeting the explicit request.${detail})`;
  }

  return {
    answer,
    matches,
    usedClaude: true,
    total: pool.length,
  };
}

/**
 * Map of canonical industry slug → list of substring aliases that count
 * as matches when checking facilitator.industryExperience or bio text.
 * The slug is what we report in error messages; the aliases are what we
 * actually match against (lowercase, substring-style).
 */
const INDUSTRY_ALIASES: Record<string, string[]> = {
  healthcare: ["healthcare", "health care", "medical", "hospital", "clinical", "patient", "life sciences", "digital health", "health-tech", "healthtech"],
  pharma: ["pharma", "pharmaceutical", "drug discovery", "drug development", "therapeutic"],
  "financial services": ["financial services", "fintech", "banking", "bank", "capital markets", "wealth management", "investment", "trading", "payments", "credit", "hedge fund"],
  insurance: ["insurance", "insurer", "reinsurance"],
  technology: ["technology", "tech industry", "tech company", "tech companies", "software", "silicon valley", "tech startup"],
  saas: ["saas", "software as a service", "b2b software"],
  retail: ["retail", "retailer", "d2c"],
  "e-commerce": ["e-commerce", "ecommerce", "online retail", "dtc", "marketplace"],
  "consumer goods": ["consumer goods", "cpg", "fmcg"],
  manufacturing: ["manufacturing", "manufacturer", "industrial", "factory", "supply chain"],
  automotive: ["automotive", "auto industry", "vehicle", "car industry", "mobility"],
  energy: ["energy sector", "energy industry", "oil & gas", "oil and gas", "renewable", "utility", "clean energy"],
  education: ["education", "edtech", "academic", "university", "school", "faculty", "professor", "teaching", "curriculum"],
  government: ["government", "public sector", "civic", "policy", "govt", "military", "federal", "air force", "department of"],
  media: ["media", "publishing", "entertainment", "broadcast", "podcast", "streaming"],
  marketing: ["marketing", "advertising", "branding", "agency"],
  legal: ["legal", "law firm", "attorney", "compliance"],
  "real estate": ["real estate", "property", "proptech"],
  telecom: ["telecom", "telecommunications", "mobile operator"],
  logistics: ["logistics", "shipping", "freight", "warehouse"],
  "travel & hospitality": ["travel", "hospitality", "airline", "hotel", "cruise"],
  "non-profit": ["non-profit", "nonprofit", "ngo", "charity", "foundation"],
  enterprise: ["enterprise", "fortune 500", "fortune 100", "large enterprise"],
  startups: ["startup", "venture backed", "vc-backed", "early-stage", "founder"],
  cloud: ["cloud", "aws", "azure", "gcp", "google cloud"],
  ai: ["ai", "artificial intelligence", "machine learning", "ml", "genai", "llm"],
};

/**
 * Detect industry constraints from the user's question. Returns a list of
 * canonical industry slugs that any returned match MUST satisfy (via the
 * alias map). Conservative — triggers on the slug name appearing in the
 * question. Avoids triggering on incidental mentions ("retail therapy") by
 * keying off the canonical slugs and a few high-precision aliases.
 */
function detectIndustryConstraints_(message: string): string[] {
  const text = message.toLowerCase();
  const found = new Set<string>();
  for (const slug of Object.keys(INDUSTRY_ALIASES)) {
    // Match the slug as a whole word/phrase, OR any of its short aliases
    // that we trust as a strong constraint signal.
    const triggers = [slug, ...INDUSTRY_ALIASES[slug].slice(0, 3)];
    for (const t of triggers) {
      const re = new RegExp(`\\b${escapeForRegex_(t)}\\b`, "i");
      if (re.test(text)) {
        found.add(slug);
        break;
      }
    }
  }
  return Array.from(found);
}

function escapeForRegex_(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect a single region constraint from the user's question.
 */
function detectRegionConstraint_(message: string): string | null {
  const lower = message.toLowerCase();
  // Order matters — check more-specific aliases first.
  if (/\b(americas?|usa?|u\.s\.|united states|canada|mexico|brazil|south america|north america)\b/i.test(lower)) {
    return "Americas";
  }
  if (/\b(europe|eu|uk|united kingdom|britain|german|france|spain|italy|nordic|scandinavia)/i.test(lower)) {
    return "Europe";
  }
  if (/\b(asia[-\s]?pacific|apac|asia|india|japan|china|korea|singapore|australia|new zealand|southeast asia)\b/i.test(lower)) {
    return "Asia-Pacific";
  }
  if (/\b(middle east|mea|africa|gulf|gcc|uae|saudi|dubai|qatar|nigeria|kenya|south africa)\b/i.test(lower)) {
    return "Middle East & Africa";
  }
  return null;
}

/**
 * Detect language-name constraints in the user's question. Returns a list
 * of lowercased language names that any returned match MUST have in their
 * `languages` array. Conservative — only triggers on well-known language
 * names paired with a "speak"/"speaking"/"speaks" verb, OR with explicit
 * questions like "any Korean facilitators".
 */
function detectLanguageConstraints_(message: string): string[] {
  const text = message.toLowerCase();
  const LANGUAGES = [
    "english","spanish","french","german","italian","portuguese","dutch",
    "swedish","norwegian","danish","finnish","polish","russian","ukrainian",
    "greek","turkish","romanian","czech","hungarian","arabic","hebrew",
    "farsi","persian","urdu","hindi","bengali","tamil","telugu","malayalam",
    "mandarin","chinese","cantonese","japanese","korean","vietnamese","thai",
    "indonesian","malay","tagalog","filipino","swahili",
  ];
  const found: string[] = [];
  for (const lang of LANGUAGES) {
    // Only treat as a hard constraint when the question is plausibly asking
    // for that language as a skill. Match \blang\b in contexts like
    // "korean-speaking", "speaks korean", "korean facilitator", "in korean".
    const re = new RegExp(
      `\\b${lang}(?:[- ]?(?:speaking|speaker|speakers|language))?\\b`,
      "i"
    );
    if (re.test(text)) {
      // Skip very generic "english"/"chinese" mentions that may not be a hard
      // constraint (e.g. "english version of the workshop"). Require either
      // the speaking-verb context, or the language word being the main subject.
      const requires =
        /speak|speaking|speaker|fluent|language|tongue/i.test(text) ||
        new RegExp(`\\b${lang}[- ]?(facilitator|trainer|workshop)`, "i").test(text) ||
        new RegExp(`\\b(any|find|need|looking for|who) ${lang}\\b`, "i").test(text);
      if (requires) found.push(lang);
    }
  }
  return found;
}

/**
 * Returns true if the model's match reason contains a phrase that admits
 * the facilitator doesn't actually satisfy the constraint. Defense in depth
 * against the failure mode where the model writes a hedge/negation in the
 * reason but still includes the person in the matches array.
 */
function reasonIsHedged_(reason: string): boolean {
  const lower = (reason || "").toLowerCase();
  const phrases = [
    "cannot confirm",
    "can't confirm",
    "no explicit",
    "not listed",
    "not confirmed",
    "not explicitly",
    "languages empty",
    "language is empty",
    "no language",
    "however",
    "though ",
    "but no",
    "but doesn",
    "but does not",
    "may speak",
    "might speak",
    "possibly",
    "likely speaks",
    "presumably",
    "could be",
    "closest match",
    "only candidate",
    "as a fallback",
    "fallback option",
    "no direct match",
    "not in the pool",
    "no facilitator",
    "regional proximity",
    "not based in",
  ];
  return phrases.some((p) => lower.includes(p));
}

/**
 * Compose the messages array sent to Claude. We:
 *   1. Replay prior turns so the model remembers the thread.
 *   2. Embed the current dossier with the LATEST user question, so
 *      the model only ever scans one (large) JSON dump per request.
 *   3. Cap history at the last 8 turns to keep the request small —
 *      anything older than ~4 exchanges is rarely relevant for "find
 *      a facilitator" follow-ups.
 */
function buildMessages_(
  message: string,
  dossier: unknown,
  history: ChatHistoryTurn[]
): Array<{ role: "user" | "assistant"; content: string }> {
  const recent = history.slice(-8);
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const t of recent) {
    out.push({ role: t.role, content: t.content });
  }
  out.push({
    role: "user",
    content: `Question: ${message}\n\nFacilitator pool (JSON):\n${JSON.stringify(dossier)}`,
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Heuristic path (no API key)                                         */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "with", "in", "on", "at", "to", "of",
  "is", "we", "have", "has", "who", "where", "what", "need", "needs",
  "someone", "people", "find", "available", "any", "i", "want", "looking",
]);

const FOCUS_WORDS: Record<string, "Facilitation" | "Tech" | "Both"> = {
  facilitation: "Facilitation",
  facilitator: "Facilitation",
  workshop: "Facilitation",
  technical: "Tech",
  tech: "Tech",
  engineer: "Tech",
  developer: "Tech",
};

const REGION_WORDS: Record<string, string> = {
  americas: "Americas",
  america: "Americas",
  usa: "Americas",
  us: "Americas",
  canada: "Americas",
  europe: "Europe",
  european: "Europe",
  uk: "Europe",
  asia: "Asia-Pacific",
  apac: "Asia-Pacific",
  india: "Asia-Pacific",
  australia: "Asia-Pacific",
  middle: "Middle East & Africa",
  east: "Middle East & Africa",
  africa: "Middle East & Africa",
  mea: "Middle East & Africa",
  morocco: "Middle East & Africa",
  uae: "Middle East & Africa",
  dubai: "Middle East & Africa",
  bahrain: "Middle East & Africa",
};

function answerWithHeuristic(
  message: string,
  pool: Facilitator[]
): ChatResponse {
  const lower = message.toLowerCase();
  const tokens = lower
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));

  // Detect intent signals
  const wantsAvailableOnly = /\bavailable\b/.test(lower);
  const focusHit = tokens
    .map((t) => FOCUS_WORDS[t])
    .find(Boolean);
  const regionHit = tokens
    .map((t) => REGION_WORDS[t])
    .find(Boolean);

  const scored = pool.map((f) => {
    const reasons: string[] = [];
    let score = 0;

    if (wantsAvailableOnly && f.availability === "Unavailable") {
      return { f, score: -1, reasons };
    }

    if (f.availability === "Available") {
      score += 30;
      reasons.push("available");
    } else if (f.availability === "On Assignment") {
      score += 5;
    }

    if (focusHit && f.focus === focusHit) {
      score += 25;
      reasons.push(`${focusHit.toLowerCase()} focus`);
    }

    if (regionHit && f.region === regionHit) {
      score += 25;
      reasons.push(`in ${f.region}`);
    }

    // Token matching against location, languages, industries, past
    // companies/roles, and bio. The past companies/roles list is what
    // catches "ex-AWS" or "former CMO" style queries.
    const haystack = [
      f.location,
      f.country,
      f.city,
      ...(f.languages || []),
      ...(f.industryExperience || []),
      ...(f.pastCompanies || []),
      ...(f.pastRoles || []),
      f.bio,
    ]
      .join(" ")
      .toLowerCase();

    const matchedKeywords: string[] = [];
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (FOCUS_WORDS[t] || REGION_WORDS[t]) continue;
      if (haystack.includes(t)) {
        score += 10;
        matchedKeywords.push(t);
      }
    }
    if (matchedKeywords.length > 0) {
      reasons.push(`mentions ${matchedKeywords.slice(0, 3).join(", ")}`);
    }

    if (f.experienceLevel === "High") score += 5;

    return { f, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const positives = scored.filter((s) => s.score > 0);
  const top = positives.slice(0, 12);

  const matches: ChatMatch[] = top.map((s) => ({
    facilitator: s.f,
    reason: s.reasons.length > 0 ? s.reasons.join(", ") : "Best-effort match",
  }));

  let answer: string;
  if (matches.length === 0) {
    answer = `I didn't find a clear match across ${pool.length} facilitators. Try adding more detail (industry, language, region, or skill).`;
  } else {
    const bits: string[] = [];
    if (regionHit) bits.push(`in ${regionHit}`);
    if (focusHit) bits.push(`${focusHit} focus`);
    if (wantsAvailableOnly) bits.push("currently available");
    const tail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
    answer = `Found ${matches.length} match${matches.length !== 1 ? "es" : ""}${tail}.`;
  }

  return {
    answer,
    matches,
    usedClaude: false,
    total: pool.length,
  };
}
