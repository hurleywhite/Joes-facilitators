"use client";

import { Facilitator } from "@/types/facilitator";

/**
 * Five pastel tiles with five different coloured icons used to sit here.
 * They cost a whole band of vertical space to say something you could read
 * in a line — and the colours implied a meaning the numbers don't have.
 *
 * Now it's one strip: the focus counts double as filters (that was always
 * the useful part), and the two facts you can't filter on sit to the right.
 */
export default function StatsBar({
  facilitators,
  activeFocus = "All",
  onFocusClick,
}: {
  facilitators: Facilitator[];
  activeFocus?: string;
  onFocusClick?: (focus: string) => void;
}) {
  const count = (f: string) =>
    facilitators.filter((x) => x.focus === f).length;

  const segments = [
    { key: "All", label: "Everyone", value: facilitators.length },
    { key: "Facilitation", label: "Facilitation", value: count("Facilitation") },
    { key: "Tech", label: "Tech", value: count("Tech") },
    { key: "Both", label: "Both", value: count("Both") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div
        role="group"
        aria-label="Filter by focus"
        className="inline-flex overflow-hidden rounded-lg border border-ink-200 bg-white"
      >
        {segments.map((s, i) => {
          const active = s.key === activeFocus;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => onFocusClick?.(s.key)}
              className={`flex items-baseline gap-1.5 px-3.5 py-2 text-left transition-colors ${
                i > 0 ? "border-l border-ink-200" : ""
              } ${
                active
                  ? "bg-arctic-50 text-arctic-800"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              <span
                className={`tnum text-base font-semibold ${
                  active ? "text-arctic-800" : "text-ink-900"
                }`}
              >
                {s.value}
              </span>
              <span className="text-xs">{s.label}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
