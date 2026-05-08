"use client";

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { Facilitator } from "@/types/facilitator";
import FacilitatorCard from "@/components/FacilitatorCard";
import FilterBar from "@/components/FilterBar";
import StatsBar from "@/components/StatsBar";
import { RefreshCw, Briefcase, MessageSquare, Calendar, Copy, Check, Link2 } from "lucide-react";
import Link from "next/link";
import FacilitatorDrawer from "@/components/FacilitatorDrawer";

const MapView = lazy(() => import("@/components/MapView"));
const CalendarView = lazy(() => import("@/components/CalendarView"));

export default function Home() {
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [focusFilter, setFocusFilter] = useState("All");
  const [expFilter, setExpFilter] = useState("All");
  const [availFilter, setAvailFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [availableOn, setAvailableOn] = useState<string>("");
  const [view, setView] = useState<"cards" | "map" | "calendar">("cards");
  const [drawerFacilitator, setDrawerFacilitator] = useState<Facilitator | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilitators?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      // Sort alphabetically by name — the sheet isn't sorted, so we sort
      // here so the cards/map/chat results all render in a predictable
      // order. Uses localeCompare so accented names ("Anja Novković",
      // "Alejandro") fall into the right slot.
      if (Array.isArray(data)) {
        data.sort((a: { name: string }, b: { name: string }) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );
      }
      setFacilitators(data);
    } catch {
      setError("Failed to load facilitator data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Auto-refresh from the Google Sheet so edits show up without a manual click.
   * Polls every 60 seconds while the tab is visible (cheap, since the API is
   * already `cache: no-store` and the sheet fetch is fast), and fires
   * immediately whenever the tab regains focus — i.e. you alt-tab from the
   * sheet back to the app and it's already current.
   */
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
  }, [fetchData]);

  // Build the industry option list from the loaded data — keeps the dropdown
  // in sync with whatever bios + sheet columns produced after parsing.
  const industryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of facilitators) {
      for (const ind of f.industryExperience || []) {
        counts.set(ind, (counts.get(ind) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [facilitators]);

  const filtered = useMemo(() => {
    return facilitators.filter((f) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        f.name.toLowerCase().includes(q) ||
        f.location.toLowerCase().includes(q) ||
        f.bio.toLowerCase().includes(q) ||
        f.country.toLowerCase().includes(q) ||
        (f.industryExperience || []).some((i) => i.toLowerCase().includes(q)) ||
        (f.pastCompanies || []).some((c) => c.toLowerCase().includes(q)) ||
        (f.pastRoles || []).some((r) => r.toLowerCase().includes(q));
      const matchesFocus = focusFilter === "All" || f.focus === focusFilter;
      const matchesExp = expFilter === "All" || f.experienceLevel === expFilter;
      const matchesAvail = availFilter === "All" || f.availability === availFilter;
      const matchesRegion = regionFilter === "All" || f.region === regionFilter;
      const matchesIndustry =
        industryFilter === "All" ||
        (f.industryExperience || []).some(
          (i) => i.toLowerCase() === industryFilter.toLowerCase()
        );
      const matchesDate =
        !availableOn ||
        (f.availableWindows?.some(
          (w) => availableOn >= w.start && availableOn <= w.end
        ) ?? false);
      return (
        matchesSearch &&
        matchesFocus &&
        matchesExp &&
        matchesAvail &&
        matchesRegion &&
        matchesIndustry &&
        matchesDate
      );
    });
  }, [facilitators, search, focusFilter, expFilter, availFilter, regionFilter, industryFilter, availableOn]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.avif" alt="ArcticMind" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Facilitator Pool
              </h1>
              <p className="text-xs text-gray-500">
                Global workshop facilitators &amp; trainers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const url = `${window.location.origin}/availability`;
                try {
                  await navigator.clipboard.writeText(url);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  // Clipboard blocked — fall through to opening in new tab.
                  window.open(url, "_blank");
                }
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
              title="Copy facilitator availability form link"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  Link copied
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Share avail. form
                </>
              )}
            </button>
            <Link
              href="/chat"
              className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Ask
            </Link>
            <Link
              href="/engagements"
              className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Engagements
            </Link>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Stats */}
        <StatsBar
          facilitators={facilitators}
          activeFocus={focusFilter}
          onFocusClick={(focus) =>
            setFocusFilter(focus === focusFilter ? "All" : focus)
          }
        />

        {/* Filters */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          focusFilter={focusFilter}
          onFocusChange={setFocusFilter}
          expFilter={expFilter}
          onExpChange={setExpFilter}
          availFilter={availFilter}
          onAvailChange={setAvailFilter}
          regionFilter={regionFilter}
          onRegionChange={setRegionFilter}
          industryFilter={industryFilter}
          onIndustryChange={setIndustryFilter}
          industryOptions={industryOptions}
          view={view}
          onViewChange={setView}
          totalCount={facilitators.length}
          filteredCount={filtered.length}
        />

        {/* Availability date filter — pulls from the self-service form
            submissions stored in the Availability tab. Only shows
            facilitators whose declared windows include the picked date. */}
        <div className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-xl p-3">
          <span className="text-gray-500">Available on:</span>
          <input
            type="date"
            value={availableOn}
            onChange={(e) => setAvailableOn(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {availableOn && (
            <button
              onClick={() => setAvailableOn("")}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            Pulls from self-served{" "}
            <a href="/availability" className="text-indigo-600 hover:underline">
              availability form
            </a>
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {view === "cards" &&
              (filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((f) => (
                    <FacilitatorCard key={f.id} f={f} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  No facilitators match your filters.
                </div>
              ))}

            {view === "map" && (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                }
              >
                <div style={{ height: "600px" }}>
                  <MapView facilitators={filtered} />
                </div>
              </Suspense>
            )}

            {view === "calendar" && (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                }
              >
                <CalendarView
                  facilitators={filtered}
                  onPickFacilitator={setDrawerFacilitator}
                />
              </Suspense>
            )}

            {/* Legend for map */}
            {view === "map" && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Legend
                </h3>
                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    Facilitation
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    Tech
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-500" />
                    Both
                  </div>
                  <span className="text-gray-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Available
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    On Assignment
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Unavailable
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-gray-400">
          Facilitator Pool Manager &middot; Data sourced from Google Sheets
        </div>
      </footer>

      <FacilitatorDrawer
        facilitator={drawerFacilitator}
        onClose={() => setDrawerFacilitator(null)}
      />
    </main>
  );
}
