"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  MapPin,
  RefreshCw,
  Users,
  Inbox,
} from "lucide-react";
import { EngagementRecord, EngagementRecordStatus, Facilitator } from "@/types/facilitator";
import FacilitatorDrawer from "@/components/FacilitatorDrawer";
import EngagementDrawer from "@/components/EngagementDrawer";
import AppHeader, { HeaderButton } from "@/components/AppHeader";

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState<EngagementRecord[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [selectedFacilitator, setSelectedFacilitator] =
    useState<Facilitator | null>(null);
  const [selectedEngagement, setSelectedEngagement] =
    useState<EngagementRecord | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [engRes, facRes] = await Promise.all([
        fetch(`/api/engagements?t=${Date.now()}`),
        fetch(`/api/facilitators?t=${Date.now()}`),
      ]);
      setSource(engRes.headers.get("X-Engagements-Source") || "");
      if (!engRes.ok) throw new Error("Failed to load engagements");
      const engData = await engRes.json();
      setEngagements(Array.isArray(engData) ? engData : []);

      if (facRes.ok) {
        const facData = await facRes.json();
        setFacilitators(Array.isArray(facData) ? facData : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const usingSeed = source.startsWith("seed");

  /**
   * Build a name → facilitator lookup so chips on engagement cards can
   * resolve to a full profile. Lowercased for forgiving matching.
   */
  const facilitatorsByName = useMemo(() => {
    const map = new Map<string, Facilitator>();
    for (const f of facilitators) {
      map.set(f.name.toLowerCase().trim(), f);
    }
    return map;
  }, [facilitators]);

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh while visible — same pattern as the home page.
  useEffect(() => {
    const POLL_MS = 60_000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchData();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<EngagementRecordStatus, EngagementRecord[]> = {
      Active: [],
      Upcoming: [],
      Completed: [],
      Cancelled: [],
      "On Hold": [],
    };
    engagements.forEach((e) => groups[e.status].push(e));
    return groups;
  }, [engagements]);

  return (
    <main className="min-h-screen bg-ink-50">
      {/* Header */}
      <AppHeader>
        <HeaderButton onClick={fetchData} disabled={loading} title="Pull the latest from the sheet">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </HeaderButton>
      </AppHeader>


      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Sample-data notice. This used to be a full-width tinted banner
            quoting an environment-variable name — the loudest thing on the
            page, and addressed to whoever deploys the app rather than
            whoever reads it. The fact that matters to a reader is "these
            aren't your real engagements"; the fix belongs in a tooltip. */}
        {usingSeed && (
          <p
            className="text-xs text-ink-500"
            title="Set GOOGLE_ENGAGEMENTS_CSV_URL in Vercel to point this page at the live sheet."
          >
            Showing sample engagements — the live sheet isn&apos;t connected yet.
          </p>
        )}

        {error && (
          <div className="bg-stop-50 border border-stop-200 text-stop-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-arctic-400 animate-spin" />
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip
                label="Active"
                count={grouped.Active.length}
                tone="green"
              />
              <Chip
                label="Upcoming"
                count={grouped.Upcoming.length}
                tone="indigo"
              />
              <Chip
                label="Completed"
                count={grouped.Completed.length}
                tone="gray"
              />
              {grouped["On Hold"].length > 0 && (
                <Chip
                  label="On Hold"
                  count={grouped["On Hold"].length}
                  tone="amber"
                />
              )}
            </div>

            {/* Active + Upcoming side-by-side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section
                title="Running now"
                items={grouped.Active}
                emptyMessage="No active engagements."
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
                onPickEngagement={setSelectedEngagement}
              />
              <Section
                title="Upcoming"
                items={grouped.Upcoming}
                emptyMessage="No upcoming engagements."
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
                onPickEngagement={setSelectedEngagement}
              />
            </div>

            {/* On Hold appears only when there are any */}
            {grouped["On Hold"].length > 0 && (
              <Section
                title="On Hold"
                items={grouped["On Hold"]}
                emptyMessage=""
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
                onPickEngagement={setSelectedEngagement}
              />
            )}

            {/* Completed full-width below */}
            {grouped.Completed.length > 0 && (
              <Section
                title="Recently Completed"
                items={grouped.Completed}
                emptyMessage=""
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
                onPickEngagement={setSelectedEngagement}
              />
            )}
          </>
        )}
      </div>

      <FacilitatorDrawer
        facilitator={selectedFacilitator}
        onClose={() => setSelectedFacilitator(null)}
      />
      <EngagementDrawer
        engagement={selectedEngagement}
        facilitatorsByName={facilitatorsByName}
        onClose={() => setSelectedEngagement(null)}
        onPickFacilitator={(f) => {
          // Layered drawer: opening a facilitator profile from the
          // engagement drawer keeps the engagement context behind it.
          setSelectedFacilitator(f);
        }}
      />
    </main>
  );
}

/* ---------- subcomponents ---------- */

function Section({
  title,
  items,
  emptyMessage,
  facilitatorsByName,
  onPickFacilitator,
  onPickEngagement,
}: {
  title: string;
  items: EngagementRecord[];
  emptyMessage: string;
  facilitatorsByName: Map<string, Facilitator>;
  onPickFacilitator: (f: Facilitator) => void;
  onPickEngagement: (e: EngagementRecord) => void;
}) {
  // The 4px coloured bar down the side of each column was decoration —
  // every card inside already carries its own status badge, so the bar
  // repeated information in a second visual language. Columns are plain
  // surfaces now; the heading does the labelling.
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-ink-100 pb-2.5">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="tnum text-sm font-medium text-ink-400">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-ink-400 py-6">
          <Inbox className="w-4 h-4" />
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <EngagementCard
              key={e.id}
              e={e}
              facilitatorsByName={facilitatorsByName}
              onPickFacilitator={onPickFacilitator}
              onPickEngagement={onPickEngagement}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EngagementCard({
  e,
  facilitatorsByName,
  onPickFacilitator,
  onPickEngagement,
}: {
  e: EngagementRecord;
  facilitatorsByName: Map<string, Facilitator>;
  onPickFacilitator: (f: Facilitator) => void;
  onPickEngagement: (e: EngagementRecord) => void;
}) {
  const dateRange = formatDateRange(e.startDate, e.endDate);

  // Title prefers the company / client name (e.g. "AbbVie", "Tamkeen") so the
  // card identifies the deal at a glance instead of showing the generic
  // engagement type. The engagement name (e.g. "AI Workshop") drops to a
  // subtitle when it's distinct from the client.
  const title = e.client && e.client !== "(unknown)" ? e.client : e.name;
  const subtitle = e.name && e.name !== title && e.name !== "(untitled)" ? e.name : "";
  const locationLine = e.location ? e.location : "";

  return (
    // Whole card is the target. It used to carry a "View team & details →"
    // link at the bottom pointing at the same drawer the title already
    // opened — two affordances, one destination, on every card.
    <div
      onClick={() => onPickEngagement(e)}
      className="cursor-pointer rounded-lg border border-ink-200 bg-white p-3.5 transition-colors hover:border-arctic-300 hover:bg-arctic-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Title block doubles as the open-drawer trigger. Stays as a
            button so screenreaders see it as an action; the chips
            below still capture their own clicks. */}
        <button
          type="button"
          onClick={() => onPickEngagement(e)}
          className="min-w-0 flex-1 text-left group"
        >
          <h3 className="font-semibold text-ink-900 text-sm truncate group-hover:text-arctic-700 transition-colors">
            {title}
          </h3>
          {subtitle && (
            <div className="text-xs font-medium text-arctic-700 mt-0.5 truncate">
              {subtitle}
            </div>
          )}
          {locationLine && (
            <div className="text-xs text-ink-500 mt-0.5 truncate">
              {locationLine}
            </div>
          )}
        </button>
        <StatusBadge status={e.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-500">
        {dateRange && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {dateRange}
          </span>
        )}
        {e.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {e.location}
          </span>
        )}
        {e.type && (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5" />
            {e.type}
          </span>
        )}
      </div>

      {e.facilitators.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-xs">
          <Users className="w-3.5 h-3.5 text-ink-400 mt-0.5 flex-shrink-0" />
          <div className="flex flex-wrap gap-1">
            {e.facilitators.map((name, i) => {
              const match = facilitatorsByName.get(name.toLowerCase().trim());
              if (match) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); onPickFacilitator(match); }}
                    className="px-1.5 py-0.5 bg-arctic-50 text-arctic-700 rounded font-medium hover:bg-arctic-100 hover:text-arctic-900 transition-colors cursor-pointer"
                    title={`View ${name}'s profile`}
                  >
                    {name}
                  </button>
                );
              }
              return (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-ink-50 text-ink-600 border border-dashed border-ink-300 rounded font-medium"
                  title="Not in the facilitator pool"
                >
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {e.notes && (
        <p className="mt-2 text-xs text-ink-500 italic line-clamp-2">
          {e.notes}
        </p>
      )}

      {e.valueUSD && (
        <div className="mt-2 text-xs font-medium text-ink-600">
          {e.valueUSD}
        </div>
      )}

    </div>
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
      className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full border ${map[status]}`}
    >
      {status}
    </span>
  );
}

function Chip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "green" | "indigo" | "gray" | "amber";
}) {
  const map: Record<string, string> = {
    green: "bg-ok-50 text-ok-700",
    indigo: "bg-arctic-100 text-arctic-700",
    gray: "bg-ink-100 text-ink-600",
    amber: "bg-warn-50 text-warn-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${map[tone]}`}
    >
      <span className="font-semibold">{count}</span>
      {label}
    </span>
  );
}

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end;
}
