import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic — returns which expected env vars are visible
 * to the production runtime. Returns booleans only (never values) so
 * nothing sensitive leaks. Safe to keep around; useful any time
 * something downstream looks like an env-var issue.
 */
export async function GET() {
  const keys = [
    "GOOGLE_SHEET_CSV_URL",
    "GOOGLE_ENGAGEMENTS_CSV_URL",
    "GOOGLE_AVAILABILITY_CSV_URL",
    "APPS_SCRIPT_AVAILABILITY_URL",
    "APPS_SCRIPT_AVAILABILITY_TOKEN",
    "ANTHROPIC_API_KEY",
    "SLACK_BOT_TOKEN",
  ];
  const present: Record<string, { set: boolean; length: number; preview: string }> = {};
  for (const k of keys) {
    const v = process.env[k] || "";
    present[k] = {
      set: v.length > 0,
      length: v.length,
      // First 20 chars only — enough to spot "is this gviz or pub" without
      // exposing the entire URL.
      preview: v.length > 0 ? v.slice(0, 20) + "..." : "",
    };
  }
  return NextResponse.json({
    runtime: "node",
    deployedAt: new Date().toISOString(),
    envCheck: present,
  });
}
