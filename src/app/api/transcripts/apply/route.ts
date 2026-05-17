import { NextResponse } from "next/server";
import { addPatch, FacilitatorPatch, readStore, clearAllPatches } from "@/data/transcript-overlay";
import { Engagement } from "@/types/facilitator";

export const dynamic = "force-dynamic";

interface ApplyRequest {
  // For each transcript the user confirmed, a patch keyed by the facilitator name
  // they ultimately chose (which may differ from the auto-matched one).
  applications: {
    facilitatorName: string;
    source: string;
    patch: {
      availability?: string | null;
      currentEngagement?: string | null;
      location?: string | null;
      bio?: string | null;
      languages?: string[] | null;
      industryExperience?: string[] | null;
      tier?: string | null;
      notes?: string | null;
      email?: string | null;
      website?: string | null;
      employmentStatus?: string | null;
      newEngagements?: Engagement[] | null;
      evidence?: Record<string, string>;
    };
  }[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyRequest;
    if (!body.applications || !Array.isArray(body.applications)) {
      return NextResponse.json(
        { error: "Request body must include an `applications` array." },
        { status: 400 }
      );
    }

    let applied = 0;
    for (const a of body.applications) {
      if (!a.facilitatorName) continue;

      const patch: FacilitatorPatch = {
        appliedAt: new Date().toISOString(),
        source: a.source || "transcript",
      };

      if (a.patch.availability) patch.availability = a.patch.availability;
      if (a.patch.currentEngagement !== undefined && a.patch.currentEngagement !== null)
        patch.currentEngagement = a.patch.currentEngagement;
      if (a.patch.location) patch.location = a.patch.location;
      if (a.patch.bio) patch.bio = a.patch.bio;
      if (a.patch.languages && a.patch.languages.length > 0)
        patch.languages = a.patch.languages;
      if (a.patch.industryExperience && a.patch.industryExperience.length > 0)
        patch.industryExperience = a.patch.industryExperience;
      if (a.patch.tier) patch.tier = a.patch.tier;
      if (a.patch.notes) patch.notes = a.patch.notes;
      if (a.patch.email) patch.email = a.patch.email;
      if (a.patch.website) patch.website = a.patch.website;
      if (a.patch.employmentStatus) patch.employmentStatus = a.patch.employmentStatus;
      if (a.patch.newEngagements && a.patch.newEngagements.length > 0)
        patch.newEngagements = a.patch.newEngagements;
      if (a.patch.evidence) patch.evidence = a.patch.evidence;

      await addPatch(a.facilitatorName, patch);
      applied++;
    }

    return NextResponse.json({ applied });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Apply failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Diagnostics — returns the current overlay store
  const store = await readStore();
  return NextResponse.json(store);
}

export async function DELETE() {
  // Clear all overlays — useful for testing
  await clearAllPatches();
  return NextResponse.json({ ok: true });
}
