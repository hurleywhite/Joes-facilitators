import { promises as fs } from "fs";
import path from "path";
import { Facilitator, Engagement } from "@/types/facilitator";

/**
 * Persistent overlay of transcript-derived updates that get merged on top of
 * the Google Sheet read. The sheet is the source of truth; this overlay lets
 * us reflect updates immediately in the platform without requiring sheet
 * write credentials.
 *
 * Storage: JSON file under `.data/transcript-updates.json` (gitignored).
 * Note: on Vercel's read-only filesystem this won't persist across deploys —
 * the file lives in /tmp at runtime. For now this is fine; user can export
 * the proposed changes as CSV to keep the sheet in sync.
 */

export interface FacilitatorPatch {
  // Each field is optional — only set fields are applied.
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
  // Engagements to append (deduped by name)
  newEngagements?: Engagement[];
  // Evidence quotes from the transcript that justify each field, keyed by field name
  evidence?: Record<string, string>;
  // When this patch was applied
  appliedAt: string;
  // Which transcript file this came from (display only)
  source: string;
}

export interface OverlayStore {
  // Keyed by canonicalized facilitator name (lowercased + trimmed)
  patches: Record<string, FacilitatorPatch[]>;
}

const STORE_PATH = (() => {
  // Vercel: only /tmp is writable
  if (process.env.VERCEL) {
    return "/tmp/transcript-updates.json";
  }
  return path.join(process.cwd(), ".data", "transcript-updates.json");
})();

export function canonicalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  await fs.mkdir(dir, { recursive: true });
}

export async function readStore(): Promise<OverlayStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as OverlayStore;
    if (!parsed.patches || typeof parsed.patches !== "object") {
      return { patches: {} };
    }
    return parsed;
  } catch {
    return { patches: {} };
  }
}

export async function writeStore(store: OverlayStore): Promise<void> {
  await ensureDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function addPatch(
  facilitatorName: string,
  patch: FacilitatorPatch
): Promise<void> {
  const store = await readStore();
  const key = canonicalizeName(facilitatorName);
  if (!store.patches[key]) store.patches[key] = [];
  store.patches[key].push(patch);
  await writeStore(store);
}

export async function clearPatchesFor(facilitatorName: string): Promise<void> {
  const store = await readStore();
  const key = canonicalizeName(facilitatorName);
  delete store.patches[key];
  await writeStore(store);
}

export async function clearAllPatches(): Promise<void> {
  await writeStore({ patches: {} });
}

/**
 * Merges all overlay patches onto the facilitator list. Later patches win
 * for scalar fields. Engagements are appended (deduped by name+date).
 */
export function applyOverlay(
  facilitators: Facilitator[],
  store: OverlayStore
): Facilitator[] {
  return facilitators.map((f) => {
    const patches = store.patches[canonicalizeName(f.name)];
    if (!patches || patches.length === 0) return f;

    let updated: Facilitator = { ...f };
    for (const p of patches) {
      if (p.availability) {
        // Coerce overlay strings to the Availability enum the UI expects
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
        updated.languages = dedupeStrings([...(updated.languages || []), ...p.languages]);
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
          (e) => !existing.has(`${e.name.toLowerCase()}|${e.date.toLowerCase()}`)
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
