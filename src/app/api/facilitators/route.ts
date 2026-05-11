import { NextResponse } from "next/server";
import { fetchFromGoogleSheet, toGoogleSheetCsvUrl } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";
import { getPhotoUrl } from "@/data/photo-map";
import { Facilitator } from "@/types/facilitator";
import { resolveCoords } from "@/lib/geocode";
import { generateBio } from "@/lib/bio-enrich";
import { fetchLinkedInMetadata } from "@/lib/linkedin-enrich";
import { mergeIndustries } from "@/lib/industry-parser";
import { regionFromCoords } from "@/lib/region-from-coords";
import { fetchAvailability, toAvailabilityCsvUrl } from "@/data/availability";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Enriches facilitator data:
 *   - photoUrl: spreadsheet > LinkedIn og:image > local photo map > DiceBear
 *   - lat/lng: geocode from location
 *   - bio: spreadsheet > LinkedIn og:description > template
 */
/**
 * Pulls the latest availability submission per facilitator from the
 * Availability tab and returns a name → record map. Returns an empty
 * map if the env var isn't configured or the fetch fails.
 */
async function loadAvailabilityMap(): Promise<
  Map<string, Awaited<ReturnType<typeof fetchAvailability>>[number]>
> {
  const url = process.env.GOOGLE_AVAILABILITY_CSV_URL;
  if (!url) return new Map();
  try {
    const records = await fetchAvailability(toAvailabilityCsvUrl(url));
    const map = new Map<string, (typeof records)[number]>();
    for (const r of records) map.set(r.name.toLowerCase().trim(), r);
    return map;
  } catch (err) {
    console.error("Availability fetch failed:", err);
    return new Map();
  }
}

async function enrich(facilitators: Facilitator[]): Promise<Facilitator[]> {
  const availabilityMap = await loadAvailabilityMap();
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

      // Re-derive industries against the FINAL bio. fetchFromGoogleSheet
      // already does this from the raw sheet bio, but if we end up using a
      // LinkedIn-derived bio (or the dummy data path which doesn't run the
      // sheet parser at all), the enriched bio may surface industries that
      // weren't in the sheet column.
      const industryExperience = mergeIndustries(f.industryExperience || [], bio);
      // PAST COMPANIES intentionally uses ONLY the sheet column (filled
      // by the Apps Script via Apollo's structured employment_history).
      // Bio-prose mentions of company names are mostly clients ("Erik
      // delivered for Chanel, IKEA, Nike"), not employers — mixing them
      // in created the "Has worked with" chip row that conflated client
      // engagements with actual employment. Apollo's employment_history
      // is the source of truth for past employers; clients live in the
      // bio prose where the reader can see the context.
      const pastCompanies = f.pastCompanies || [];
      // Defensive English strip — also covers the dummy-facilitators
      // fallback path which still hardcodes ["English"] on every entry.
      const languages = (f.languages || []).filter(
        (l) => l.toLowerCase() !== "english"
      );

      // Region: prefer coords-derived over the country-string derivation
      // baked into sheets.ts. The country derivation drifts when the
      // location is missing/abbreviated; the lat/lng is what the map
      // actually shows, so we should match it.
      const coordRegion = regionFromCoords(lat, lng);
      const region = coordRegion || f.region;

      const av = availabilityMap.get(f.name.toLowerCase().trim());

      return {
        ...f,
        photoUrl,
        lat,
        lng,
        bio,
        industryExperience,
        pastCompanies,
        languages,
        region,
        availableWindows: av?.windows,
        willingToTravel: av?.willingToTravel,
        availabilityNotes: av?.notes,
        availabilityUpdatedAt: av?.submittedAt,
      };
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
