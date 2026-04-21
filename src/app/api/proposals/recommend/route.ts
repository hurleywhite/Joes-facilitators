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
 *   - Experience level (High > Medium > Low)
 */
export async function POST(req: Request) {
  const { clientRegion, neededFocus, count = 3 } = (await req.json()) as {
    clientRegion?: string;
    neededFocus?: "Facilitation" | "Tech" | "Both" | "Any";
    count?: number;
  };

  // Fetch the live pool
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

  // Enrich photos
  pool = pool.map((f) => ({
    ...f,
    photoUrl: f.photoUrl || getPhotoUrl(f.linkedinUrl, f.name),
  }));

  // Score each facilitator
  const scored = pool.map((f) => {
    let score = 0;

    // Availability (most important)
    if (f.availability === "Available") score += 100;
    else if (f.availability === "On Assignment") score += 20;
    // Unavailable = 0

    // Region match
    if (clientRegion && f.region === clientRegion) score += 40;

    // Focus match
    if (neededFocus && neededFocus !== "Any") {
      if (f.focus === neededFocus) score += 30;
      else if (f.focus === "Both") score += 15; // Both is partial match
    }

    // Experience
    if (f.experienceLevel === "High") score += 20;
    else if (f.experienceLevel === "Medium") score += 10;

    // Engagement track record
    score += Math.min(f.engagements.length * 3, 15);

    return { f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const recommended = scored.slice(0, count).map((s) => s.f);

  return NextResponse.json({ recommended });
}
