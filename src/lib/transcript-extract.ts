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

/**
 * OpenAI model used for extraction. Override via OPENAI_EXTRACTION_MODEL env
 * if you want to swap (e.g. to a cheaper mini for batch jobs).
 *
 * Unlike lib/llm.ts this path asks for `response_format: json_object`
 * rather than a function call, so it is not subject to gpt-6-luna's
 * "function calling needs reasoning_effort: none" rule on Chat
 * Completions. Default reasoning is left in place, which is what you
 * want for pulling claims out of a messy transcript.
 */
const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

export type DocumentType = "transcript" | "email";

export async function extractFromTranscript(
  apiKey: string,
  transcriptText: string,
  filename: string,
  roster: Facilitator[],
  documentType: DocumentType = "transcript"
): Promise<TranscriptExtraction> {
  const rosterNames = roster.map((f) => f.name).join("\n");

  // Pre-compute the closest roster match from the FILENAME alone. Surface
  // it to the model as an explicit hint so it doesn't bail when the
  // body uses a nickname ("Mike" for "Mikhail") or a slightly different
  // spelling ("Verbitskiy" vs "Verbitsky" — Russian transliteration).
  // The model still has to verify the content is about this person; we
  // just remove the "I can't match the name" dead-end when an obvious
  // filename match exists.
  const filenameHint = closestRosterFromFilename_(filename, roster);
  const hintLine = filenameHint
    ? `\n# FILENAME HINT\nThe ${documentType} filename closely matches the roster entry "${filenameHint.name}" (similarity ${filenameHint.score}%). If the body content is consistent with this person (you'll see them addressed, named, signing, or speaking), use this EXACT roster name. If the content is clearly about someone else, ignore this hint.\n`
    : "";

  const docLabel = documentType === "email" ? "EMAIL" : "TRANSCRIPT";
  const emailHint =
    documentType === "email"
      ? `\n# EMAIL-SPECIFIC GUIDANCE
- The email may have "From:", "To:", "Subject:" headers. Use them to identify the SENDER and RECIPIENTS.
- The subject of extraction must still be a roster FACILITATOR. Cases:
  - If the email is FROM a facilitator (look for their name in From/signature/first-person voice), treat first-person statements as factual about them.
  - If the email is FROM Joe or another operator ABOUT a facilitator, extract from the third-person prose. Identify which roster facilitator is being discussed.
- Email SIGNATURES often contain location, role, employer, phone. Treat the signature as a reliable source IF it belongs to a roster facilitator.
- Do NOT extract facts about the sender if they aren't in the roster (e.g. a client introducing themselves is not a facilitator update).
- A forwarded chain (text starting with "---------- Forwarded message ----------" or quoted ">") may discuss multiple people — only extract about the one roster facilitator who is the focus.
- If the email is purely scheduling/logistics with no facts about a facilitator's profile (availability, location, role, etc.), return matchConfidence "none".
`
      : "";

  const userMessage = `# ROSTER OF KNOWN FACILITATORS
${rosterNames}
${hintLine}${emailHint}
# ${docLabel} (filename: ${filename})
${transcriptText}

Return the JSON extraction object now.`;

  const model = process.env.OPENAI_EXTRACTION_MODEL || DEFAULT_OPENAI_MODEL;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content || "";

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
 *
 * Fallback: if the model returned no facilitator name but the transcript
 * has at least one extracted field with evidence AND the filename strongly
 * matches a roster entry, use the filename match as the candidate. This
 * recovers cases where the transcript body only refers to the person by
 * first name or a nickname.
 */
export function matchToRoster(
  extracted: TranscriptExtraction,
  roster: Facilitator[],
  filename?: string
): {
  matched: { name: string; id: string } | null;
  candidates: { name: string; id: string }[];
} {
  if (!extracted.facilitatorName) {
    // Filename fallback — only fire when there's actual extracted content
    // worth associating with a person.
    if (filename) {
      const hasExtractable = (
        ["availability","currentEngagement","location","bio","languages","industryExperience","tier","notes","email","website","employmentStatus","newEngagements"] as const
      ).some((k) => {
        const v = extracted[k];
        return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
      });
      if (hasExtractable) {
        const fhit = closestRosterFromFilename_(filename, roster);
        if (fhit && fhit.score >= 70) {
          return {
            matched: { name: fhit.name, id: fhit.id },
            candidates: [{ name: fhit.name, id: fhit.id }],
          };
        }
        if (fhit) {
          return { matched: null, candidates: [{ name: fhit.name, id: fhit.id }] };
        }
      }
    }
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

/**
 * Find the closest roster entry to a transcript filename. Strips the
 * extension, normalizes separators, and uses the same scoring as
 * matchToRoster. Returns null if the best match scores below 60.
 *
 * Used to seed the extractor with a strong filename hint so the model
 * doesn't bail when the transcript body refers to the person by a
 * nickname or short form.
 */
export function closestRosterFromFilename_(
  filename: string,
  roster: Facilitator[]
): { name: string; id: string; score: number } | null {
  if (!filename) return null;
  // Strip path + extension, replace separators with spaces.
  const base = filename
    .replace(/^.*[\\/]/, "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\bmeeting\b|\btranscript\b|\bnotes?\b|\bcatchup\b|\bcatch-?up\b|\bcall\b|\bsync\b|\binterview\b/gi, " ")
    .replace(/\d{1,4}([-/]\d{1,4}){0,2}/g, " ") // dates
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!base) return null;

  // Tokenize the filename and score against each roster name. Use:
  //   - exact substring match → 90+
  //   - first-name match + last-name prefix overlap → 80
  //   - token overlap (Jaccard) → 0–100
  // The transliteration case (Verbitskiy vs Verbitsky) catches via
  // first-name+last-name-prefix: both have "mikhail" + "verbitsk*".
  const baseTokens = base.split(/\s+/).filter(Boolean);
  const scored = roster.map((f) => {
    const name = f.name.toLowerCase().trim();
    const nameTokens = name.split(/\s+/).filter(Boolean);
    let score = 0;
    if (base.includes(name) || name.includes(base)) {
      score = 95;
    } else {
      // First-name exact + last-name prefix (>=4 chars common)
      if (
        nameTokens.length >= 2 &&
        baseTokens.length >= 2 &&
        nameTokens[0] === baseTokens[0]
      ) {
        const lnA = nameTokens[nameTokens.length - 1];
        const lnB = baseTokens[baseTokens.length - 1];
        const prefix = commonPrefixLen_(lnA, lnB);
        if (prefix >= 4) score = Math.max(score, 80 + Math.min(15, prefix));
      }
      // Token overlap (Jaccard)
      const setA = new Set(nameTokens);
      const setB = new Set(baseTokens);
      const overlap = [...setA].filter((x) => setB.has(x)).length;
      const union = new Set([...setA, ...setB]).size;
      score = Math.max(score, Math.round((overlap / union) * 100));
    }
    return { name: f.name, id: f.id, score };
  });
  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  if (!top || top.score < 60) return null;
  return top;
}

function commonPrefixLen_(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}
