import { Facilitator, Engagement } from "@/types/facilitator";

/**
 * Pure merge logic for transcript-derived patches. No Node fs imports, so
 * this module can run in the browser (for client-side localStorage merging)
 * AND on the server (for the server-side merge in the facilitators API).
 *
 * Kept in src/lib/ rather than src/data/ to make the boundary explicit:
 * data/transcript-overlay imports from HERE for the merge function.
 */

export interface FacilitatorPatch {
  availability?: string;
  currentEngagement?: string | null;
  location?: string;
  city?: string;
  country?: string;
  bio?: string;
  languages?: string[];
  industryExperience?: string[];
  tier?: string;
  notes?: string;
  email?: string;
  website?: string;
  employmentStatus?: string;
  newEngagements?: Engagement[];
  evidence?: Record<string, string>;
  appliedAt: string;
  source: string;
}

export interface OverlayStore {
  patches: Record<string, FacilitatorPatch[]>;
}

export function canonicalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function applyOverlay(
  facilitators: Facilitator[],
  store: OverlayStore
): Facilitator[] {
  return facilitators.map((f) => {
    const patches = store.patches[canonicalizeName(f.name)];
    if (!patches || patches.length === 0) return f;

    const updated: Facilitator = { ...f };
    for (const p of patches) {
      if (p.availability) {
        const lower = p.availability.toLowerCase().trim();
        if (lower.includes("unavail")) updated.availability = "Unavailable";
        else if (lower.includes("assignment") || lower.includes("booked"))
          updated.availability = "On Assignment";
        else if (lower.includes("avail") || lower === "yes" || lower === "open")
          updated.availability = "Available";
      }
      if (p.currentEngagement !== undefined)
        updated.currentEngagement = p.currentEngagement;
      if (p.location) updated.location = p.location;
      if (p.city) updated.city = p.city;
      if (p.country) updated.country = p.country;
      if (p.bio) updated.bio = p.bio;
      if (p.languages && p.languages.length > 0)
        updated.languages = dedupeStrings([
          ...(updated.languages || []),
          ...p.languages,
        ]);
      if (p.industryExperience && p.industryExperience.length > 0)
        updated.industryExperience = dedupeStrings([
          ...(updated.industryExperience || []),
          ...p.industryExperience,
        ]);
      if (p.tier) updated.tier = p.tier;
      if (p.notes) {
        updated.notes = updated.notes
          ? `${updated.notes}\n[Transcript ${p.source}] ${p.notes}`
          : `[Transcript ${p.source}] ${p.notes}`;
      }
      if (p.email) updated.email = p.email;
      if (p.website) updated.website = p.website;
      if (p.employmentStatus) updated.employmentStatus = p.employmentStatus;
      if (p.newEngagements && p.newEngagements.length > 0) {
        const existing = new Set(
          (updated.engagements || []).map(
            (e) => `${e.name.toLowerCase()}|${e.date.toLowerCase()}`
          )
        );
        const additions = p.newEngagements.filter(
          (e) =>
            !existing.has(`${e.name.toLowerCase()}|${e.date.toLowerCase()}`)
        );
        updated.engagements = [...additions, ...(updated.engagements || [])];
      }
    }
    return updated;
  });
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.toLowerCase().trim();
    if (!seen.has(key) && key.length > 0) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/**
 * Browser-side store helpers backed by localStorage. Lets the operator's
 * patches survive serverless cold starts on the page they applied them from.
 *
 * IMPORTANT: this is per-browser. Patches applied in browser A don't show
 * up in browser B. For multi-device sharing, the patches also flow through
 * the server (/api/transcripts/apply) — but that side is best-effort on
 * Vercel's free tier (/tmp ephemeral). Move to KV/Supabase for true durability.
 */
const LOCAL_KEY = "facilitator-transcript-overlay-v1";

export function readLocalOverlay(): OverlayStore {
  if (typeof window === "undefined") return { patches: {} };
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return { patches: {} };
    const parsed = JSON.parse(raw) as OverlayStore;
    if (!parsed.patches || typeof parsed.patches !== "object") {
      return { patches: {} };
    }
    return parsed;
  } catch {
    return { patches: {} };
  }
}

export function addLocalPatch(
  facilitatorName: string,
  patch: FacilitatorPatch
): void {
  if (typeof window === "undefined") return;
  const store = readLocalOverlay();
  const key = canonicalizeName(facilitatorName);
  if (!store.patches[key]) store.patches[key] = [];
  store.patches[key].push(patch);
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

export function clearLocalOverlay(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_KEY);
}
