"use client";

import { Facilitator, AvailabilityWindow } from "@/types/facilitator";
import { ExternalLink, PlayCircle } from "lucide-react";

/**
 * Card view of one facilitator.
 *
 * This component used to reach for twelve different hues — blue, emerald,
 * purple, amber, sky, cyan, rose, indigo, green, yellow, red, grey — to
 * distinguish a focus from a tier from a language from an industry. None
 * of those colours meant anything, so none of them helped you read the
 * card. Everything is neutral now except availability, which is the one
 * genuine state. Hierarchy comes from size, weight and order instead.
 */

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  Available: { dot: "bg-ok-600", text: "text-ok-700", label: "Free" },
  "On Assignment": {
    dot: "bg-warn-600",
    text: "text-warn-700",
    label: "On assignment",
  },
  Unavailable: {
    dot: "bg-stop-600",
    text: "text-stop-700",
    label: "Unavailable",
  },
};

const TRAVEL: Record<string, string> = {
  Yes: "will travel",
  Domestic: "domestic only",
  No: "no travel",
};

const TIER: Record<string, string> = { High: "Top", Medium: "Mid", Low: "Low" };

function nextWindow(windows: AvailabilityWindow[] | undefined): string | null {
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
  if (w.start <= today && w.end.endsWith("-12-31")) return "free thru year-end";
  if (w.start <= today) return `free thru ${fmt(w.end)}`;
  return `free ${fmt(w.start)} – ${fmt(w.end)}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Neutral chip. The only chip style in the app. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700">
      {children}
    </span>
  );
}

export default function FacilitatorCard({
  f,
  onOpen,
}: {
  f: Facilitator;
  onOpen?: (f: Facilitator) => void;
}) {
  const st = STATUS[f.availability] ?? STATUS.Available;
  const win = nextWindow(f.availableWindows);
  const travel = f.willingToTravel ? TRAVEL[f.willingToTravel] : null;
  const done = f.engagements.filter((e) => e.status === "Completed").length;
  const langs = (f.languages ?? []).filter((l) => l.toLowerCase() !== "english");
  const inds = f.industryExperience ?? [];

  return (
    <article
      onClick={() => onOpen?.(f)}
      className={`flex flex-col rounded-lg border border-ink-200 bg-white p-4 transition-colors ${
        onOpen ? "cursor-pointer hover:border-arctic-300 hover:bg-arctic-50/40" : ""
      }`}
    >
      {/* Identity */}
      <div className="flex items-start gap-3">
        {f.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.photoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-ink-200 object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-arctic-100 text-lg font-semibold text-arctic-700">
            {initials(f.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-snug text-ink-900">
              {f.name}
            </h3>
            {f.linkedinUrl?.startsWith("http") && (
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`${f.name} on LinkedIn`}
                className="shrink-0 text-ink-400 transition-colors hover:text-arctic-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="truncate text-xs text-ink-500">
            {f.location || f.country || "Location not set"}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            {f.focus ?? "Focus not set"}
            <span className="text-ink-300"> · </span>
            {TIER[f.experienceLevel] ?? f.experienceLevel} tier
          </p>
        </div>
      </div>

      {/* Availability — the one thing on this card allowed a colour. */}
      <p className={`mt-3 flex flex-wrap items-center gap-1.5 text-xs ${st.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
        <span className="font-medium">{st.label}</span>
        {win && <span className="tnum text-ink-600">· {win}</span>}
        {travel && <span className="text-ink-500">· {travel}</span>}
      </p>

      {f.bio && (
        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-ink-600">
          {f.bio}
        </p>
      )}

      {(inds.length > 0 || langs.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {inds.slice(0, 3).map((i) => (
            <Chip key={`i-${i}`}>{i}</Chip>
          ))}
          {inds.length > 3 && (
            <span
              className="self-center text-[11px] text-ink-500"
              title={inds.slice(3).join(", ")}
            >
              +{inds.length - 3}
            </span>
          )}
          {langs.map((l) => (
            <Chip key={`l-${l}`}>{l}</Chip>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
        <span className="tnum truncate text-ink-500">
          {f.currentEngagement
            ? `On ${f.currentEngagement}`
            : done
              ? `${done} delivered`
              : "No engagements yet"}
        </span>
        {f.demoVideoUrl && (
          <a
            href={f.demoVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-1 text-ink-600 transition-colors hover:text-arctic-700"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Demo
          </a>
        )}
      </div>
    </article>
  );
}
