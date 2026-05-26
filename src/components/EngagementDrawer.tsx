"use client";

import { useEffect, useMemo } from "react";
import {
  EngagementRecord,
  EngagementRecordStatus,
  Facilitator,
} from "@/types/facilitator";
import {
  X,
  Calendar,
  MapPin,
  Briefcase,
  Users,
  ExternalLink,
  PlayCircle,
  Plane,
} from "lucide-react";

/**
 * Slide-over showing one engagement and the full mini-profiles of every
 * facilitator on it. Opens when you click an engagement card on the
 * engagements page.
 *
 * Each team-member tile shows enough to make a staffing decision at a
 * glance — avatar, name, focus, tier, availability chip, demo video
 * link, LinkedIn link, top industries — and a "View full profile"
 * button that triggers the parent's facilitator drawer.
 */
export default function EngagementDrawer({
  engagement,
  facilitatorsByName,
  onClose,
  onPickFacilitator,
}: {
  engagement: EngagementRecord | null;
  facilitatorsByName: Map<string, Facilitator>;
  onClose: () => void;
  onPickFacilitator: (f: Facilitator) => void;
}) {
  useEffect(() => {
    if (!engagement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [engagement, onClose]);

  // Resolve names → facilitator records up front so the render pass
  // doesn't repeat the lookup on every key press.
  const team = useMemo(() => {
    if (!engagement) return [];
    return engagement.facilitators.map((name) => ({
      name,
      facilitator: facilitatorsByName.get(name.toLowerCase().trim()),
    }));
  }, [engagement, facilitatorsByName]);

  if (!engagement) return null;

  const e = engagement;
  const dateRange = formatDateRange(e.startDate, e.endDate);
  const stickyContext = [e.location, e.client].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-sm"
      />
      <div className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 truncate">
                {e.client && e.client !== "(unknown)" ? e.client : e.name}
              </h2>
              <StatusBadge status={e.status} />
            </div>
            {e.name && e.name !== e.client && e.name !== "(untitled)" && (
              <div className="text-sm text-indigo-700 font-medium mt-0.5 truncate">
                {e.name}
              </div>
            )}
            {stickyContext && (
              <div className="text-xs text-gray-500 mt-1 truncate">
                {stickyContext}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Engagement meta */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
            {dateRange && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {dateRange}
              </span>
            )}
            {e.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                {e.location}
              </span>
            )}
            {e.type && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-gray-400" />
                {e.type}
              </span>
            )}
            {e.valueUSD && (
              <span className="text-gray-700 font-medium">{e.valueUSD}</span>
            )}
          </div>

          {e.notes && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 italic">
              {e.notes}
            </div>
          )}

          {/* Team */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Team ({team.length})
            </h3>
            {team.length === 0 ? (
              <div className="text-sm text-gray-400 italic">
                No facilitators assigned yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {team.map((m, i) => (
                  <TeamTile
                    key={i}
                    name={m.name}
                    facilitator={m.facilitator}
                    onView={onPickFacilitator}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamTile({
  name,
  facilitator,
  onView,
}: {
  name: string;
  facilitator?: Facilitator;
  onView: (f: Facilitator) => void;
}) {
  if (!facilitator) {
    // Name on the engagement doesn't match anyone in the pool. Render a
    // dimmed tile so the operator knows why this person can't be opened.
    return (
      <div className="border border-dashed border-gray-300 bg-gray-50 rounded-lg p-3 text-sm">
        <div className="font-medium text-gray-700">{name}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          Not in the facilitator pool
        </div>
      </div>
    );
  }

  const f = facilitator;
  const availColor =
    f.availability === "Available"
      ? "bg-green-500"
      : f.availability === "On Assignment"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <button
      type="button"
      onClick={() => onView(f)}
      className="text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`
            }
            alt={f.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-gray-100 bg-indigo-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`;
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${availColor}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {f.name}
            </span>
            {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 hover:text-blue-800"
                title="LinkedIn"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {f.demoVideoUrl && (
              <a
                href={f.demoVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-red-600 hover:text-red-800"
                title="Watch demo"
              >
                <PlayCircle className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {f.location}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {f.focus && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full">
                {f.focus}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full">
              {f.experienceLevel === "High"
                ? "Top tier"
                : f.experienceLevel === "Medium"
                  ? "Mid tier"
                  : "Low tier"}
            </span>
            {f.willingToTravel && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full inline-flex items-center gap-0.5">
                <Plane className="w-2.5 h-2.5" />
                {f.willingToTravel === "Domestic" ? "Domestic" : f.willingToTravel === "Yes" ? "Will travel" : "No travel"}
              </span>
            )}
          </div>
          {f.industryExperience && f.industryExperience.length > 0 && (
            <div className="text-[10px] text-gray-500 mt-1.5 truncate">
              {f.industryExperience.slice(0, 3).join(" · ")}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: EngagementRecordStatus }) {
  const map: Record<EngagementRecordStatus, string> = {
    Active: "bg-green-100 text-green-700 border-green-200",
    Upcoming: "bg-indigo-100 text-indigo-700 border-indigo-200",
    Completed: "bg-gray-100 text-gray-600 border-gray-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
    "On Hold": "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={`flex-shrink-0 px-2 py-0.5 text-[11px] font-medium rounded-full border ${map[status]}`}
    >
      {status}
    </span>
  );
}

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end;
}
