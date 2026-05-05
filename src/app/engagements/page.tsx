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
  ExternalLink,
  Inbox,
} from "lucide-react";
import { EngagementRecord, EngagementRecordStatus } from "@/types/facilitator";

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState<EngagementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch(`/api/engagements?t=${Date.now()}`);
      if (res.headers.get("X-Engagements-Status") === "not-configured") {
        setNotConfigured(true);
        setEngagements([]);
      } else if (!res.ok) {
        throw new Error("Failed to load engagements");
      } else {
        const data = await res.json();
        setEngagements(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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
        {/* Setup banner */}
        {notConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            <div className="font-semibold mb-1">Engagements sheet not configured</div>
            <p className="mb-2">
              Set the <code className="bg-amber-100 px-1 rounded">GOOGLE_ENGAGEMENTS_CSV_URL</code>{" "}
              environment variable in Vercel to a Google Sheet share URL that
              points at the Engagements tab (the URL should contain{" "}
              <code className="bg-amber-100 px-1 rounded">?gid=&lt;tab-id&gt;</code>).
            </p>
            <p>
              Required columns:{" "}
              <code className="bg-amber-100 px-1 rounded">Engagement</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Client</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Status</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Start Date</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Facilitators</code>.
              Optional: <code className="bg-amber-100 px-1 rounded">End Date</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Location</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Type</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Value</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">Notes</code>.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {loading && !notConfigured && (
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
              />
              <Section
                title="Upcoming"
                subtitle="Booked and scheduled to start"
                accent="indigo"
                items={grouped.Upcoming}
                emptyMessage="No upcoming engagements."
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
              />
            )}
          </>
        )}
      </div>
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
}: {
  title: string;
  subtitle: string;
  accent: "green" | "indigo" | "amber" | "gray";
  items: EngagementRecord[];
  emptyMessage: string;
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
            <EngagementCard key={e.id} e={e} />
          ))}
        </div>
      )}
    </section>
  );
}

function EngagementCard({ e }: { e: EngagementRecord }) {
  const dateRange = formatDateRange(e.startDate, e.endDate);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-sm truncate">
            {e.name}
          </h3>
          <div className="text-sm text-gray-600 mt-0.5">{e.client}</div>
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
            {e.facilitators.map((f, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium"
              >
                {f}
              </span>
            ))}
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
