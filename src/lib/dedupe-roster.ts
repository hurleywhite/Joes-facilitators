import { Facilitator } from "@/types/facilitator";

/**
 * Clean the roster as it comes off the sheet.
 *
 * The Speaking Directory returned 84 rows for what Joe counts as ~81
 * people, because three kinds of row are not a distinct person:
 *
 *   - a Google Drive URL pasted into the Name column
 *   - the same name entered twice, one row full and one nearly empty
 *     (Kate Sullivan)
 *   - a first-name-only row shadowing a fuller one, with nothing in it
 *     but a generated bio ("Vica" beside "Vica Manos", "Neel" beside
 *     "Neel G")
 *
 * The third rule is the one that can do damage, so it is deliberately
 * narrow. "Ben" is NOT Ben Andrews — he is Ben Plummer, and he has his
 * own LinkedIn URL to prove it. "Ralph" is Ralph Munsen and has no
 * fuller row at all. A first-name row is therefore only folded in when
 * it carries no identity of its own (no LinkedIn, no email) and exactly
 * one fuller row starts with that name. Anything ambiguous is left
 * alone: showing someone twice is a smaller mistake than silently
 * deleting a real facilitator.
 *
 * None of this edits the sheet. Fixing the rows at source makes this a
 * no-op, which is the intended end state.
 */

const nameKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** A Name cell that isn't a person: a pasted URL, or too short to be one. */
export function isNotAPersonName(name: string): boolean {
  const n = (name || "").trim();
  if (n.length < 2) return true;
  if (/^https?:\/\//i.test(n)) return true;
  if (/\b(?:docs|drive)\.google\.com\b/i.test(n)) return true;
  if (/^www\./i.test(n)) return true;
  // A bare domain with no spaces, e.g. "example.com/file".
  if (!n.includes(" ") && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(n)) return true;
  return false;
}

/** Does this row identify a specific human, independently of its name? */
function hasOwnIdentity(f: Facilitator): boolean {
  return Boolean(
    (f.linkedinUrl || "").trim() || (f.email || "").trim()
  );
}

/** How much a row actually carries — used to pick which copy survives. */
function richness(f: Facilitator): number {
  let n = 0;
  for (const v of [f.linkedinUrl, f.email, f.location, f.focus, f.photoUrl, f.notes]) {
    if ((v || "").toString().trim()) n++;
  }
  if ((f.bio || "").length > 80) n++;
  if (f.industryExperience?.length) n++;
  if (f.languages?.length) n++;
  if (f.engagements?.length) n++;
  return n;
}

/** Keep `keep`, but fill its blanks from `drop`; union the list fields. */
function merge(keep: Facilitator, drop: Facilitator): Facilitator {
  const pick = <K extends keyof Facilitator>(k: K): Facilitator[K] => {
    const a = keep[k];
    const b = drop[k];
    const empty = a === undefined || a === null || a === "" || a === 0;
    return empty && b !== undefined && b !== null && b !== "" ? b : a;
  };
  const union = (a?: string[], b?: string[]) =>
    Array.from(new Set([...(a || []), ...(b || [])]));

  return {
    ...keep,
    // Prefer the fuller spelling of the name ("Vica Manos" over "Vica").
    name: keep.name.trim().split(/\s+/).length >= drop.name.trim().split(/\s+/).length
      ? keep.name
      : drop.name,
    photoUrl: pick("photoUrl"),
    linkedinUrl: pick("linkedinUrl"),
    email: pick("email"),
    location: pick("location"),
    city: pick("city"),
    country: pick("country"),
    lat: keep.lat || drop.lat,
    lng: keep.lng || drop.lng,
    focus: pick("focus"),
    tier: pick("tier"),
    bio: (keep.bio || "").length >= (drop.bio || "").length ? keep.bio : drop.bio,
    notes: pick("notes"),
    demoVideoUrl: pick("demoVideoUrl"),
    languages: union(keep.languages, drop.languages),
    industryExperience: union(keep.industryExperience, drop.industryExperience),
    pastCompanies: union(keep.pastCompanies, drop.pastCompanies),
    pastRoles: union(keep.pastRoles, drop.pastRoles),
    engagements: [...(keep.engagements || []), ...(drop.engagements || [])],
    currentEngagement: keep.currentEngagement || drop.currentEngagement,
  };
}

export interface CleanResult {
  people: Facilitator[];
  /** Names dropped as not-a-person, for logging. */
  rejected: string[];
  /** "Vica → Vica Manos" pairs, for logging. */
  merged: string[];
}

export function cleanRoster(rows: Facilitator[]): CleanResult {
  const rejected: string[] = [];
  const merged: string[] = [];

  const real = rows.filter((f) => {
    if (isNotAPersonName(f.name)) {
      rejected.push(f.name);
      return false;
    }
    return true;
  });

  // 1. Exact same name — keep the richer row, fold the other into it.
  const byName = new Map<string, Facilitator>();
  for (const f of real) {
    const k = nameKey(f.name);
    const seen = byName.get(k);
    if (!seen) {
      byName.set(k, f);
      continue;
    }
    const [keep, drop] = richness(f) > richness(seen) ? [f, seen] : [seen, f];
    byName.set(k, merge(keep, drop));
    merged.push(`${drop.name} → ${keep.name}`);
  }

  // 2. A first-name-only row with no identity of its own, shadowing
  //    exactly one fuller row.
  const list = Array.from(byName.values());
  const absorbed = new Set<string>();
  for (const f of list) {
    if (absorbed.has(nameKey(f.name))) continue;
    if (f.name.trim().split(/\s+/).length !== 1) continue;
    if (hasOwnIdentity(f)) continue; // e.g. "Ben" is Ben Plummer

    const first = nameKey(f.name);
    const fuller = list.filter(
      (o) => o !== f && nameKey(o.name).startsWith(first + " ")
    );
    if (fuller.length !== 1) continue; // 0 = "Ralph"; 2+ = ambiguous

    const target = fuller[0];
    byName.set(nameKey(target.name), merge(target, f));
    absorbed.add(first);
    merged.push(`${f.name} → ${target.name}`);
  }

  const people = Array.from(byName.values()).filter(
    (f) => !absorbed.has(nameKey(f.name))
  );
  return { people, rejected, merged };
}
