/**
 * Parse a date the way someone types it when they're in a hurry.
 *
 * A native date input makes you fill three boxes in the browser's locale
 * order to say "July 5th". You already know the date; you just want to
 * type it. So this takes "July 5th", "5 Jul", "7/5", "2027-07-05" and
 * anything close to those.
 *
 * When no year is given it resolves to the NEXT time that date comes
 * round, which is almost always what's meant when you're booking
 * someone. Asked on 3 November 2026, "November 20th" is 2026 (still
 * ahead) and "July 5th" is 2027 (this year's has gone).
 *
 * Returns an ISO yyyy-mm-dd string, or null if it can't tell.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Days in a month, honouring leap years. */
function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The next year in which month/day is still ahead of (or equal to) today. */
function nextOccurrence(month: number, day: number, today: Date): number {
  const y = today.getUTCFullYear();
  const thisYear = Date.UTC(y, month - 1, day);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  return thisYear >= todayUtc ? y : y + 1;
}

export function parseLooseDate(
  input: string,
  today: Date = new Date()
): string | null {
  const raw = (input || "").trim().toLowerCase();
  if (!raw) return null;

  // Strip ordinal suffixes and filler: "July 5th," -> "july 5"
  const s = raw
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,.]/g, " ")
    .replace(/\bof\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const valid = (y: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? iso(y, m, d) : null;

  // 2027-07-05
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  // 7/5/2027 or 7-5-27 — month first, matching the app's other inputs
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[1], +m[2]);
  }

  // 7/5 — no year, so take the next one
  m = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const mo = +m[1];
    const d = +m[2];
    if (mo < 1 || mo > 12) return null;
    return valid(nextOccurrence(mo, d, today), mo, d);
  }

  const monthNames = Object.keys(MONTHS).join("|");

  // july 5 2027 / july 5
  m = s.match(new RegExp(`^(${monthNames}) (\\d{1,2})(?: (\\d{4}))?$`));
  if (m) {
    const mo = MONTHS[m[1]];
    const d = +m[2];
    const y = m[3] ? +m[3] : nextOccurrence(mo, d, today);
    return valid(y, mo, d);
  }

  // 5 july 2027 / 5 july
  m = s.match(new RegExp(`^(\\d{1,2}) (${monthNames})(?: (\\d{4}))?$`));
  if (m) {
    const mo = MONTHS[m[2]];
    const d = +m[1];
    const y = m[3] ? +m[3] : nextOccurrence(mo, d, today);
    return valid(y, mo, d);
  }

  return null;
}

/** "Mon 5 Jul 2027" — shown back so a typo is obvious before you send. */
export function describeIso(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
