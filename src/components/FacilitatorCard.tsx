"use client";

import { Facilitator } from "@/types/facilitator";
import {
  ExternalLink,
  MapPin,
  Monitor,
  Users,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { useState } from "react";

function focusBadge(focus: string | undefined) {
  if (!focus) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border bg-gray-50 text-gray-500 border-gray-200 italic">
        Focus TBD
      </span>
    );
  }
  const colors: Record<string, string> = {
    Facilitation: "bg-blue-100 text-blue-800 border-blue-200",
    Tech: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Both: "bg-purple-100 text-purple-800 border-purple-200",
  };
  const icons: Record<string, React.ReactNode> = {
    Facilitation: <Users className="w-3 h-3" />,
    Tech: <Monitor className="w-3 h-3" />,
    Both: (
      <span className="inline-flex items-center -space-x-0.5">
        <Users className="w-3 h-3" />
        <Monitor className="w-3 h-3" />
      </span>
    ),
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
  // Show Joe's "Top" vocabulary on the badge while the underlying type
  // stays as "High" for type-safety across the codebase.
  const label =
    level === "High" ? "Top tier" : level === "Medium" ? "Mid tier" : "Low tier";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colors[level] || "bg-gray-100 text-gray-800"}`}
    >
      {label}
    </span>
  );
}

function availabilityDot(availability: string) {
  const config: Record<string, { color: string; label: string }> = {
    Available: { color: "bg-green-500", label: "Available" },
    "On Assignment": { color: "bg-yellow-500", label: "On Assignment" },
    Unavailable: { color: "bg-red-500", label: "Unavailable" },
  };
  const c = config[availability] || config["Available"];
  return (
    <span className="inline-flex items-center gap-1.5" title={c.label}>
      <span className={`w-2.5 h-2.5 rounded-full ${c.color} animate-pulse`} />
      <span className="text-xs text-gray-500">{c.label}</span>
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
        {/* Availability + Region bar */}
        <div className="flex items-center justify-between mb-3">
          {availabilityDot(f.availability)}
          <span className="text-xs text-gray-400">{f.region}</span>
        </div>

        {/* Header — 2x avatar + shifted name/location/badges to the right */}
        <div className="flex items-start gap-5">
          {/* Avatar (2x = 28x28 = 112px) */}
          <div className="relative flex-shrink-0">
            <img
              src={
                f.photoUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1,8b5cf6,a855f7&fontFamily=Arial&fontSize=40`
              }
              alt={f.name}
              className="w-28 h-28 rounded-full object-cover border-2 border-gray-100 bg-indigo-100 shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`;
              }}
            />
            {/* Larger availability dot on avatar */}
            <span
              className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-white shadow ${
                f.availability === "Available"
                  ? "bg-green-500"
                  : f.availability === "On Assignment"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-lg truncate">
                {f.name}
              </h3>
              {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
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
              )}
            </div>
            {f.location && (
              <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{f.location}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {focusBadge(f.focus)}
              {experienceBadge(f.experienceLevel)}
            </div>
          </div>
        </div>

        {/* Bio */}
        <p className="text-sm text-gray-600 mt-3 line-clamp-2">{f.bio}</p>

        {/* Languages and Industries */}
        {(f.languages?.length > 0 || f.industryExperience?.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {f.languages?.slice(0, 3).map((lang) => (
              <span
                key={`lang-${lang}`}
                className="text-[10px] px-1.5 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full"
                title="Language"
              >
                {lang}
              </span>
            ))}
            {f.industryExperience?.slice(0, 2).map((ind) => (
              <span
                key={`ind-${ind}`}
                className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full"
                title="Industry experience"
              >
                {ind}
              </span>
            ))}
          </div>
        )}

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
            Engagement History (most recent first)
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
