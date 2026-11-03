import { Facilitator, AvailabilityWindow } from "@/types/facilitator";

/**
 * How availability is allowed to be described in the UI.
 *
 * The roster, the cards and the drawer each used to render their own
 * version of this, and all three said the same misleading thing: a green
 * dot labelled "Free" on almost every person. That came from the sheet's
 * Availability column, where 82 of 84 rows read "Available" simply
 * because nobody has ever edited the cell. Presented as a coloured status
 * light it reads as "their calendar is clear right now" — which we have
 * no way of knowing, because we don't have their calendars.
 *
 * The rule here: report what somebody actually told us, and nothing else.
 *
 *   - a date window submitted through the availability form, with how
 *     stale it is, because a claim from eight months ago is not a fact
 *   - a status a human deliberately moved off the default
 *   - otherwise nothing, and the blank is the point: it shows where the
 *     bench has never been asked
 */

const TRAVEL: Record<string, string> = {
  Yes: "will travel",
  Domestic: "domestic only",
  No: "no travel",
};

export interface StatedAvailability {
  /** The claim itself, e.g. "thru year-end · will travel". */
  line: string;
  /** When they said it, e.g. "said 12 Mar". Absent if unknown. */
  sub?: string;
}

/** Next open window from today: "thru year-end", "Jul 3 – Sep 20". */
export function nextWindow(
  windows: AvailabilityWindow[] | undefined
): string | null {
  if (!windows?.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = windows
    .filter((w) => w.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!upcoming.length) return null;
  const w = upcoming[0];
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  if (w.start <= today && w.end.endsWith("-12-31")) return "thru year-end";
  if (w.start <= today) return `thru ${fmt(w.end)}`;
  return `${fmt(w.start)} – ${fmt(w.end)}`;
}

function said(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function statedAvailability(f: Facilitator): StatedAvailability | null {
  const win = nextWindow(f.availableWindows);
  const travel = f.willingToTravel ? TRAVEL[f.willingToTravel] : null;

  if (win) {
    return {
      line: travel ? `${win} · ${travel}` : win,
      sub: f.availabilityUpdatedAt
        ? `said ${said(f.availabilityUpdatedAt)}`
        : undefined,
    };
  }
  // A status someone moved off the default is a real signal. The default
  // itself is not, so "Available" on its own returns nothing.
  if (f.availability && f.availability !== "Available") {
    return { line: f.availability };
  }
  if (travel) return { line: travel };
  return null;
}
