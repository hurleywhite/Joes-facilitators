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

Rules:
- Hard constraints (location, language, availability, industry) must be honored. Do not include people who fail a hard constraint.
- If the user says "available" treat anyone "Unavailable" as disqualified. "On Assignment" is allowed only if no Available person fits — and call that out in the summary.
- Prefer specific over generic: a Casablanca-based facilitator beats a "global" one for a Morocco deal.
- Industry/expertise can come from explicit "industries" tags OR the bio text. Cite which.
- Cap matches at 12. If fewer fit cleanly, return fewer — quality beats padding.
- Be honest in the summary if no one matches. Don't pad.`;

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
  const byId = new Map(pool.map((f) => [f.id, f]));
  const matches: ChatMatch[] = [];
  for (const m of input.matches || []) {
    const facilitator = byId.get(m.id);
    if (facilitator) matches.push({ facilitator, reason: m.reason });
  }

  return {
    answer: input.summary || "Here's who I found.",
    matches,
    usedClaude: true,
    total: pool.length,
  };
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
