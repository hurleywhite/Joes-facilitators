"use client";

import { Facilitator } from "@/types/facilitator";
import { Users, Monitor, Globe, Contact } from "lucide-react";

interface StatsBarProps {
  facilitators: Facilitator[];
  activeFocus?: string;
  onFocusClick?: (focus: string) => void;
}

export default function StatsBar({
  facilitators,
  activeFocus = "All",
  onFocusClick,
}: StatsBarProps) {
  const total = facilitators.length;
  const facilCount = facilitators.filter(
    (f) => f.focus === "Facilitation"
  ).length;
  const techCount = facilitators.filter((f) => f.focus === "Tech").length;
  const bothCount = facilitators.filter((f) => f.focus === "Both").length;
  const countries = new Set(facilitators.map((f) => f.country)).size;

  const stats = [
    {
      label: "Total",
      filterKey: "All",
      value: total,
      icon: <Contact className="w-5 h-5" />,
      color: "text-indigo-600 bg-indigo-50",
      activeRing: "ring-2 ring-indigo-400",
    },
    {
      label: "Facilitation",
      filterKey: "Facilitation",
      value: facilCount,
      icon: <Users className="w-5 h-5" />,
      color: "text-blue-600 bg-blue-50",
      activeRing: "ring-2 ring-blue-400",
    },
    {
      label: "Tech",
      filterKey: "Tech",
      value: techCount,
      icon: <Monitor className="w-5 h-5" />,
      color: "text-emerald-600 bg-emerald-50",
      activeRing: "ring-2 ring-emerald-400",
    },
    {
      label: "Both",
      filterKey: "Both",
      value: bothCount,
      icon: (
        <span className="inline-flex items-center -space-x-1">
          <Users className="w-4 h-4" />
          <Monitor className="w-4 h-4" />
        </span>
      ),
      color: "text-purple-600 bg-purple-50",
      activeRing: "ring-2 ring-purple-400",
    },
    {
      label: "Countries",
      filterKey: null,
      value: countries,
      icon: <Globe className="w-5 h-5" />,
      color: "text-amber-600 bg-amber-50",
      activeRing: "",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {stats.map((s) => {
        const isClickable = s.filterKey !== null && onFocusClick;
        const isActive = s.filterKey === activeFocus;
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              if (isClickable) onFocusClick(s.filterKey!);
            }}
            disabled={!isClickable}
            className={`bg-white border rounded-xl p-3 flex items-center gap-3 shadow-sm transition-all text-left ${
              isClickable ? "cursor-pointer hover:shadow-md" : "cursor-default"
            } ${isActive ? `${s.activeRing} border-transparent` : "border-gray-200"}`}
          >
            <div className={`p-2 rounded-lg ${s.color}`}>{s.icon}</div>
            <div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
