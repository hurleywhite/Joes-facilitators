import Papa from "papaparse";
import {
  Facilitator,
  Focus,
  ExperienceLevel,
  Engagement,
  Availability,
  Region,
} from "@/types/facilitator";

/**
 * Country/keyword → Region mapping for auto-deriving region.
 */
const countryToRegion: Record<string, Region> = {
  usa: "Americas",
  "united states": "Americas",
  canada: "Americas",
  mexico: "Americas",
  brazil: "Americas",
  argentina: "Americas",
  chile: "Americas",
  colombia: "Americas",
  uk: "Europe",
  "united kingdom": "Europe",
  ireland: "Europe",
  germany: "Europe",
  france: "Europe",
  italy: "Europe",
  spain: "Europe",
  portugal: "Europe",
  sweden: "Europe",
  switzerland: "Europe",
  netherlands: "Europe",
  belgium: "Europe",
  poland: "Europe",
  india: "Asia-Pacific",
  japan: "Asia-Pacific",
  "south korea": "Asia-Pacific",
  korea: "Asia-Pacific",
  singapore: "Asia-Pacific",
  australia: "Asia-Pacific",
  "new zealand": "Asia-Pacific",
  china: "Asia-Pacific",
  malaysia: "Asia-Pacific",
  indonesia: "Asia-Pacific",
  philippines: "Asia-Pacific",
  thailand: "Asia-Pacific",
  vietnam: "Asia-Pacific",
  israel: "Middle East & Africa",
  uae: "Middle East & Africa",
  "saudi arabia": "Middle East & Africa",
  bahrain: "Middle East & Africa",
  qatar: "Middle East & Africa",
  egypt: "Middle East & Africa",
  nigeria: "Middle East & Africa",
  kenya: "Middle East & Africa",
  "south africa": "Middle East & Africa",
  dubai: "Middle East & Africa",
};

/**
 * Tries to derive region from a free-form Location string like "Dubai, UAE" or
 * "NY, NY" or "Lumpur, Malaysia".
 */
function deriveRegionFromLocation(location: string, country: string): Region {
  const all = `${location} ${country}`.toLowerCase();
  for (const [key, region] of Object.entries(countryToRegion)) {
    if (all.includes(key)) return region;
  }
  return "Americas"; // safe default
}

/**
 * Splits a Location string into city and country (best-effort).
 * "San Francisco, CA" → city="San Francisco", country="USA" (CA → USA inferred)
 * "Dubai, UAE" → city="Dubai", country="UAE"
 * "Lumpur, Malaysia" → city="Lumpur", country="Malaysia"
 */
function splitLocation(location: string): { city: string; country: string } {
  if (!location) return { city: "", country: "" };
  const parts = location.split(",").map((s) => s.trim());
  if (parts.length === 1) return { city: parts[0], country: parts[0] };

  const city = parts[0];
  const last = parts[parts.length - 1];

  // US state abbreviations → "USA"
  const usStates = new Set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
    "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
    "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
    "WI","WY","DC",
  ]);
  if (usStates.has(last.toUpperCase())) {
    return { city, country: "USA" };
  }

  return { city, country: last };
}

/**
 * Parses Focus value. Returns undefined for empty/unrecognized so we can
 * distinguish "not categorized yet" from a real value.
 */
function parseFocus(value: string): Focus | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === "facilitation") return "Facilitation";
  if (lower === "tech" || lower === "technical") return "Tech";
  if (lower === "both") return "Both";
  return undefined;
}

function deriveAvailability(
  explicit: string,
  currentEngagement: string | null
): Availability {
  if (explicit) {
    const lower = explicit.toLowerCase();
    if (lower === "available") return "Available";
    if (lower.includes("assignment") || lower.includes("busy")) return "On Assignment";
    if (lower === "unavailable") return "Unavailable";
  }
  if (currentEngagement) return "On Assignment";
  return "Available";
}

/**
 * Splits a delimited list (semicolons, commas, or pipes) into trimmed entries.
 */
function splitList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function fetchFromGoogleSheet(
  sheetUrl: string
): Promise<Facilitator[]> {
  const res = await fetch(sheetUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data
    .filter((row) => getCol(row, ["Name"]).length > 0)
    .map((row, i) => {
      const engagements: Engagement[] = [];

      // Eng 1, Eng 2, ... separate columns (most recent first)
      for (let n = 1; n <= 10; n++) {
        const engName = getCol(row, [
          `Eng ${n} Name`,
          `Eng${n} Name`,
          `Engagement ${n} Name`,
          `Engagement ${n}`,
        ]);
        if (!engName) break;
        const engStatus =
          getCol(row, [`Eng ${n} Status`, `Eng${n} Status`, `Engagement ${n} Status`]) ||
          "Completed";
        const engDate =
          getCol(row, [`Eng ${n} Date`, `Eng${n} Date`, `Engagement ${n} Date`]) || "";
        engagements.push({
          name: engName,
          status: engStatus as Engagement["status"],
          date: engDate,
        });
      }

      // Legacy pipe/semicolon format fallback
      if (engagements.length === 0) {
        const engHistory = getCol(row, ["Engagement History", "Engagements"]);
        if (engHistory) {
          engHistory.split(";").forEach((entry) => {
            const parts = entry.trim().split("|");
            if (parts.length >= 3) {
              engagements.push({
                name: parts[0].trim(),
                status: (parts[1].trim() as Engagement["status"]) || "Completed",
                date: parts[2].trim(),
              });
            }
          });
        }
      }

      // Resolve location — supports both "Location" single field and "City"+"Country"
      const explicitCity = getCol(row, ["City"]);
      const explicitCountry = getCol(row, ["Country"]);
      const locationField = getCol(row, ["Location"]);
      const { city, country } = locationField
        ? splitLocation(locationField)
        : { city: explicitCity, country: explicitCountry };
      const displayLocation =
        locationField || `${city}${country ? `, ${country}` : ""}`;

      const currentEngagement =
        getCol(row, ["Current Engagement", "Current", "Active Engagement"]) || null;
      const explicitAvailability = getCol(row, ["Availability", "Status"]);
      const explicitRegion = getCol(row, ["Region"]) as Region;

      return {
        id: String(i + 1),
        name: getCol(row, ["Name"]),
        photoUrl: getCol(row, ["Photo URL", "Photo", "Photo Url", "Image URL", "Image"]),
        linkedinUrl: ensureFullUrl(
          getCol(row, ["LinkedIn URL", "LinkedIn", "LinkedIn Url", "LI URL"])
        ),
        email: getCol(row, ["Email", "E-mail", "E mail"]) || undefined,
        website: ensureFullUrl(getCol(row, ["Website", "Site", "URL"])) || undefined,
        focus: parseFocus(getCol(row, ["Focus"])),
        experienceLevel: (getCol(row, ["Experience Level", "Experience"]) || "Medium") as ExperienceLevel,
        availability: deriveAvailability(explicitAvailability, currentEngagement),
        region: explicitRegion || deriveRegionFromLocation(displayLocation, country),
        tier: getCol(row, ["Tier"]) || undefined,
        location: displayLocation,
        city,
        country,
        lat: parseFloat(getCol(row, ["Lat", "Latitude"]) || "0"),
        lng: parseFloat(getCol(row, ["Lng", "Lon", "Long", "Longitude"]) || "0"),
        bio: getCol(row, ["Bio", "Description", "About"]),
        languages: splitList(getCol(row, ["Languages", "Language"])),
        industryExperience: splitList(
          getCol(row, ["Industry Experience", "Industries", "Industry"])
        ),
        employmentStatus:
          getCol(row, ["Employment status", "Employment Status", "Employment"]) ||
          undefined,
        notes: getCol(row, ["Notes", "Internal Notes"]) || undefined,
        engagements,
        currentEngagement,
      };
    });
}

/**
 * Looks like a real URL (has a domain dot, no spaces).
 * Rejects placeholder text like "LinkedIn Profile", "TBD", etc.
 */
function looksLikeUrl(s: string): boolean {
  if (!s) return false;
  if (s.includes(" ")) return false; // URLs don't have spaces
  if (!s.includes(".")) return false; // need a domain
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(s) || /^https?:\/\//.test(s);
}

function ensureFullUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!looksLikeUrl(url)) return ""; // placeholder text, not a URL
  return `https://www.${url}`;
}

const PLACEHOLDER_VALUES = new Set([
  "—",
  "-",
  "n/a",
  "tbd",
  "linkedin profile",
  "linkedin",
  "url",
  "website",
  "?",
  "",
]);

function getCol(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const val = row[name];
    if (val !== undefined && val !== null) {
      const trimmed = val.trim();
      if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) {
        return "";
      }
      return trimmed;
    }
  }
  return "";
}

export function toGoogleSheetCsvUrl(shareUrl: string): string {
  const match = shareUrl.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }
  return shareUrl;
}
