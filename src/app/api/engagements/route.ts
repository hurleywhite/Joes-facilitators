import { NextResponse } from "next/server";
import { fetchEngagements, toEngagementsCsvUrl } from "@/data/engagements";

export const dynamic = "force-dynamic";

export async function GET() {
  const sheetUrl = process.env.GOOGLE_ENGAGEMENTS_CSV_URL;
  if (!sheetUrl) {
    // Not configured — return empty list with a hint header so the UI can
    // surface a friendly setup message.
    return NextResponse.json([], {
      headers: {
        "X-Engagements-Status": "not-configured",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  try {
    const url = toEngagementsCsvUrl(sheetUrl);
    const engagements = await fetchEngagements(url);
    return NextResponse.json(engagements, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Engagements fetch failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load engagements" },
      { status: 500 }
    );
  }
}
