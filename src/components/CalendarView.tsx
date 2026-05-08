"use client";

import { useState, useMemo } from "react";
import { Facilitator } from "@/types/facilitator";
import { Calendar, Plane, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Timeline view of facilitator availability.
 *
 * Each row is a facilitator who has submitted the self-service availability
 * form. A horizontal track spans 6 months starting from the picked month;
 * green segments mark dates the facilitator is available. Click a row to
 * open their drawer (handler delegated to the parent so this component
 * stays presentational).
 *
 * Operators use this when matching a deal to people: scan the column for
 * the deal's month and pick a row whose track is green there.
 */
export default function CalendarView({
  facilitators,
  onPickFacilitator,
}: {
  facilitators: Facilitator[];
  onPickFacilitator?: (f: Facilitator) => void;
}) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });
  const months = 6;
  const trackStart = anchor;
  const trackEnd = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 0)
  );
  const trackStartIso = isoDate(trackStart);
  const trackEndIso = isoDate(trackEnd);
  const totalDays = daysBetween(trackStartIso, trackEndIso) + 1;

  // Filter to facilitators with at least one window overlapping the visible
  // range. Keeps the list short and the picture useful — anyone with no
  // declared availability simply doesn't appear here.
  const rows = useMemo(() => {
    return facilitators
      .filter((f) =>
        (f.availableWindows || []).some(
          (w) => w.end >= trackStartIso && w.start <= trackEndIso
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [facilitators, trackStartIso, trackEndIso]);

  const monthLabels = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1));
    return {
      label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      offsetPct: (daysBetween(trackStartIso, isoDate(d)) / totalDays) * 100,
    };
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header — month picker */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Availability — next {months} months
          </h3>
          <span className="text-xs text-gray-400">
            {rows.length} facilitator{rows.length === 1 ? "" : "s"} with declared windows
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1)))
            }
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setAnchor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
            }}
            className="text-xs text-gray-500 hover:text-gray-800 px-2"
          >
            Today
          </button>
          <button
            onClick={() =>
              setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1)))
            }
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="relative">
        {/* Month gridlines + labels */}
        <div className="relative h-7 bg-gray-50 border-b border-gray-100">
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center pl-2 text-[11px] font-medium text-gray-500 border-l border-gray-200"
              style={{ left: `calc(220px + ${m.offsetPct}% * (100% - 220px) / 100)` }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No availability submissions yet for this window.
            <div className="mt-2">
              Share the form link with your facilitators to start populating
              this view.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((f) => (
              <Row
                key={f.id}
                f={f}
                trackStartIso={trackStartIso}
                totalDays={totalDays}
                onClick={onPickFacilitator}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  f,
  trackStartIso,
  totalDays,
  onClick,
}: {
  f: Facilitator;
  trackStartIso: string;
  totalDays: number;
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
      };
    })
    .filter((s): s is { leftPct: number; widthPct: number } => s !== null);

  const travel = f.willingToTravel;
  return (
    <button
      type="button"
      onClick={() => onClick?.(f)}
      className="w-full grid grid-cols-[220px_1fr] items-center hover:bg-gray-50 transition-colors text-left"
    >
      {/* Sidebar — name + travel chip */}
      <div className="px-4 py-2 border-r border-gray-100 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{f.name}</div>
        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
          {travel === "Yes" && (
            <span className="inline-flex items-center gap-0.5">
              <Plane className="w-3 h-3" /> Will travel
            </span>
          )}
          {travel === "Domestic" && (
            <span className="inline-flex items-center gap-0.5">
              <Plane className="w-3 h-3" /> Domestic
            </span>
          )}
          {travel === "No" && (
            <span className="text-amber-600">No travel</span>
          )}
          {!travel && <span className="text-gray-300">—</span>}
        </div>
      </div>

      {/* Track */}
      <div className="relative h-12 bg-gradient-to-b from-gray-50 to-white">
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute top-3 bottom-3 bg-emerald-500/80 hover:bg-emerald-500 rounded"
            style={{ left: `${s.leftPct}%`, width: `${Math.max(s.widthPct, 1)}%` }}
            title="Available"
          />
        ))}
      </div>
    </button>
  );
}

/* ---------- date helpers ---------- */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00Z").getTime();
  const end = new Date(endIso + "T00:00:00Z").getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}
