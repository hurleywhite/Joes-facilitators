"use client";

import { Facilitator } from "@/types/facilitator";
import { Users, Monitor, Sparkles, Globe } from "lucide-react";

export default function StatsBar({
  facilitators,
}: {
  facilitators: Facilitator[];
}) {
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
      value: total,
      icon: <Users className="w-5 h-5" />,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "Facilitation",
      value: facilCount,
      icon: <Users className="w-5 h-5" />,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Tech",
      value: techCount,
      icon: <Monitor className="w-5 h-5" />,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Both",
      value: bothCount,
      icon: <Sparkles className="w-5 h-5" />,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "Countries",
      value: countries,
      icon: <Globe className="w-5 h-5" />,
      color: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 shadow-sm"
        >
          <div className={`p-2 rounded-lg ${s.color}`}>{s.icon}</div>
          <div>
            <div className="text-xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
