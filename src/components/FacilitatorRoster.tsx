"use client";

import { Facilitator } from "@/types/facilitator";
import { statedAvailability } from "@/lib/availability-display";
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
  selected,
  onToggle,
}: {
  f: Facilitator;
  onOpen: (f: Facilitator) => void;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const avail = statedAvailability(f);
  const done = f.engagements.filter((e) => e.status === "Completed").length;
  const inds = f.industryExperience ?? [];
  const langs = (f.languages ?? []).filter((l) => l.toLowerCase() !== "english");

  return (
    <tr
      onClick={() => onOpen(f)}
      className={`group cursor-pointer border-b border-ink-100 align-middle transition-colors last:border-0 ${
        selected ? "bg-arctic-50" : "hover:bg-arctic-50/60"
      }`}
    >
      <td className="w-9 pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(f.id)}
          aria-label={`Select ${f.name}`}
          className="h-3.5 w-3.5 cursor-pointer accent-arctic-600"
        />
      </td>

      {/* Person */}
      <td className="py-2.5 pl-2 pr-3">
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

      {/* What they've told us. Blank when that's nothing — see stated(). */}
      <td className="px-3 py-2.5">
        {avail && (
          <>
            <span className="tnum block text-sm text-ink-800">{avail.line}</span>
            {avail.sub && (
              <span className="block text-xs text-ink-400">{avail.sub}</span>
            )}
          </>
        )}
      </td>

      {/* What they know. All of it.
          This used to cut off at two with a "+5", which hid 52 of the 139
          industry tags in the pool — 37% of exactly the information you
          filter and staff on. Industry is the column people scan to answer
          "who has done this before", so a row that wraps is cheaper than a
          tag you never see. Empty cells stay empty. */}
      <td className="hidden px-3 py-2.5 lg:table-cell">
        {inds.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            {inds.map((i) => (
              <span
                key={i}
                className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700"
              >
                {i}
              </span>
            ))}
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
      <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right">
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
  selected,
  onToggle,
  onToggleAll,
}: {
  facilitators: Facilitator[];
  onOpen: (f: Facilitator) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
}) {
  const ids = facilitators.map((f) => f.id);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = !allOn && ids.some((id) => selected.has(id));
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              <th scope="col" className="w-9 pl-4 pr-0">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={() => onToggleAll(ids, !allOn)}
                  aria-label={allOn ? "Clear selection" : "Select everyone shown"}
                  className="h-3.5 w-3.5 cursor-pointer accent-arctic-600"
                />
              </th>
              <th scope="col" className="eyebrow py-2 pl-2 pr-3 text-left">
                Facilitator
              </th>
              <th scope="col" className="eyebrow px-3 py-2 text-left">
                Focus
              </th>
              {/* "Availability" promised a live answer. This column only
                  ever holds what someone told us, so it says so. */}
              <th
                scope="col"
                className="eyebrow w-[11%] px-3 py-2 text-left"
                title="What the person has told us — a window they submitted, or a status someone set by hand. Blank means nobody has asked them."
              >
                Told us
              </th>
              <th
                scope="col"
                className="eyebrow hidden w-[36%] px-3 py-2 text-left lg:table-cell"
              >
                Industries
              </th>
              <th
                scope="col"
                className="eyebrow hidden w-[12%] px-3 py-2 text-left xl:table-cell"
              >
                Languages
              </th>
              <th scope="col" className="eyebrow w-[10%] whitespace-nowrap px-3 py-2 pr-4 text-right">
                Work
              </th>
            </tr>
          </thead>
          <tbody>
            {facilitators.map((f) => (
              <Row
                key={f.id}
                f={f}
                onOpen={onOpen}
                selected={selected.has(f.id)}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
