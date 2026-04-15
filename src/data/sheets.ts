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
 * Country → Region mapping for auto-deriving region from country.
 */
const countryToRegion: Record<string, Region> = {
  usa: "Americas",
  "united states": "Americas",
  canada: "Americas",
  mexico: "Americas",
  brazil: "Americas",
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
  india: "Asia-Pacific",
  japan: "Asia-Pacific",
  "south korea": "Asia-Pacific",
  singapore: "Asia-Pacific",
  australia: "Asia-Pacific",
  china: "Asia-Pacific",
  israel: "Middle East & Africa",
  uae: "Middle East & Africa",
  "saudi arabia": "Middle East & Africa",
  egypt: "Middle East & Africa",
  nigeria: "Middle East & Africa",
  kenya: "Middle East & Africa",
  "south africa": "Middle East & Africa",
  dubai: "Middle East & Africa",
};

function deriveRegion(country: string): Region {
  const key = country.toLowerCase().trim();
  return countryToRegion[key] || "Americas";
}

/**
 * Derives availability from the Current Engagement field if not explicitly set.
 */
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
  // Auto-derive: if they have a current engagement, they're on assignment
  if (currentEngagement) return "On Assignment";
  return "Available";
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

      // NEW FORMAT: Read Eng 1, Eng 2, Eng 3... columns (most recent first)
      for (let n = 1; n <= 10; n++) {
        const engName = getCol(row, [
          `Eng ${n} Name`, `Eng${n} Name`,
          `Engagement ${n} Name`, `Engagement ${n}`,
        ]);
        if (!engName) break;
        const engStatus = getCol(row, [
          `Eng ${n} Status`, `Eng${n} Status`, `Engagement ${n} Status`,
        ]) || "Completed";
        const engDate = getCol(row, [
          `Eng ${n} Date`, `Eng${n} Date`, `Engagement ${n} Date`,
        ]) || "";
        engagements.push({
          name: engName,
          status: engStatus as Engagement["status"],
          date: engDate,
        });
      }

      // LEGACY FORMAT: fall back to pipe/semicolon
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

      const country = getCol(row, ["Country"]);
      const currentEngagement =
        getCol(row, ["Current Engagement", "Current", "Active Engagement"]) || null;
      const explicitAvailability = getCol(row, ["Availability", "Status"]);

      return {
        id: String(i + 1),
        name: getCol(row, ["Name"]),
        photoUrl: getCol(row, ["Photo URL", "Photo", "Photo Url", "Image URL", "Image"]),
        linkedinUrl: ensureFullUrl(getCol(row, ["LinkedIn URL", "LinkedIn", "LinkedIn Url", "LI URL"])),
        focus: (getCol(row, ["Focus"]) || "Facilitation") as Focus,
        experienceLevel: (getCol(row, ["Experience Level", "Experience"]) || "Medium") as ExperienceLevel,
        availability: deriveAvailability(explicitAvailability, currentEngagement),
        region: (getCol(row, ["Region"]) as Region) || deriveRegion(country),
        location: `${getCol(row, ["City"])}, ${country}`,
        city: getCol(row, ["City"]),
        country,
        lat: parseFloat(getCol(row, ["Lat", "Latitude"]) || "0"),
        lng: parseFloat(getCol(row, ["Lng", "Lon", "Long", "Longitude"]) || "0"),
        bio: getCol(row, ["Bio", "Description", "About"]),
        engagements,
        currentEngagement,
      };
    });
}

/**
 * Ensures a URL has https:// prefix. Handles cases where the sheet
 * has "linkedin.com/in/..." instead of "https://www.linkedin.com/in/..."
 */
function ensureFullUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://www.${url}`;
}

function getCol(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const val = row[name];
    if (val !== undefined && val !== null) {
      const trimmed = val.trim();
      if (trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
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
