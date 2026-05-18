import Papa from "papaparse";
import {
  AvailabilityWindow,
  TravelWillingness,
} from "@/types/facilitator";

/**
 * One row from the "Availability" tab of the Pool Data spreadsheet.
 * Created by the facilitator-facing form at /availability via the
 * Apps Script web app.
 *
 * Schema:
 *   Name                 — full name, must match the Speaking Directory
 *   Submitted At         — ISO timestamp written by Apps Script
 *   Mode                 — "rest_of_year" | "quarter" | "blocked"
 *   Year                 — e.g. 2026
 *   Quarter              — 1..4 (only for mode=quarter)
 *   Blocked Ranges       — semicolon-separated "YYYY-MM-DD:YYYY-MM-DD" pairs
 *                          (only for mode=blocked, treated as DATES THEY ARE
 *                          UNAVAILABLE — the app inverts to availability
 *                          windows from today through end of year minus those)
 *   Willing To Travel    — "Yes" | "Domestic" | "No"
 *   Notes                — optional free text
 */
type RawRow = Record<string, string>;

export interface FacilitatorAvailability {
  name: string;
  submittedAt: string;
  windows: AvailabilityWindow[];
  willingToTravel: TravelWillingness;
  notes?: string;
}

/**
 * Configure with GOOGLE_AVAILABILITY_CSV_URL — the published-CSV URL of
 * the "Availability" tab. We accept either a direct gviz CSV URL or a
 * spreadsheet share URL with `?gid=<n>` and convert to gviz.
 */
export async function fetchAvailability(
  sheetUrl: string
): Promise<FacilitatorAvailability[]> {
  const res = await fetch(sheetUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch availability sheet: ${res.status} ${res.statusText}`
    );
  }
  const csv = await res.text();
  const parsed = Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  // Group by name + take the most recent submission per facilitator. The
  // sheet keeps a full history (every submission appends a new row) but the
  // app only cares about the latest answer.
  const latestByName = new Map<string, FacilitatorAvailability>();

  for (const row of parsed.data) {
    const name = (row["Name"] || "").trim();
    if (!name) continue;
    const submittedAt = (row["Submitted At"] || "").trim();
    const record = buildAvailability(row, name, submittedAt);
    if (!record) continue;

    const existing = latestByName.get(name.toLowerCase());
    if (!existing || record.submittedAt > existing.submittedAt) {
      latestByName.set(name.toLowerCase(), record);
    }
  }

  return Array.from(latestByName.values());
}

function buildAvailability(
  row: RawRow,
  name: string,
  submittedAt: string
): FacilitatorAvailability | null {
  const mode = (row["Mode"] || "").toLowerCase().trim();
  const year = parseInt(row["Year"] || "", 10) || new Date().getFullYear();
  const willingToTravel = parseTravel(row["Willing To Travel"] || "");
  const notes = (row["Notes"] || "").trim();

  let windows: AvailabilityWindow[] = [];
  if (mode === "rest_of_year" || mode === "rest-of-year" || mode === "rest of year") {
    // From today (or Jan 1 if year is in the future) through Dec 31 of `year`.
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const startOfYear = `${year}-01-01`;
    const start = year > today.getFullYear() ? startOfYear : todayIso;
    windows = [{ start, end: `${year}-12-31` }];
  } else if (mode === "quarter") {
    // Cell can hold a single quarter ("3") or a multi-select list
    // ("2;3" or "1, 4"). Each unique quarter becomes one window.
    const qs = (row["Quarter"] || "")
      .split(/[;,|]/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((q) => q >= 1 && q <= 4);
    const uniq = Array.from(new Set(qs));
    windows = uniq.map((q) => quarterWindow(year, q));
  } else if (mode === "blocked" || mode === "block") {
    const blocked = parseRanges(row["Blocked Ranges"] || "");
    windows = inverse(blocked, year);
  }

  if (!windows.length) return null;
  return { name, submittedAt, windows, willingToTravel, notes };
}

function parseTravel(raw: string): TravelWillingness {
  const v = raw.toLowerCase().trim();
  if (v === "yes" || v === "y") return "Yes";
  if (v === "no" || v === "n") return "No";
  if (v.startsWith("dom")) return "Domestic";
  return "";
}

function quarterWindow(year: number, q: number): AvailabilityWindow {
  // Q1: Jan-Mar; Q2: Apr-Jun; Q3: Jul-Sep; Q4: Oct-Dec
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseRanges(raw: string): AvailabilityWindow[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [start, end] = r.split(":").map((s) => s.trim());
      if (!start) return null;
      return { start, end: end || start };
    })
    .filter((w): w is AvailabilityWindow => w !== null);
}

/**
 * Given a list of BLOCKED windows, return AVAILABLE windows from today
 * through end of `year`. So if I block May 15-20 and June 1-15 in 2026,
 * the app sees: [today→May 14], [May 21→May 31], [June 16→Dec 31].
 */
function inverse(blocked: AvailabilityWindow[], year: number): AvailabilityWindow[] {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const start = year > today.getFullYear() ? `${year}-01-01` : todayIso;
  const end = `${year}-12-31`;

  const sorted = [...blocked].sort((a, b) => a.start.localeCompare(b.start));
  const out: AvailabilityWindow[] = [];
  let cursor = start;
  for (const b of sorted) {
    if (b.end < cursor) continue;
    if (b.start > end) break;
    if (b.start > cursor) {
      out.push({ start: cursor, end: dayBefore(b.start) });
    }
    cursor = dayAfter(b.end);
    if (cursor > end) break;
  }
  if (cursor <= end) out.push({ start: cursor, end });
  return out.filter((w) => w.start <= w.end);
}

function dayBefore(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dayAfter(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function toAvailabilityCsvUrl(input: string): string {
  if (!input) return input;
  if (input.includes("/gviz/tq")) return input;
  const idMatch = input.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return input;
  const id = idMatch[1];
  const gidMatch = input.match(/[?#&]gid=(\d+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gidParam}`;
}

/**
 * Returns true if `iso` (YYYY-MM-DD) falls within any availability
 * window. Inclusive on both ends. Used by the chat path to answer
 * "who's available on X date?".
 */
export function isAvailableOn(
  windows: AvailabilityWindow[] | undefined,
  iso: string
): boolean {
  if (!windows || windows.length === 0) return false;
  return windows.some((w) => iso >= w.start && iso <= w.end);
}
