import Papa from "papaparse";
import { Facilitator, Focus, ExperienceLevel, Engagement } from "@/types/facilitator";

/**
 * Fetches facilitator data from a Google Sheet exported as CSV.
 *
 * Supports two URL formats:
 *   1. Published CSV: https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pub?output=csv
 *   2. Direct export (sheet must be shared "Anyone with link"):
 *      https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv
 *
 * No caching — every request fetches fresh data from Google Sheets.
 * For 20 rows of CSV, this adds ~200-400ms per request, which is instant for the user.
 *
 * Expected columns:
 *   Name, Photo URL, LinkedIn URL, Focus, Experience Level,
 *   City, Country, Lat, Lng, Bio,
 *   Current Engagement, Engagement History (semicolon-separated: "Name|Status|Date;...")
 */
export async function fetchFromGoogleSheet(
  sheetUrl: string
): Promise<Facilitator[]> {
  const res = await fetch(sheetUrl, { cache: "no-store" }); // always fresh
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data
    .filter((row) => (row["Name"] || "").trim().length > 0)
    .map((row, i) => {
      const engagements: Engagement[] = [];
      const engHistory = (row["Engagement History"] || "").trim();
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

      return {
        id: String(i + 1),
        name: (row["Name"] || "").trim(),
        photoUrl: (row["Photo URL"] || "").trim(),
        linkedinUrl: (row["LinkedIn URL"] || "").trim(),
        focus: (row["Focus"] || "Facilitation").trim() as Focus,
        experienceLevel: (row["Experience Level"] || "Medium").trim() as ExperienceLevel,
        location: `${(row["City"] || "").trim()}, ${(row["Country"] || "").trim()}`,
        city: (row["City"] || "").trim(),
        country: (row["Country"] || "").trim(),
        lat: parseFloat(row["Lat"] || "0"),
        lng: parseFloat(row["Lng"] || "0"),
        bio: (row["Bio"] || "").trim(),
        engagements,
        currentEngagement: (row["Current Engagement"] || "").trim() || null,
      };
    });
}

/**
 * Converts a standard Google Sheets sharing URL to a CSV export URL.
 * Input:  https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
 * Output: https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv
 */
export function toGoogleSheetCsvUrl(shareUrl: string): string {
  const match = shareUrl.match(
    /spreadsheets\/d\/([a-zA-Z0-9_-]+)/
  );
  if (match) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  }
  return shareUrl; // already a CSV URL or other format
}
