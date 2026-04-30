import { NextResponse } from "next/server";
import { Facilitator } from "@/types/facilitator";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { getPhotoUrl } from "@/data/photo-map";

export const dynamic = "force-dynamic";

/**
 * Recommends facilitators for an engagement based on:
 *   - Availability (Available > On Assignment > Unavailable)
 *   - Region match (prefer facilitators in the client's region)
 *   - Focus match (Tech / Facilitation / Both)
 *   - Industry experience match
 *   - Language match (if specific language required)
 *   - Experience level (High > Medium > Low)
 *   - Engagement track record
 */
export async function POST(req: Request) {
  const {
    clientRegion,
    neededFocus,
    industry,
    language,
    count = 5,
  } = (await req.json()) as {
    clientRegion?: string;
    neededFocus?: "Facilitation" | "Tech" | "Both" | "Any";
    industry?: string;
    language?: string;
    count?: number;
  };

  let pool: Facilitator[] = [];
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (sheetUrl) {
    try {
      pool = await fetchFromGoogleSheet(toGoogleSheetCsvUrl(sheetUrl));
    } catch {
      pool = dummyFacilitators;
    }
  } else {
    pool = dummyFacilitators;
  }

  pool = pool.map((f) => ({
    ...f,
    photoUrl: f.photoUrl || getPhotoUrl(f.linkedinUrl, f.name),
  }));

  const industryLower = industry?.toLowerCase().trim();
  const languageLower = language?.toLowerCase().trim();

  const scored = pool.map((f) => {
    let score = 0;
    const reasons: string[] = [];

    // Availability (most important)
    if (f.availability === "Available") {
      score += 100;
      reasons.push("Available");
    } else if (f.availability === "On Assignment") {
      score += 20;
      reasons.push("On assignment");
    }

    // Region match
    if (clientRegion && f.region === clientRegion) {
      score += 40;
      reasons.push(`In ${f.region}`);
    }

    // Focus match
    if (neededFocus && neededFocus !== "Any") {
      if (f.focus === neededFocus) {
        score += 30;
        reasons.push(`${neededFocus} focus`);
      } else if (f.focus === "Both") {
        score += 15;
      }
    }

    // Industry experience match
    if (industryLower && f.industryExperience?.length) {
      const match = f.industryExperience.find((i) =>
        i.toLowerCase().includes(industryLower)
      );
      if (match) {
        score += 35;
        reasons.push(`${match} experience`);
      }
    }

    // Language match
    if (languageLower && f.languages?.length) {
      const match = f.languages.find((l) =>
        l.toLowerCase().includes(languageLower)
      );
      if (match) {
        score += 25;
        reasons.push(`Speaks ${match}`);
      }
    }

    // Experience
    if (f.experienceLevel === "High") {
      score += 20;
      reasons.push("High experience");
    } else if (f.experienceLevel === "Medium") {
      score += 10;
    }

    // Engagement track record
    if (f.engagements.length > 0) {
      score += Math.min(f.engagements.length * 3, 15);
      reasons.push(`${f.engagements.length} past engagement${f.engagements.length !== 1 ? "s" : ""}`);
    }

    return { f, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const recommended = scored.slice(0, count).map((s) => ({
    ...s.f,
    matchReasons: s.reasons,
    matchScore: s.score,
  }));

  return NextResponse.json({ recommended });
}
