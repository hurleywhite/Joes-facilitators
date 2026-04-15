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
 * NEW engagement format — separate columns, most recent first:
 *   Eng 1 Name | Eng 1 Status | Eng 1 Date | Eng 2 Name | Eng 2 Status | Eng 2 Date | ...
 *
 * Also supports the legacy pipe/semicolon format in "Engagement History" column.
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
      const engagements: Engagement[] = [];

      // NEW FORMAT: Read Eng 1, Eng 2, Eng 3... columns (most recent first)
      for (let n = 1; n <= 10; n++) {
        const engName = getCol(row, [`Eng ${n} Name`, `Eng${n} Name`, `Engagement ${n} Name`, `Engagement ${n}`]);
        if (!engName) break; // stop at first empty slot
        const engStatus = getCol(row, [`Eng ${n} Status`, `Eng${n} Status`, `Engagement ${n} Status`]) || "Completed";
        const engDate = getCol(row, [`Eng ${n} Date`, `Eng${n} Date`, `Engagement ${n} Date`]) || "";
        engagements.push({
          name: engName,
          status: engStatus as Engagement["status"],
          date: engDate,
        });
      }

      // LEGACY FORMAT: fall back to pipe/semicolon "Engagement History" column
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
