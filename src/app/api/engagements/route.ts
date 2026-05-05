import { NextResponse } from "next/server";
import { fetchEngagements, toEngagementsCsvUrl } from "@/data/engagements";
import { dummyEngagements } from "@/data/dummy-engagements";

export const dynamic = "force-dynamic";

export async function GET() {
  const sheetUrl = process.env.GOOGLE_ENGAGEMENTS_CSV_URL;

  // No env var — fall back to seed data so the page is useful out of the box.
  if (!sheetUrl) {
    return NextResponse.json(dummyEngagements, {
      headers: {
        "X-Engagements-Source": "seed",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  try {
    const url = toEngagementsCsvUrl(sheetUrl);
    const engagements = await fetchEngagements(url);
    // If the live sheet is reachable but empty (e.g. only a header row, or the
    // sharing settings dropped the data), still show the seeds rather than a
    // blank page. The user can spot the discrepancy and fix the sheet.
    if (engagements.length === 0) {
      return NextResponse.json(dummyEngagements, {
        headers: {
          "X-Engagements-Source": "seed-fallback-empty-sheet",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }
    return NextResponse.json(engagements, {
      headers: {
        "X-Engagements-Source": "sheet",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Engagements fetch failed, falling back to seed:", err);
    return NextResponse.json(dummyEngagements, {
      headers: {
        "X-Engagements-Source": "seed-fallback-error",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }
}
