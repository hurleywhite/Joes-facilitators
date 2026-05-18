"use client";

import { useState, useMemo } from "react";
import { Facilitator } from "@/types/facilitator";
import {
  Calendar,
  Plane,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";

/**
 * 6-month availability timeline.
 *
 * Layout: CSS grid `220px sidebar + 6 equal month columns`. The header
 * row uses the same grid so column boundaries line up perfectly with
 * each facilitator's track below. Green segments inside the track are
 * absolutely positioned against the 6-column timeline area (a wrapper
 * with `position: relative` spanning grid columns 2..end), so segment
 * left/width are simple percentages of the visible timeline — no
 * percentage-of-calc fragility.
 *
 * Click a row → opens the FacilitatorDrawer (handler delegated to parent).
 */
export default function CalendarView({
  facilitators,
  onPickFacilitator,
}: {
  facilitators: Facilitator[];
  onPickFacilitator?: (f: Facilitator) => void;
}) {
  const MONTHS = 6;
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const trackStartIso = isoDate(anchor);
  const trackEndIso = isoDate(
    new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + MONTHS, 0))
  );
  const totalDays = daysBetween(trackStartIso, trackEndIso) + 1;
  const todayIso = isoDate(new Date());

  const rows = useMemo(() => {
    return facilitators
      .filter((f) =>
        (f.availableWindows || []).some(
          (w) => w.end >= trackStartIso && w.start <= trackEndIso
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [facilitators, trackStartIso, trackEndIso]);

  const months = Array.from({ length: MONTHS }, (_, i) => {
    const monthStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1)
    );
    return {
      label: monthStart.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      year: monthStart.getUTCFullYear(),
    };
  });

  const todayPct =
    todayIso >= trackStartIso && todayIso <= trackEndIso
      ? (daysBetween(trackStartIso, todayIso) / totalDays) * 100
      : null;

  const rangeLabel = `${months[0].label} ${months[0].year} – ${months[MONTHS - 1].label} ${months[MONTHS - 1].year}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {rangeLabel}
            </h3>
            <div className="text-[11px] text-gray-500">
              {rows.length} facilitator{rows.length === 1 ? "" : "s"} with declared availability
              {todayPct !== null && (
                <span className="ml-1.5 text-indigo-600">· today highlighted</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() =>
              setAnchor(
                (a) =>
                  new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1))
              )
            }
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setAnchor(
                new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
              );
            }}
            className="text-xs text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
          >
            Today
          </button>
          <button
            onClick={() =>
              setAnchor(
                (a) =>
                  new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1))
              )
            }
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Month-header row — uses the same grid as the body rows so
          column boundaries align with the green segments below. */}
      <div className="grid grid-cols-[220px_repeat(6,minmax(0,1fr))] bg-gray-50 border-b border-gray-100">
        <div className="border-r border-gray-200" />
        {months.map((m, i) => (
          <div
            key={i}
            className={`text-[11px] font-medium text-gray-600 px-2 py-2 ${
              i === 0 ? "" : "border-l border-gray-200"
            }`}
          >
            <span className="block">{m.label}</span>
            <span className="block text-gray-400 text-[10px]">{m.year}</span>
          </div>
        ))}
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <EmptyState months={months} />
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((f) => (
            <Row
              key={f.id}
              f={f}
              trackStartIso={trackStartIso}
              totalDays={totalDays}
              todayPct={todayPct}
              onClick={onPickFacilitator}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm bg-emerald-500/80" />
          Available
        </div>
        <div className="flex items-center gap-1.5">
          <Plane className="w-3 h-3" /> Will travel
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-amber-600">●</span>
          No travel
        </div>
        {todayPct !== null && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="inline-block w-0.5 h-3 bg-indigo-500" />
            Today
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Row -------------------- */

function Row({
  f,
  trackStartIso,
  totalDays,
  todayPct,
  onClick,
}: {
  f: Facilitator;
  trackStartIso: string;
  totalDays: number;
  todayPct: number | null;
  onClick?: (f: Facilitator) => void;
}) {
  const trackEndIdx = totalDays - 1;
  const segments = (f.availableWindows || [])
    .map((w) => {
      const startIdx = Math.max(0, daysBetween(trackStartIso, w.start));
      const endIdx = Math.min(trackEndIdx, daysBetween(trackStartIso, w.end));
      if (endIdx < 0 || startIdx > trackEndIdx) return null;
      return {
        leftPct: (startIdx / totalDays) * 100,
        widthPct: ((endIdx - startIdx + 1) / totalDays) * 100,
        start: w.start,
        end: w.end,
      };
    })
    .filter(
      (s): s is { leftPct: number; widthPct: number; start: string; end: string } =>
        s !== null
    );

  const travel = f.willingToTravel;
  return (
    <button
      type="button"
      onClick={() => onClick?.(f)}
      className="w-full grid grid-cols-[220px_repeat(6,minmax(0,1fr))] items-stretch hover:bg-indigo-50/30 transition-colors text-left group"
    >
      {/* Sidebar — name + travel */}
      <div className="px-4 py-3 border-r border-gray-100 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700">
          {f.name}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
          {travel === "Yes" && (
            <span className="inline-flex items-center gap-0.5 text-emerald-700">
              <Plane className="w-3 h-3" /> Will travel
            </span>
          )}
          {travel === "Domestic" && (
            <span className="inline-flex items-center gap-0.5 text-emerald-700">
              <Plane className="w-3 h-3" /> Domestic
            </span>
          )}
          {travel === "No" && (
            <span className="text-amber-600">No travel</span>
          )}
          {!travel && <span className="text-gray-300">—</span>}
        </div>
      </div>

      {/* Track — spans the 6 month columns. position: relative so the
          green segments below position against this exact area. */}
      <div className="col-span-6 relative h-12 bg-gradient-to-b from-gray-50/40 to-white">
        {/* Month-column gridlines */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-gray-100"
            style={{ left: `${(i / 6) * 100}%` }}
          />
        ))}
        {/* Today marker */}
        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/70 pointer-events-none"
            style={{ left: `${todayPct}%` }}
            aria-label="Today"
          />
        )}
        {/* Availability segments */}
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute top-3 bottom-3 bg-emerald-500/80 group-hover:bg-emerald-500 rounded shadow-sm"
            style={{
              left: `${s.leftPct}%`,
              width: `${Math.max(s.widthPct, 0.5)}%`,
            }}
            title={`Available ${formatDay(s.start)} – ${formatDay(s.end)}`}
          />
        ))}
      </div>
    </button>
  );
}

/* -------------------- Empty state -------------------- */

function EmptyState({
  months,
}: {
  months: Array<{ label: string; year: number }>;
}) {
  return (
    <div className="grid grid-cols-[220px_repeat(6,minmax(0,1fr))]">
      <div className="px-4 py-8 border-r border-gray-100 text-xs text-gray-400">
        <Inbox className="w-4 h-4 mb-2" />
        No declared availability yet
      </div>
      <div className="col-span-6 relative px-6 py-10 text-center">
        {/* Ghost grid behind the message so the layout reads as "this
            is a calendar, just no data yet" — not a broken page. */}
        <div className="absolute inset-0 grid grid-cols-6 pointer-events-none">
          {months.map((_, i) => (
            <div
              key={i}
              className={`${
                i === 0 ? "" : "border-l border-dashed border-gray-100"
              }`}
            />
          ))}
        </div>
        <div className="relative">
          <div className="text-sm text-gray-700 font-medium">
            No availability submissions yet for this window
          </div>
          <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            Share the form link with your facilitators — once they submit,
            their available windows show up here as green bars across the
            months they can take engagements.
          </p>
          <a
            href="/availability"
            className="inline-block mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Preview the form →
          </a>
        </div>
      </div>
    </div>
  );
}

/* -------------------- date helpers -------------------- */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function formatDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
