"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  MapPin,
  RefreshCw,
  Users,
  Inbox,
} from "lucide-react";
import { EngagementRecord, EngagementRecordStatus, Facilitator } from "@/types/facilitator";
import FacilitatorDrawer from "@/components/FacilitatorDrawer";

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState<EngagementRecord[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [selectedFacilitator, setSelectedFacilitator] =
    useState<Facilitator | null>(null);

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
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src="/logo.avif" alt="ArcticMind" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                Engagements
              </h1>
              <p className="text-xs text-gray-500">
                Active, upcoming, and recent workshop deliveries.
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Seed-data banner — soft, informational */}
        {usingSeed && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 flex items-center justify-between">
            <span>
              Showing built-in seed data. To use a live Google Sheet, set{" "}
              <code className="bg-indigo-100 px-1 rounded">GOOGLE_ENGAGEMENTS_CSV_URL</code>{" "}
              in Vercel.
            </span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
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
                title="Current / Ongoing"
                subtitle="Engagements in flight right now"
                accent="green"
                items={grouped.Active}
                emptyMessage="No active engagements."
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
              />
              <Section
                title="Upcoming"
                subtitle="Booked and scheduled to start"
                accent="indigo"
                items={grouped.Upcoming}
                emptyMessage="No upcoming engagements."
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
              />
            </div>

            {/* On Hold appears only when there are any */}
            {grouped["On Hold"].length > 0 && (
              <Section
                title="On Hold"
                subtitle="Paused or pending decisions"
                accent="amber"
                items={grouped["On Hold"]}
                emptyMessage=""
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
              />
            )}

            {/* Completed full-width below */}
            {grouped.Completed.length > 0 && (
              <Section
                title="Recently Completed"
                subtitle="Delivered engagements"
                accent="gray"
                items={grouped.Completed}
                emptyMessage=""
                facilitatorsByName={facilitatorsByName}
                onPickFacilitator={setSelectedFacilitator}
              />
            )}
          </>
        )}
      </div>

      <FacilitatorDrawer
        facilitator={selectedFacilitator}
        onClose={() => setSelectedFacilitator(null)}
      />
    </main>
  );
}

/* ---------- subcomponents ---------- */

function Section({
  title,
  subtitle,
  accent,
  items,
  emptyMessage,
  facilitatorsByName,
  onPickFacilitator,
}: {
  title: string;
  subtitle: string;
  accent: "green" | "indigo" | "amber" | "gray";
  items: EngagementRecord[];
  emptyMessage: string;
  facilitatorsByName: Map<string, Facilitator>;
  onPickFacilitator: (f: Facilitator) => void;
}) {
  const accentClasses: Record<string, string> = {
    green: "border-l-green-500 bg-green-50/40",
    indigo: "border-l-indigo-500 bg-indigo-50/40",
    amber: "border-l-amber-500 bg-amber-50/40",
    gray: "border-l-gray-300 bg-gray-50/40",
  };
  return (
    <section
      className={`bg-white border border-gray-200 border-l-4 rounded-xl p-5 ${accentClasses[accent]}`}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <span className="text-sm font-semibold text-gray-400">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
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
}: {
  e: EngagementRecord;
  facilitatorsByName: Map<string, Facilitator>;
  onPickFacilitator: (f: Facilitator) => void;
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
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-sm truncate">
            {title}
          </h3>
          {subtitle && (
            <div className="text-xs font-medium text-indigo-700 mt-0.5 truncate">
              {subtitle}
            </div>
          )}
          {locationLine && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {locationLine}
            </div>
          )}
        </div>
        <StatusBadge status={e.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
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
          <Users className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="flex flex-wrap gap-1">
            {e.facilitators.map((name, i) => {
              const match = facilitatorsByName.get(name.toLowerCase().trim());
              if (match) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPickFacilitator(match)}
                    className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium hover:bg-indigo-100 hover:text-indigo-900 transition-colors cursor-pointer"
                    title={`View ${name}'s profile`}
                  >
                    {name}
                  </button>
                );
              }
              return (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-gray-50 text-gray-600 border border-dashed border-gray-300 rounded font-medium"
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
        <p className="mt-2 text-xs text-gray-500 italic line-clamp-2">
          {e.notes}
        </p>
      )}

      {e.valueUSD && (
        <div className="mt-2 text-xs font-medium text-gray-600">
          {e.valueUSD}
        </div>
      )}
    </div>
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
    green: "bg-green-100 text-green-700",
    indigo: "bg-indigo-100 text-indigo-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-100 text-amber-700",
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
