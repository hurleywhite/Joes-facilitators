import { Facilitator, Engagement } from "@/types/facilitator";

/**
 * Result of extracting structured data from a single transcript.
 *
 * EVERY field that is non-null MUST have a corresponding entry in `evidence`
 * that contains the verbatim transcript quote justifying the value. The
 * extract endpoint enforces this — fields without evidence are dropped.
 *
 * If the model can't find a fact in the transcript, it returns null. We never
 * invent or infer values: that's the anti-hallucination contract.
 */
export interface TranscriptExtraction {
  // Who is this transcript about?
  facilitatorName: string | null;
  matchConfidence: "high" | "medium" | "low" | "none";
  matchReason: string;

  // Extracted field updates (any may be null)
  availability: string | null;
  currentEngagement: string | null;
  location: string | null;
  bio: string | null;
  languages: string[] | null;
  industryExperience: string[] | null;
  tier: string | null;
  notes: string | null;
  email: string | null;
  website: string | null;
  employmentStatus: string | null;
  newEngagements: Engagement[] | null;

  // verbatim quotes from the transcript, keyed by field name
  evidence: Record<string, string>;
}

export interface ExtractRequest {
  filename: string;
  text: string;
}

export interface ExtractResult {
  filename: string;
  extraction: TranscriptExtraction;
  matchedFacilitator: { name: string; id: string } | null;
  candidates: { name: string; id: string }[]; // top fuzzy matches if confidence is low
  warnings: string[];
  error?: string;
}

const EXTRACTION_SYSTEM_PROMPT = `You are extracting structured facilitator profile updates from a meeting transcript.

You will be given:
1. A transcript of a meeting
2. A roster of known facilitators (names only)

YOUR JOB: produce a JSON object matching the schema below describing ONLY information that is EXPLICITLY stated in the transcript about ONE specific facilitator from the roster.

# ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER GUESS, INFER, OR HALLUCINATE.** If a field is not directly stated in the transcript, set it to null. Better to leave a field blank than to invent.

2. **EVERY non-null field MUST have an evidence quote** — a VERBATIM substring of the transcript (10–200 chars) that proves the value. If you cannot quote the transcript word-for-word to justify a field, set the field to null.

3. **The facilitator name MUST come from the supplied roster.** Match by name only. Do not invent a person. If the transcript is clearly about no one in the roster, set facilitatorName to null and matchConfidence to "none".

4. **matchConfidence**:
   - "high": the transcript explicitly names a roster facilitator and is clearly about them (their availability, work, location, etc.)
   - "medium": a roster name appears but the transcript is partly about someone else, or the name match is ambiguous (e.g. "Sarah" when roster has multiple Sarahs)
   - "low": only a partial / first-name / nickname match, OR the topic is only tangentially about a roster facilitator
   - "none": no roster facilitator is clearly the subject

5. **Do NOT extract speculation.** If someone says "I think she might be available in March", that's not an availability update — set availability to null. Only extract definite statements: "I'm available starting March 1st".

6. **Do NOT carry across other meeting topics.** If the transcript is a wide-ranging conversation, only extract facts about the matched facilitator.

# OUTPUT SCHEMA

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "facilitatorName": string | null,         // EXACT name from the roster
  "matchConfidence": "high" | "medium" | "low" | "none",
  "matchReason": string,                     // 1 sentence on why you picked this person
  "availability": string | null,             // "Available" | "On Assignment" | "Unavailable" | descriptive (e.g. "Available after Q3")
  "currentEngagement": string | null,        // current client / project they are actively on
  "location": string | null,                 // "City, Country"
  "bio": string | null,                      // updated 1-2 sentence bio
  "languages": string[] | null,              // languages they speak
  "industryExperience": string[] | null,     // industries they have worked in
  "tier": string | null,                     // "Top" | "Medium" | "Low" only if explicitly graded
  "notes": string | null,                    // free-form note worth recording
  "email": string | null,
  "website": string | null,
  "employmentStatus": string | null,         // e.g. "Independent", "Employed at X"
  "newEngagements": [{ "name": string, "status": "Active" | "Completed" | "None", "date": string }] | null,
  "evidence": {
    // For EVERY non-null field above, include an entry here whose key matches
    // the field name and whose value is a VERBATIM quote from the transcript.
    // Example: "availability": "I'm fully booked through May but free after that"
  }
}

If the transcript contains no extractable updates, return:
{ "facilitatorName": null, "matchConfidence": "none", "matchReason": "<why>", "availability": null, "currentEngagement": null, "location": null, "bio": null, "languages": null, "industryExperience": null, "tier": null, "notes": null, "email": null, "website": null, "employmentStatus": null, "newEngagements": null, "evidence": {} }

Remember: WHEN IN DOUBT, RETURN NULL. Wrong information is worse than missing information.`;

export async function extractFromTranscript(
  apiKey: string,
  transcriptText: string,
  filename: string,
  roster: Facilitator[]
): Promise<TranscriptExtraction> {
  const rosterNames = roster.map((f) => f.name).join("\n");
  const userMessage = `# ROSTER OF KNOWN FACILITATORS
${rosterNames}

# TRANSCRIPT (filename: ${filename})
${transcriptText}

Return the JSON extraction object now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text =
    data.content?.find((b: { type: string; text?: string }) => b.type === "text")
      ?.text || "";

  const parsed = parseJsonFromModel(text);
  return enforceEvidence(parsed, transcriptText);
}

function parseJsonFromModel(raw: string): TranscriptExtraction {
  // Models sometimes wrap JSON in ```json fences despite instructions — strip them.
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // If there's leading prose, find the first { ... last }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  try {
    return JSON.parse(cleaned) as TranscriptExtraction;
  } catch {
    return {
      facilitatorName: null,
      matchConfidence: "none",
      matchReason: "Model returned unparseable JSON",
      availability: null,
      currentEngagement: null,
      location: null,
      bio: null,
      languages: null,
      industryExperience: null,
      tier: null,
      notes: null,
      email: null,
      website: null,
      employmentStatus: null,
      newEngagements: null,
      evidence: {},
    };
  }
}

/**
 * Anti-hallucination guardrail: for every non-null field, verify the evidence
 * quote actually appears in the transcript. If it doesn't, drop the field.
 * This catches the most common failure mode (model claims a fact and fabricates
 * a quote to back it up).
 */
function enforceEvidence(
  extraction: TranscriptExtraction,
  transcriptText: string
): TranscriptExtraction {
  const lower = transcriptText.toLowerCase();
  const evidence = extraction.evidence || {};
  const cleaned: TranscriptExtraction = { ...extraction, evidence: {} };

  const fields: (keyof TranscriptExtraction)[] = [
    "availability",
    "currentEngagement",
    "location",
    "bio",
    "languages",
    "industryExperience",
    "tier",
    "notes",
    "email",
    "website",
    "employmentStatus",
    "newEngagements",
  ];

  for (const f of fields) {
    const value = extraction[f];
    if (value === null || value === undefined) continue;
    const quote = evidence[f as string];
    if (!quote || typeof quote !== "string") {
      // No evidence quote — drop the field
      (cleaned as unknown as Record<string, unknown>)[f as string] = null;
      continue;
    }
    // Verify the quote (or a meaningful substring) appears in the transcript.
    // Normalize whitespace, lowercase, and require at least an 8-char overlap.
    const qNorm = quote.toLowerCase().replace(/\s+/g, " ").trim();
    if (qNorm.length < 6) {
      (cleaned as unknown as Record<string, unknown>)[f as string] = null;
      continue;
    }
    const transcriptNorm = lower.replace(/\s+/g, " ");
    if (!transcriptNorm.includes(qNorm)) {
      // Try a shorter window — first 30 chars — to allow minor punctuation differences
      const probe = qNorm.slice(0, Math.min(30, qNorm.length));
      if (!transcriptNorm.includes(probe)) {
        (cleaned as unknown as Record<string, unknown>)[f as string] = null;
        continue;
      }
    }
    // Quote verified — keep the field and its evidence
    cleaned.evidence[f as string] = quote;
  }

  // If after evidence enforcement there are no fields left, lower confidence
  const anyField = fields.some((f) => {
    const v = (cleaned as unknown as Record<string, unknown>)[f as string];
    return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
  });
  if (!anyField && cleaned.matchConfidence !== "none") {
    cleaned.matchReason =
      cleaned.matchReason + " (no extractable fields with evidence)";
  }

  return cleaned;
}

/**
 * Best-effort fuzzy match of the extraction's facilitatorName against the
 * roster. Returns the top match if confidence is high enough, plus the top
 * candidates for the UI to offer if not.
 */
export function matchToRoster(
  extracted: TranscriptExtraction,
  roster: Facilitator[]
): {
  matched: { name: string; id: string } | null;
  candidates: { name: string; id: string }[];
} {
  if (!extracted.facilitatorName) {
    return { matched: null, candidates: [] };
  }
  const target = extracted.facilitatorName.toLowerCase().trim();

  // Score every roster entry
  const scored = roster.map((f) => {
    const name = f.name.toLowerCase().trim();
    let score = 0;
    if (name === target) score = 100;
    else if (name.includes(target) || target.includes(name)) score = 80;
    else {
      // token overlap
      const a = new Set(name.split(/\s+/));
      const b = new Set(target.split(/\s+/));
      const overlap = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      score = Math.round((overlap / union) * 100);
    }
    return { name: f.name, id: f.id, score };
  });

  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  const matched =
    top && top.score >= 80 && extracted.matchConfidence === "high"
      ? { name: top.name, id: top.id }
      : null;

  const candidates = scored
    .filter((s) => s.score >= 40)
    .slice(0, 5)
    .map((s) => ({ name: s.name, id: s.id }));

  return { matched, candidates };
}
