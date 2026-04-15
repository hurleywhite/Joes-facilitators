import Papa from "papaparse";
import {
  Facilitator,
  Focus,
  ExperienceLevel,
  Engagement,
} from "@/types/facilitator";

/**
 * Fetches facilitator data from a Google Sheet exported as CSV.
 *
 * Flexible column matching — handles both the ideal schema and common variations:
 *   - "Photo URL" or "Photo"
 *   - "LinkedIn URL" or "LinkedIn"
 *   - "Experience Level" or "Experience"
 *   - "Engagement History" or "Engagements" (pipe/semicolon format)
 *   - "Current Engagement" or "Current"
 *   - "# Engagements" (just a count — used if Engagement History is missing)
 */
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
      // Parse engagement history if present
      const engagements: Engagement[] = [];
      const engHistory = getCol(row, [
        "Engagement History",
        "Engagements",
      ]);
      if (engHistory) {
        engHistory.split(";").forEach((entry) => {
          const parts = entry.trim().split("|");
          if (parts.length >= 3) {
            engagements.push({
              name: parts[0].trim(),
              status:
                (parts[1].trim() as Engagement["status"]) || "Completed",
              date: parts[2].trim(),
            });
          }
        });
      }

      return {
        id: String(i + 1),
        name: getCol(row, ["Name"]),
        photoUrl: getCol(row, ["Photo URL", "Photo", "Photo Url", "Image URL", "Image"]),
        linkedinUrl: getCol(row, ["LinkedIn URL", "LinkedIn", "LinkedIn Url", "LI URL"]),
        focus: (getCol(row, ["Focus"]) || "Facilitation") as Focus,
        experienceLevel: (getCol(row, ["Experience Level", "Experience", "Exp Level", "Exp"]) || "Medium") as ExperienceLevel,
        location: `${getCol(row, ["City"])}, ${getCol(row, ["Country"])}`,
        city: getCol(row, ["City"]),
        country: getCol(row, ["Country"]),
        lat: parseFloat(getCol(row, ["Lat", "Latitude"]) || "0"),
        lng: parseFloat(getCol(row, ["Lng", "Lon", "Long", "Longitude"]) || "0"),
        bio: getCol(row, ["Bio", "Description", "About"]),
        engagements,
        currentEngagement:
          getCol(row, ["Current Engagement", "Current", "Active Engagement"]) ||
          null,
      };
    });
}

/**
 * Flexible column getter — tries multiple possible header names.
 * Returns trimmed value or empty string.
 */
function getCol(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const val = row[name];
    if (val !== undefined && val !== null) return val.trim();
  }
  return "";
}

/**
 * Converts a standard Google Sheets sharing URL to a CSV export URL.
 */
export function toGoogleSheetCsvUrl(shareUrl: string): string {
  const match = shareUrl.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }
  return shareUrl;
}
