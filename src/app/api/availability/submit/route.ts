import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Receives a submission from the public /availability form and forwards
 * it to the Google Apps Script web app, which appends a row to the
 * "Availability" tab of the Pool Data spreadsheet.
 *
 * Why we proxy through Vercel instead of letting the form POST directly
 * to the Apps Script URL:
 *   1. Apps Script web apps redirect through google.com login pages on
 *      anonymous CORS preflights — the proxy keeps the browser request
 *      simple.
 *   2. The Apps Script URL stays in a Vercel env var rather than being
 *      embedded in the public client bundle.
 *   3. We can validate / shape the payload before it touches the sheet.
 *
 * Configure with APPS_SCRIPT_AVAILABILITY_URL in Vercel env. Format:
 *   https://script.google.com/macros/s/AKfy.../exec
 *
 * Optional shared-secret APPS_SCRIPT_AVAILABILITY_TOKEN to prevent random
 * internet POSTs from writing to the sheet — Apps Script doPost compares
 * request.token to its own ScriptProperties value.
 */

type SubmitPayload = {
  firstName: string;
  lastName: string;
  mode: "rest_of_year" | "quarter" | "blocked";
  year: number;
  quarter?: number;
  blockedRanges?: Array<{ start: string; end: string }>;
  willingToTravel: "Yes" | "Domestic" | "No";
  notes?: string;
};

export async function POST(req: Request) {
  let body: SubmitPayload;
  try {
    body = (await req.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Light validation — enough to keep junk out of the sheet.
  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return NextResponse.json(
      { error: "First and last name are required." },
      { status: 400 }
    );
  }
  if (!["rest_of_year", "quarter", "blocked"].includes(body.mode)) {
    return NextResponse.json({ error: "Invalid availability mode." }, { status: 400 });
  }
  if (body.mode === "quarter" && !(body.quarter && body.quarter >= 1 && body.quarter <= 4)) {
    return NextResponse.json(
      { error: "Quarter is required and must be 1-4 when mode=quarter." },
      { status: 400 }
    );
  }
  if (body.mode === "blocked" && (!body.blockedRanges || body.blockedRanges.length === 0)) {
    return NextResponse.json(
      { error: "At least one blocked range is required when mode=blocked." },
      { status: 400 }
    );
  }
  if (!["Yes", "Domestic", "No"].includes(body.willingToTravel)) {
    return NextResponse.json(
      { error: "willingToTravel must be Yes / Domestic / No." },
      { status: 400 }
    );
  }

  const url = process.env.APPS_SCRIPT_AVAILABILITY_URL;
  if (!url) {
    return NextResponse.json(
      {
        error:
          "Server not configured: APPS_SCRIPT_AVAILABILITY_URL missing. " +
          "Deploy the Apps Script as a web app and set the URL in Vercel env.",
      },
      { status: 500 }
    );
  }

  const payload = {
    ...body,
    name: `${body.firstName.trim()} ${body.lastName.trim()}`,
    submittedAt: new Date().toISOString(),
    token: process.env.APPS_SCRIPT_AVAILABILITY_TOKEN || "",
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Apps Script web apps redirect through googleusercontent.com — let
      // fetch follow it.
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apps Script returned ${resp.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to forward" },
      { status: 502 }
    );
  }
}
