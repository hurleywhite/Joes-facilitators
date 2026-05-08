"use client";

import { Facilitator, AvailabilityWindow } from "@/types/facilitator";
import {
  ExternalLink,
  MapPin,
  Monitor,
  Users,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Briefcase,
  Calendar,
} from "lucide-react";
import { useState } from "react";

/**
 * One-line summary of availability for the card. Picks the next window
 * starting from today and renders e.g. "thru Dec 31" or "Jul–Sep" or
 * "Jan 5 – Mar 30, 2027".
 */
function summarizeWindows(windows: AvailabilityWindow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = windows
    .filter((w) => w.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming.length === 0) return "history only";
  const w = upcoming[0];
  const start = new Date(w.start + "T00:00:00Z");
  const end = new Date(w.end + "T00:00:00Z");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (w.start <= today && w.end.endsWith("-12-31")) return "thru year-end";
  if (w.start <= today) return `thru ${fmt(end)}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

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

        {/* Bio — full text. Avatar size is unchanged (w-28 h-28), so the
            card just grows downward when the bio is long. The previous
            `line-clamp-2` was hiding most of every facilitator's
            background mid-sentence. */}
        <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{f.bio}</p>

        {/* Languages */}
        {f.languages?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {f.languages.slice(0, 4).map((lang) => (
              <span
                key={`lang-${lang}`}
                className="text-[10px] px-1.5 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full"
                title="Language"
              >
                {lang}
              </span>
            ))}
          </div>
        )}

        {/* Industry experience — its own row, all of them shown so it's clear
            who covers what (Healthcare, Government, Pharma, etc.). */}
        {f.industryExperience?.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Industry experience
            </div>
            <div className="flex flex-wrap gap-1">
              {f.industryExperience.map((ind) => (
                <span
                  key={`ind-${ind}`}
                  className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full"
                >
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Availability windows — short summary (first window). Full
            list lives in the drawer. Only renders if the facilitator
            has submitted the self-service availability form. */}
        {f.availableWindows && f.availableWindows.length > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            <Calendar className="w-3 h-3" />
            <span className="font-medium">Available</span>
            <span className="text-emerald-600">
              {summarizeWindows(f.availableWindows)}
            </span>
            {f.willingToTravel === "Yes" && <span className="text-emerald-600">· will travel</span>}
            {f.willingToTravel === "Domestic" && <span className="text-emerald-600">· domestic travel</span>}
            {f.willingToTravel === "No" && <span className="text-amber-600">· no travel</span>}
          </div>
        )}

        {/* Demo video button — only if a URL is present in the sheet. */}
        {f.demoVideoUrl && (
          <a
            href={f.demoVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
            title="Watch demo video"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Watch demo
          </a>
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

          {(f.engagements.length > 0 ||
            (f.pastCompanies?.length || 0) > 0 ||
            (f.pastRoles?.length || 0) > 0) && (
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

      {/* Expanded panel — past roles/companies first (they describe who the
          person IS), then engagement history (what they've done with us). */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 space-y-3">
          {(f.pastRoles?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> Past roles
              </h4>
              <div className="flex flex-wrap gap-1">
                {f.pastRoles!.map((r) => (
                  <span
                    key={r}
                    className="text-[11px] px-2 py-0.5 bg-white border border-gray-200 text-gray-700 rounded-full"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(f.pastCompanies?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Past companies
              </h4>
              <div className="flex flex-wrap gap-1">
                {f.pastCompanies!.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {f.engagements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Engagement history (most recent first)
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
      )}
    </div>
  );
}
