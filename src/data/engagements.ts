import Papa from "papaparse";
import { EngagementRecord, EngagementRecordStatus } from "@/types/facilitator";

/**
 * Fetches the "Engagements" tab of the Pool Data spreadsheet.
 *
 * Configure with GOOGLE_ENGAGEMENTS_CSV_URL — either:
 *   - the share URL of the spreadsheet plus `?gid=<engagements_tab_gid>` and
 *     this file converts it to gviz CSV; or
 *   - a direct gviz CSV URL (e.g.
 *     https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&gid=<gid>).
 *
 * Expected columns (header row 1, case-insensitive aliases supported):
 *   Engagement | Client | Status | Start Date | End Date | Location |
 *   Type | Facilitators | Value | Notes
 *
 * Status values recognized:
 *   Active / Ongoing / In Progress    → Active
 *   Upcoming / Scheduled / Booked     → Upcoming
 *   Completed / Done / Delivered      → Completed
 *   Cancelled / Canceled              → Cancelled
 *   On Hold / Paused / Postponed      → On Hold
 */
export async function fetchEngagements(
  sheetUrl: string
): Promise<EngagementRecord[]> {
  const res = await fetch(sheetUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch engagements sheet: ${res.status} ${res.statusText}`
    );
  }
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data
    .map((row, i) => buildEngagementRecord(row, i))
    .filter((e): e is EngagementRecord => e !== null);
}

function buildEngagementRecord(
  row: Record<string, string>,
  index: number
): EngagementRecord | null {
  const name = getCol(row, [
    "Engagement",
    "Engagement Name",
    "Workshop",
    "Workshop Name",
    "Title",
    "Name",
  ]);
  const client = getCol(row, ["Client", "Organization", "Org", "Account", "Company"]);
  // Skip blank / sentinel rows entirely.
  if (!name && !client) return null;

  return {
    id: String(index + 1),
    name: name || "(untitled)",
    client: client || "(unknown)",
    status: parseStatus(getCol(row, ["Status", "Stage"])),
    startDate: getCol(row, ["Start Date", "Start", "Date", "From"]),
    endDate: getCol(row, ["End Date", "End", "To", "Through"]),
    location: getCol(row, ["Location", "Where", "Venue"]),
    type: getCol(row, ["Type", "Engagement Type", "Format"]),
    facilitators: splitList(
      getCol(row, [
        "Facilitators",
        "Facilitator",
        "Facilitator(s)",
        "Trainers",
        "Team",
      ])
    ),
    valueUSD: getCol(row, ["Value", "Value (USD)", "Value USD", "Price", "Revenue"]),
    notes: getCol(row, ["Notes", "Internal Notes", "Notes/Comments"]),
  };
}

function parseStatus(raw: string): EngagementRecordStatus {
  if (!raw) return "Upcoming";
  const v = raw.toLowerCase();
  if (/(^|\b)(active|ongoing|in[\s-]?progress|live|running|currently)/.test(v))
    return "Active";
  if (/(^|\b)(upcoming|scheduled|booked|future|planned|next)/.test(v))
    return "Upcoming";
  if (/(^|\b)(completed|done|delivered|finished|past|closed)/.test(v))
    return "Completed";
  if (/(^|\b)(cancel)/.test(v)) return "Cancelled";
  if (/(^|\b)(hold|paused|postpone|pending)/.test(v)) return "On Hold";
  // Unknown text — treat as Upcoming so it surfaces, not Completed which would hide it
  return "Upcoming";
}

function splitList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const PLACEHOLDER_VALUES = new Set(["—", "-", "n/a", "tbd", "?", ""]);

function getCol(row: Record<string, string>, possibleNames: string[]): string {
  for (const name of possibleNames) {
    const val = row[name];
    if (val !== undefined && val !== null) {
      const trimmed = val.trim();
      if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return "";
      return trimmed;
    }
  }
  return "";
}

/**
 * Accepts:
 *   - A spreadsheet share URL with `?gid=<n>` or `#gid=<n>` → converts to gviz CSV.
 *   - A direct gviz CSV URL → returned unchanged.
 *   - A spreadsheet URL with no gid → defaults to the first tab.
 */
export function toEngagementsCsvUrl(input: string): string {
  if (!input) return input;
  if (input.includes("/gviz/tq")) return input;

  const idMatch = input.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return input;
  const id = idMatch[1];

  const gidMatch = input.match(/[?#&]gid=(\d+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gidParam}`;
}
