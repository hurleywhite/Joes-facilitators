import { NextResponse } from "next/server";
import { fetchFromGoogleSheet } from "@/data/sheets";
import { dummyFacilitators } from "@/data/dummy-facilitators";

export async function GET() {
  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;

  // If a Google Sheet URL is configured, fetch from it; otherwise use dummy data
  if (sheetUrl) {
    try {
      const facilitators = await fetchFromGoogleSheet(sheetUrl);
      if (facilitators.length > 0) {
        return NextResponse.json(facilitators);
      }
    } catch (err) {
      console.error("Failed to fetch from Google Sheet, falling back to dummy data:", err);
    }
  }

  return NextResponse.json(dummyFacilitators);
}
