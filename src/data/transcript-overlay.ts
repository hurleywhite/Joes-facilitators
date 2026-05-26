import { promises as fs } from "fs";
import path from "path";
import {
  applyOverlay,
  canonicalizeName,
  FacilitatorPatch,
  OverlayStore,
} from "@/lib/overlay-merge";

/**
 * Server-side persistence layer for transcript overlay patches.
 *
 * On Vercel, /tmp is per-lambda-instance — patches written here are visible to
 * subsequent requests on the SAME warm lambda instance only. Treat this as a
 * best-effort cache; the operator's browser also stores patches in localStorage
 * (see lib/overlay-merge.ts) so they survive cold starts on the page that
 * applied them. For true cross-device durability, swap this to Vercel KV /
 * Supabase / Vercel Blob.
 */

export { applyOverlay, canonicalizeName };
export type { FacilitatorPatch, OverlayStore };

const STORE_PATH = (() => {
  if (process.env.VERCEL) {
    return "/tmp/transcript-updates.json";
  }
  return path.join(process.cwd(), ".data", "transcript-updates.json");
})();

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
