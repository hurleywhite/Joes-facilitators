import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Forwards a CONFIRMED edit action to the Apps Script web app, which
 * applies it to the spreadsheet. The /parse step never writes — only
 * this route does, and only after the user clicked Confirm in the UI.
 *
 * Configure with APPS_SCRIPT_AVAILABILITY_URL — the same web-app URL
 * we use for availability submissions. The Apps Script doPost
 * dispatches by `kind`. Optional shared secret via
 * APPS_SCRIPT_AVAILABILITY_TOKEN keeps random POSTs out.
 */

type Action = { kind: string; [k: string]: unknown };

export async function POST(req: Request) {
  let body: { action?: Action; actions?: Action[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept either the legacy single-action shape OR a batch of actions.
  const actions: Action[] = body.actions
    ? body.actions
    : body.action
      ? [body.action]
      : [];
  if (actions.length === 0) {
    return NextResponse.json(
      { error: "Missing actions" },
      { status: 400 }
    );
  }

  const allowed = new Set([
    "add_engagement",
    "add_facilitator_to_engagement",
    "update_engagement_status",
    "add_facilitator_note",
    "update_facilitator_field",
  ]);
  for (const a of actions) {
    if (!a || typeof a.kind !== "string" || !allowed.has(a.kind)) {
      return NextResponse.json(
        { error: `Unknown action kind: ${a?.kind}` },
        { status: 400 }
      );
    }
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

  // Single round-trip — Apps Script doPost handles kind=edit_batch by
  // looping applyEdit_ over edits[] and returning per-action results.
  const payload = {
    kind: "edit_batch",
    edits: actions,
    submittedAt: new Date().toISOString(),
    token: process.env.APPS_SCRIPT_AVAILABILITY_TOKEN || "",
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apps Script returned ${resp.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return NextResponse.json({ ok: true, result: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to forward" },
      { status: 502 }
    );
  }
}
