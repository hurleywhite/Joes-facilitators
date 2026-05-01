import { NextResponse } from "next/server";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { getPhotoUrl } from "@/data/photo-map";
import { Facilitator } from "@/types/facilitator";
import { resolveCoords } from "@/lib/geocode";
import { generateBio } from "@/lib/bio-enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Enriches facilitator data:
 *   - photoUrl: lookup from local photos via LinkedIn handle
 *   - lat/lng: geocode from location (static lookup, fast)
 *   - bio: template-generated from focus/experience/industries if missing
 */
async function enrich(facilitators: Facilitator[]): Promise<Facilitator[]> {
  return Promise.all(
    facilitators.map(async (f) => {
      // Photo
      const photoUrl = f.photoUrl || getPhotoUrl(f.linkedinUrl, f.name);

      // Coords
      let lat = f.lat;
      let lng = f.lng;
      if ((!lat || lat === 0) && f.location) {
        const coords = await resolveCoords(f.location, false);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      // Bio
      const bio =
        f.bio && f.bio.length > 20
          ? f.bio
          : generateBio(f);

      return { ...f, photoUrl, lat, lng, bio };
    })
  );
}

export async function GET() {
  let sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;

  if (sheetUrl) {
    sheetUrl = toGoogleSheetCsvUrl(sheetUrl);

    try {
      const facilitators = await fetchFromGoogleSheet(sheetUrl);
      if (facilitators.length > 0) {
        const enriched = await enrich(facilitators);
        return NextResponse.json(enriched, {
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

  const enriched = await enrich(dummyFacilitators);
  return NextResponse.json(enriched);
}
