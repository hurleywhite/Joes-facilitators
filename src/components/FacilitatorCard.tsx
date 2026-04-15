"use client";

import { Facilitator } from "@/types/facilitator";
import {
  ExternalLink,
  MapPin,
  Monitor,
  Users,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function focusBadge(focus: string) {
  const colors: Record<string, string> = {
    Facilitation: "bg-blue-100 text-blue-800 border-blue-200",
    Tech: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Both: "bg-purple-100 text-purple-800 border-purple-200",
  };
  const icons: Record<string, React.ReactNode> = {
    Facilitation: <Users className="w-3 h-3" />,
    Tech: <Monitor className="w-3 h-3" />,
    Both: <Sparkles className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colors[focus] || "bg-gray-100 text-gray-800"}`}
    >
      {icons[focus]} {focus}
    </span>
  );
}

function experienceBadge(level: string) {
  const colors: Record<string, string> = {
    High: "bg-amber-100 text-amber-800 border-amber-200",
    Medium: "bg-sky-100 text-sky-800 border-sky-200",
    Low: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colors[level] || "bg-gray-100 text-gray-800"}`}
    >
      {level} Exp.
    </span>
  );
}

export default function FacilitatorCard({ f }: { f: Facilitator }) {
  const [expanded, setExpanded] = useState(false);
  const completedCount = f.engagements.filter(
    (e) => e.status === "Completed"
  ).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Avatar - uses photo URL if available, otherwise DiceBear avatar */}
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1,8b5cf6,a855f7&fontFamily=Arial&fontSize=40`
            }
            alt={f.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 flex-shrink-0 bg-indigo-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`;
            }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-base truncate">
                {f.name}
              </h3>
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 flex-shrink-0 text-xs font-medium"
                title="View LinkedIn Profile"
              >
                <span className="font-bold">in</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>{f.location}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {focusBadge(f.focus)}
              {experienceBadge(f.experienceLevel)}
            </div>
          </div>
        </div>

        {/* Bio */}
        <p className="text-sm text-gray-600 mt-3 line-clamp-2">{f.bio}</p>

        {/* Engagements summary */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {completedCount > 0 ? (
              <span>
                {completedCount} engagement{completedCount !== 1 ? "s" : ""}{" "}
                completed
              </span>
            ) : (
              <span className="text-gray-400">No engagements yet</span>
            )}
            {f.currentEngagement && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                Active: {f.currentEngagement}
              </span>
            )}
          </div>

          {f.engagements.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
            >
              {expanded ? "Hide" : "Details"}
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded engagements */}
      {expanded && f.engagements.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Engagement History
          </h4>
          <ul className="space-y-1.5">
            {f.engagements.map((eng, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">{eng.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{eng.date}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      eng.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : eng.status === "Completed"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    {eng.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
