import { NextResponse } from "next/server";
import { Facilitator } from "@/types/facilitator";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import {
  extractFromTranscript,
  matchToRoster,
  ExtractResult,
} from "@/lib/transcript-extract";

/**
 * Mirror of /api/transcripts/extract for emails. Reuses the same engine
 * (extractFromTranscript) but passes `documentType: "email"` so the
 * system prompt picks up email-specific guidance: From/To/Subject
 * headers, sender vs. subject disambiguation, signature handling.
 *
 * The apply endpoint is the same — /api/transcripts/apply — because the
 * overlay store is document-type-agnostic. The patches are tagged with
 * their source filename so the operator can trace what came from where.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExtractEmailsRequest {
  emails: { filename: string; text: string }[];
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is not configured. Add it to your Vercel/.env to enable email extraction.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ExtractEmailsRequest;
    if (!body.emails || !Array.isArray(body.emails)) {
      return NextResponse.json(
        { error: "Request body must include an `emails` array." },
        { status: 400 }
      );
    }

    const roster = await loadRoster();
    if (roster.length === 0) {
      return NextResponse.json(
        { error: "Could not load facilitator roster for matching." },
        { status: 500 }
      );
    }

    const results: ExtractResult[] = [];
    for (const e of body.emails) {
      if (!e.text || e.text.trim().length < 10) {
        results.push({
          filename: e.filename || "(unnamed)",
          extraction: emptyExtraction("Email text is empty or too short."),
          matchedFacilitator: null,
          candidates: [],
          warnings: ["Email was empty or too short to process."],
        });
        continue;
      }

      try {
        const extraction = await extractFromTranscript(
          apiKey,
          e.text,
          e.filename,
          roster,
          "email"
        );
        const { matched, candidates } = matchToRoster(
          extraction,
          roster,
          e.filename
        );

        const warnings: string[] = [];
        if (!matched) {
          if (extraction.facilitatorName) {
            warnings.push(
              `Could not confidently match "${extraction.facilitatorName}" to a roster facilitator — please pick one manually.`
            );
          } else {
            warnings.push("No facilitator named in this email.");
          }
        }
        if (extraction.matchConfidence === "low") {
          warnings.push(
            "Match confidence is LOW — review carefully before applying."
          );
        }

        results.push({
          filename: e.filename || "(unnamed)",
          extraction,
          matchedFacilitator: matched,
          candidates,
          warnings,
        });
      } catch (err) {
        results.push({
          filename: e.filename || "(unnamed)",
          extraction: emptyExtraction(
            err instanceof Error ? err.message : "Extraction failed."
          ),
          matchedFacilitator: null,
          candidates: [],
          warnings: [],
          error: err instanceof Error ? err.message : "Extraction failed.",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function loadRoster(): Promise<Facilitator[]> {
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (sheetUrl) {
    try {
      const facs = await fetchFromGoogleSheet(toGoogleSheetCsvUrl(sheetUrl));
      if (facs.length > 0) return facs;
    } catch (err) {
      console.error("Roster load (sheet) failed, falling back to dummy:", err);
    }
  }
  return dummyFacilitators;
}

function emptyExtraction(reason: string) {
  return {
    facilitatorName: null,
    matchConfidence: "none" as const,
    matchReason: reason,
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
