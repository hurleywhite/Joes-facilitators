import { NextResponse } from "next/server";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { getPhotoUrl } from "@/data/photo-map";
import { Facilitator } from "@/types/facilitator";
import { resolveCoords } from "@/lib/geocode";
import { generateBio } from "@/lib/bio-enrich";
import { fetchLinkedInMetadata } from "@/lib/linkedin-enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Enriches facilitator data:
 *   - photoUrl: spreadsheet > LinkedIn og:image > local photo map > DiceBear
 *   - lat/lng: geocode from location
 *   - bio: spreadsheet > LinkedIn og:description > template
 */
async function enrich(facilitators: Facilitator[]): Promise<Facilitator[]> {
  return Promise.all(
    facilitators.map(async (f) => {
      // Try LinkedIn metadata first (cached per instance)
      const liData =
        (!f.bio || !f.photoUrl) && f.linkedinUrl
          ? await fetchLinkedInMetadata(f.linkedinUrl).catch(() => null)
          : null;

      // Photo: spreadsheet > LinkedIn og:image > local photo map > DiceBear
      const photoUrl =
        f.photoUrl ||
        liData?.imageUrl ||
        getPhotoUrl(f.linkedinUrl, f.name);

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

      // Bio: spreadsheet > LinkedIn og:description (cleaned) > template
      let bio = f.bio;
      if (!bio || bio.length < 20) {
        if (liData?.description && liData.description.length > 30) {
          bio = cleanLinkedInDescription(liData.description);
        } else {
          bio = generateBio(f);
        }
      }

      return { ...f, photoUrl, lat, lng, bio };
    })
  );
}

/**
 * LinkedIn descriptions often start with "[Name]'s Post on LinkedIn" or
 * include trailing "...| LinkedIn". Strip these.
 */
function cleanLinkedInDescription(desc: string): string {
  return desc
    .replace(/\s*\|\s*LinkedIn\s*$/i, "")
    .replace(/^[^.]*'s Post on LinkedIn\.?\s*/i, "")
    .trim();
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
