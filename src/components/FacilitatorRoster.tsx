"use client";

import { Facilitator, AvailabilityWindow } from "@/types/facilitator";
import { ExternalLink } from "lucide-react";

/**
 * The dense view of the pool.
 *
 * The card grid shows six people per screen on a 20+ person bench, which
 * means staffing a workshop is done by scrolling and remembering. This is
 * the same data as a table: one line per person, sorted, comparable, with
 * the four things a staffing decision actually turns on — where they are,
 * what they do, when they're free, and what they know — side by side.
 *
 * Full bio and history stay one click away in the drawer.
 */

const STATUS: Record<
  string,
  { dot: string; text: string; label: string }
> = {
  Available: { dot: "bg-ok-600", text: "text-ok-700", label: "Free" },
  "On Assignment": {
    dot: "bg-warn-600",
    text: "text-warn-700",
    label: "On assignment",
  },
  Unavailable: { dot: "bg-stop-600", text: "text-stop-700", label: "Unavailable" },
};

/** Next open window from today, e.g. "thru year-end" or "Jul 3 – Sep 20". */
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
  if (w.start <= today && w.end.endsWith("-12-31")) return "thru year-end";
  if (w.start <= today) return `thru ${fmt(w.end)}`;
  return `${fmt(w.start)} – ${fmt(w.end)}`;
}

const TRAVEL: Record<string, string> = {
  Yes: "will travel",
  Domestic: "domestic only",
  No: "no travel",
};

const TIER: Record<string, string> = { High: "Top", Medium: "Mid", Low: "Low" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ f, size = 32 }: { f: Facilitator; size?: number }) {
  return f.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={f.photoUrl}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-ink-200 object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
        (e.currentTarget.nextElementSibling as HTMLElement)?.style.setProperty(
          "display",
          "flex"
        );
      }}
    />
  ) : null;
}

function AvatarFallback({ f, size = 32 }: { f: Facilitator; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: f.photoUrl ? "none" : "flex",
        fontSize: size * 0.36,
      }}
      className="shrink-0 items-center justify-center rounded-full bg-arctic-100 font-semibold text-arctic-700"
    >
      {initials(f.name)}
    </span>
  );
}

function Row({
  f,
  onOpen,
}: {
  f: Facilitator;
  onOpen: (f: Facilitator) => void;
}) {
  const st = STATUS[f.availability] ?? STATUS.Available;
  const win = nextWindow(f.availableWindows);
  const travel = f.willingToTravel ? TRAVEL[f.willingToTravel] : null;
  const done = f.engagements.filter((e) => e.status === "Completed").length;
  const inds = f.industryExperience ?? [];
  const langs = (f.languages ?? []).filter((l) => l.toLowerCase() !== "english");

  return (
    <tr
      onClick={() => onOpen(f)}
      className="group cursor-pointer border-b border-ink-100 align-middle transition-colors last:border-0 hover:bg-arctic-50/60"
    >
      {/* Person */}
      <td className="py-2.5 pl-4 pr-3">
        <div className="flex items-center gap-2.5">
          <Avatar f={f} />
          <AvatarFallback f={f} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink-900">
                {f.name}
              </span>
              {f.linkedinUrl?.startsWith("http") && (
                <a
                  href={f.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`${f.name} on LinkedIn`}
                  className="shrink-0 text-ink-300 opacity-0 transition-opacity hover:text-arctic-600 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </span>
            <span className="block truncate text-xs text-ink-500">
              {f.location || f.country || "—"}
            </span>
          </span>
        </div>
      </td>

      {/* What they do */}
      <td className="px-3 py-2.5">
        <span className="block text-sm text-ink-800">
          {f.focus ?? <span className="text-ink-400">Not set</span>}
        </span>
        <span className="block text-xs text-ink-500">
          {TIER[f.experienceLevel] ?? f.experienceLevel}
        </span>
      </td>

      {/* When they're free */}
      <td className="px-3 py-2.5">
        <span className={`flex items-center gap-1.5 text-sm ${st.text}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
          {st.label}
        </span>
        {/* Only rendered when there's something to say. An empty line on
            every row for the people who haven't filled the form in is
            noise, and it buries the rows that DO have dates. */}
        {(win || travel) && (
          <span className="tnum block text-xs text-ink-500">
            {win}
            {win && travel && <span className="text-ink-400"> · </span>}
            {travel && <span className="text-ink-400">{travel}</span>}
          </span>
        )}
      </td>

      {/* What they know. Empty cells stay empty — a column of em-dashes
          is twenty pieces of punctuation telling you nothing. */}
      <td className="hidden px-3 py-2.5 lg:table-cell">
        {inds.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {inds.slice(0, 2).map((i) => (
              <span
                key={i}
                className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700"
              >
                {i}
              </span>
            ))}
            {inds.length > 2 && (
              <span
                className="text-[11px] text-ink-500"
                title={inds.slice(2).join(", ")}
              >
                +{inds.length - 2}
              </span>
            )}
          </span>
        )}
      </td>

      {/* Languages beyond English */}
      <td className="hidden px-3 py-2.5 xl:table-cell">
        {langs.length > 0 && (
          <span className="text-xs text-ink-600">{langs.join(", ")}</span>
        )}
      </td>

      {/* Track record */}
      <td className="px-3 py-2.5 pr-4 text-right">
        {f.currentEngagement ? (
          <span className="block truncate text-xs font-medium text-ink-800">
            {f.currentEngagement}
          </span>
        ) : (
          done > 0 && (
            <span className="tnum block text-xs text-ink-500">
              {done} delivered
            </span>
          )
        )}
        {f.currentEngagement && done > 0 && (
          <span className="tnum block text-[11px] text-ink-400">
            {done} delivered
          </span>
        )}
      </td>
    </tr>
  );
}

export default function FacilitatorRoster({
  facilitators,
  onOpen,
}: {
  facilitators: Facilitator[];
  onOpen: (f: Facilitator) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th scope="col" className="eyebrow py-2 pl-4 pr-3 text-left">
                Facilitator
              </th>
              <th scope="col" className="eyebrow px-3 py-2 text-left">
                Focus
              </th>
              <th scope="col" className="eyebrow px-3 py-2 text-left">
                Availability
              </th>
              <th
                scope="col"
                className="eyebrow hidden px-3 py-2 text-left lg:table-cell"
              >
                Industries
              </th>
              <th
                scope="col"
                className="eyebrow hidden px-3 py-2 text-left xl:table-cell"
              >
                Languages
              </th>
              <th scope="col" className="eyebrow px-3 py-2 pr-4 text-right">
                Work
              </th>
            </tr>
          </thead>
          <tbody>
            {facilitators.map((f) => (
              <Row key={f.id} f={f} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
