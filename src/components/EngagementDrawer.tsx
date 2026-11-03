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
        <div className="sticky top-0 z-10 bg-white border-b border-ink-200 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink-900 truncate">
                {e.client && e.client !== "(unknown)" ? e.client : e.name}
              </h2>
              <StatusBadge status={e.status} />
            </div>
            {e.name && e.name !== e.client && e.name !== "(untitled)" && (
              <div className="text-sm text-arctic-700 font-medium mt-0.5 truncate">
                {e.name}
              </div>
            )}
            {stickyContext && (
              <div className="text-xs text-ink-500 mt-1 truncate">
                {stickyContext}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-ink-100 text-ink-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Engagement meta */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-600">
            {dateRange && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-ink-400" />
                {dateRange}
              </span>
            )}
            {e.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-ink-400" />
                {e.location}
              </span>
            )}
            {e.type && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-ink-400" />
                {e.type}
              </span>
            )}
            {e.valueUSD && (
              <span className="text-ink-700 font-medium">{e.valueUSD}</span>
            )}
          </div>

          {e.notes && (
            <div className="bg-ink-50 border border-ink-200 rounded-lg p-3 text-sm text-ink-700 italic">
              {e.notes}
            </div>
          )}

          {/* Team */}
          <div>
            <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Team ({team.length})
            </h3>
            {team.length === 0 ? (
              <div className="text-sm text-ink-400 italic">
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
      <div className="border border-dashed border-ink-300 bg-ink-50 rounded-lg p-3 text-sm">
        <div className="font-medium text-ink-700">{name}</div>
        <div className="text-[11px] text-ink-400 mt-0.5">
          Not in the facilitator pool
        </div>
      </div>
    );
  }

  const f = facilitator;
  // No availability dot. It was green for 82 of the 84 people on the
  // bench because "Available" is the sheet's default, not because
  // anyone checked. See lib/availability-display.ts.

  return (
    <button
      type="button"
      onClick={() => onView(f)}
      className="text-left bg-white border border-ink-200 rounded-lg p-3 hover:border-arctic-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`
            }
            alt={f.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-ink-100 bg-arctic-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`;
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-ink-900 truncate">
              {f.name}
            </span>
            {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-arctic-600 hover:text-arctic-800"
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
                className="text-stop-600 hover:text-stop-700"
                title="Watch demo"
              >
                <PlayCircle className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-0.5 truncate">
            {f.location}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {f.focus && (
              <span className="text-[10px] px-1.5 py-0.5 bg-ink-50 text-ink-700 border border-ink-100 rounded-full">
                {f.focus}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-warn-50 text-warn-700 border border-warn-200 rounded-full">
              {f.experienceLevel === "High"
                ? "Top tier"
                : f.experienceLevel === "Medium"
                  ? "Mid tier"
                  : "Low tier"}
            </span>
            {f.willingToTravel && (
              <span className="text-[10px] px-1.5 py-0.5 bg-ink-50 text-ink-700 border border-ink-200 rounded-full inline-flex items-center gap-0.5">
                <Plane className="w-2.5 h-2.5" />
                {f.willingToTravel === "Domestic" ? "Domestic" : f.willingToTravel === "Yes" ? "Will travel" : "No travel"}
              </span>
            )}
          </div>
          {f.industryExperience && f.industryExperience.length > 0 && (
            <div className="text-[10px] text-ink-500 mt-1.5 truncate">
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
    Active: "bg-ok-50 text-ok-700 border-ok-200",
    Upcoming: "bg-arctic-100 text-arctic-700 border-arctic-200",
    Completed: "bg-ink-100 text-ink-600 border-ink-200",
    Cancelled: "bg-stop-50 text-stop-700 border-stop-200",
    "On Hold": "bg-warn-50 text-warn-700 border-warn-200",
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
