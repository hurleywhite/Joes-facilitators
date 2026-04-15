"use client";

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { Facilitator } from "@/types/facilitator";
import FacilitatorCard from "@/components/FacilitatorCard";
import FilterBar from "@/components/FilterBar";
import StatsBar from "@/components/StatsBar";
import { RefreshCw } from "lucide-react";

// Lazy-load the map since Leaflet is client-only and heavy
const MapView = lazy(() => import("@/components/MapView"));

export default function Home() {
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [focusFilter, setFocusFilter] = useState("All");
  const [expFilter, setExpFilter] = useState("All");
  const [view, setView] = useState<"cards" | "map">("cards");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilitators?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
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

  const filtered = useMemo(() => {
    return facilitators.filter((f) => {
      const matchesSearch =
        !search ||
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.location.toLowerCase().includes(search.toLowerCase()) ||
        f.bio.toLowerCase().includes(search.toLowerCase()) ||
        f.country.toLowerCase().includes(search.toLowerCase());
      const matchesFocus =
        focusFilter === "All" || f.focus === focusFilter;
      const matchesExp =
        expFilter === "All" || f.experienceLevel === expFilter;
      return matchesSearch && matchesFocus && matchesExp;
    });
  }, [facilitators, search, focusFilter, expFilter]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.avif"
              alt="ArcticMind"
              className="h-10 w-auto"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Facilitator Pool
              </h1>
              <p className="text-xs text-gray-500">
                Global workshop facilitators &amp; trainers
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Stats */}
        <StatsBar
          facilitators={facilitators}
          activeFocus={focusFilter}
          onFocusClick={(focus) => setFocusFilter(focus === focusFilter ? "All" : focus)}
        />

        {/* Filters */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          focusFilter={focusFilter}
          onFocusChange={setFocusFilter}
          expFilter={expFilter}
          onExpChange={setExpFilter}
          view={view}
          onViewChange={setView}
          totalCount={facilitators.length}
          filteredCount={filtered.length}
        />

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {view === "cards" ? (
              filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((f) => (
                    <FacilitatorCard key={f.id} f={f} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  No facilitators match your filters.
                </div>
              )
            ) : (
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
                    <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
                    High Exp. (larger)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-gray-300" />
                    Medium
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full border-2 border-gray-300" />
                    Low
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
    </main>
  );
}
