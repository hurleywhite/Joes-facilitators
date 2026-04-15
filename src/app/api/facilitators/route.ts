import { NextResponse } from "next/server";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { getPhotoUrl } from "@/data/photo-map";

// Force dynamic — never cache this route at the edge
export const dynamic = "force-dynamic";

/**
 * For each facilitator, if they don't have a photoUrl from the spreadsheet,
 * auto-resolve one from their X/Twitter profile via unavatar.io.
 */
function enrichPhotos(
  facilitators: typeof dummyFacilitators
): typeof dummyFacilitators {
  return facilitators.map((f) => ({
    ...f,
    photoUrl: f.photoUrl || getPhotoUrl(f.linkedinUrl, f.name),
  }));
}

export async function GET() {
  let sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;

  // If a Google Sheet URL is configured, fetch from it; otherwise use dummy data
  if (sheetUrl) {
    // Auto-convert sharing URLs to CSV export URLs
    sheetUrl = toGoogleSheetCsvUrl(sheetUrl);

    try {
      const facilitators = await fetchFromGoogleSheet(sheetUrl);
      if (facilitators.length > 0) {
        return NextResponse.json(enrichPhotos(facilitators), {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
    } catch (err) {
      console.error(
        "Failed to fetch from Google Sheet, falling back to dummy data:",
        err
      );
    }
  }

  return NextResponse.json(enrichPhotos(dummyFacilitators));
}
