import { NextResponse } from "next/server";
import { fetchEngagements, toEngagementsCsvUrl } from "@/data/engagements";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyEngagements } from "@/data/dummy-engagements";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { engagementNamesMatch } from "@/lib/engagement-match";
import { EngagementRecord, Facilitator } from "@/types/facilitator";

export const dynamic = "force-dynamic";

/**
 * Cross-links facilitator-side engagement history into the engagement
 * records. The Speaking Directory tab tracks per-facilitator engagements
 * via Eng N Name columns; the Engagements tab tracks the canonical
 * engagement list. The two sides don't share IDs, so we fuzzy-match
 * names and merge the facilitators back into each engagement's team.
 *
 * Example: Allie K. Miller's row has Eng 1 Name = "Tamkeen Bahrain".
 * The Engagements tab has "Tamkeen". Match → Allie shows up as a team
 * member on the Tamkeen engagement card and drawer.
 *
 * Dedupes case-insensitively against any names already in the
 * engagement's Facilitators column.
 */
function crossLink(
  engagements: EngagementRecord[],
  facilitators: Facilitator[]
): EngagementRecord[] {
  return engagements.map((eng) => {
    const existing = new Set(
      eng.facilitators.map((n) => n.toLowerCase().trim())
    );
    const added: string[] = [];
    for (const f of facilitators) {
      if (!f.engagements || f.engagements.length === 0) continue;
      // Match against the engagement title OR the client — facilitators
      // sometimes record the client name ("Tamkeen") even when the
      // engagement row name differs ("AI Workshop").
      const hit = f.engagements.some(
        (e) =>
          engagementNamesMatch(e.name, eng.name) ||
          (eng.client && engagementNamesMatch(e.name, eng.client))
      );
      if (!hit) continue;
      const key = f.name.toLowerCase().trim();
      if (existing.has(key)) continue;
      existing.add(key);
      added.push(f.name);
    }
    if (added.length === 0) return eng;
    return { ...eng, facilitators: [...eng.facilitators, ...added] };
  });
}

async function loadFacilitators(): Promise<Facilitator[]> {
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!sheetUrl) return dummyFacilitators;
  try {
    return await fetchFromGoogleSheet(toGoogleSheetCsvUrl(sheetUrl));
  } catch (err) {
    console.error("Engagements: facilitator fetch for cross-link failed:", err);
    return [];
  }
}

export async function GET() {
  const sheetUrl = process.env.GOOGLE_ENGAGEMENTS_CSV_URL;
  // Always try to fetch facilitators alongside — even on the seed fallback
  // path, so the seed engagement rows still pick up cross-linked team
  // members from the live Speaking Directory if it's configured.
  const facilitatorsPromise = loadFacilitators();

  // No env var — fall back to seed data so the page is useful out of the box.
  if (!sheetUrl) {
    const facilitators = await facilitatorsPromise;
    return NextResponse.json(crossLink(dummyEngagements, facilitators), {
      headers: {
        "X-Engagements-Source": "seed",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  try {
    const url = toEngagementsCsvUrl(sheetUrl);
    const [engagements, facilitators] = await Promise.all([
      fetchEngagements(url),
      facilitatorsPromise,
    ]);
    // If the live sheet is reachable but empty (e.g. only a header row, or
    // the sharing settings dropped the data), still show the seeds rather
    // than a blank page. The user can spot the discrepancy and fix the sheet.
    if (engagements.length === 0) {
      return NextResponse.json(crossLink(dummyEngagements, facilitators), {
        headers: {
          "X-Engagements-Source": "seed-fallback-empty-sheet",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
    return NextResponse.json(crossLink(engagements, facilitators), {
      headers: {
        "X-Engagements-Source": "sheet",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Engagements fetch failed, falling back to seed:", err);
    const facilitators = await facilitatorsPromise;
    return NextResponse.json(crossLink(dummyEngagements, facilitators), {
      headers: {
        "X-Engagements-Source": "seed-fallback-error",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }
}
