import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Which expected env vars the production runtime can see.
 *
 * This route used to return `v.slice(0, 20)` of every secret along with
 * its exact length, behind a comment claiming it exposed "booleans only
 * (never values) so nothing sensitive leaks". It is reachable by anyone
 * with the URL and no credentials, so in practice it published the first
 * twenty characters of the Slack bot token — workspace id and all — to
 * the open internet, and would have done the same for an Anthropic key
 * the moment one was set. Lengths leak too: they narrow a guess and
 * confirm which key format is in use.
 *
 * Presence is the only thing this needs to answer. "Is the variable
 * there?" diagnoses the env-var problems this was built for; the value
 * never has to leave the runtime to do that.
 */
const EXPECTED = [
  "GOOGLE_SHEET_CSV_URL",
  "GOOGLE_ENGAGEMENTS_CSV_URL",
  "GOOGLE_AVAILABILITY_CSV_URL",
  "APPS_SCRIPT_AVAILABILITY_URL",
  "APPS_SCRIPT_AVAILABILITY_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  // Checked because lib/llm.ts prefers OpenAI when both are set:
  // an unnoticed OPENAI_API_KEY makes a correct Anthropic key look broken.
  "OPENAI_API_KEY",
  "SLACK_BOT_TOKEN",
] as const;

export async function GET() {
  const present: Record<string, boolean> = {};
  for (const k of EXPECTED) present[k] = (process.env[k] || "").length > 0;

  return NextResponse.json(
    { runtime: "node", checkedAt: new Date().toISOString(), present },
    { headers: { "cache-control": "no-store" } }
  );
}
