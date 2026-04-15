import Papa from "papaparse";
import { Facilitator, Focus, ExperienceLevel, Engagement } from "@/types/facilitator";

/**
 * Fetches facilitator data from a published Google Sheet (CSV format).
 * The sheet must be published to the web: File → Share → Publish to web → CSV.
 *
 * Expected columns:
 *   Name, Photo URL, LinkedIn URL, Focus, Experience Level,
 *   City, Country, Lat, Lng, Bio,
 *   Current Engagement, Engagement History (semicolon-separated: "Name|Status|Date;...")
 */
export async function fetchFromGoogleSheet(
  sheetUrl: string
): Promise<Facilitator[]> {
  const res = await fetch(sheetUrl, { next: { revalidate: 300 } }); // cache 5 min
  const csv = await res.text();

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data.map((row, i) => {
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
      focus: ((row["Focus"] || "Facilitation").trim() as Focus),
      experienceLevel: ((row["Experience Level"] || "Medium").trim() as ExperienceLevel),
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
