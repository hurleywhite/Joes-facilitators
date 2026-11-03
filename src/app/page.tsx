"use client";

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { Facilitator } from "@/types/facilitator";
import { applyOverlay, readLocalOverlay } from "@/lib/overlay-merge";
import FacilitatorCard from "@/components/FacilitatorCard";
import FacilitatorRoster from "@/components/FacilitatorRoster";
import FilterBar, { View } from "@/components/FilterBar";
import StatsBar from "@/components/StatsBar";
import AppHeader, { HeaderButton } from "@/components/AppHeader";
import AskForDates from "@/components/AskForDates";
import { RefreshCw, CalendarPlus, X } from "lucide-react";
import FacilitatorDrawer from "@/components/FacilitatorDrawer";

const MapView = lazy(() => import("@/components/MapView"));
const CalendarView = lazy(() => import("@/components/CalendarView"));

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white py-20 text-sm text-ink-500">
      <RefreshCw className="h-4 w-4 animate-spin text-ink-400" />
      {label}
    </div>
  );
}

export default function Home() {
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [focusFilter, setFocusFilter] = useState("All");
  const [expFilter, setExpFilter] = useState("All");
  const [availFilter, setAvailFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [availableOn, setAvailableOn] = useState<string>("");
  // Roster is the right default on a laptop — it's the whole point of the
  // redesign. On a phone a six-column table can only scroll sideways, so
  // cards win there. Decided once on mount; after that it's the user's call.
  const [view, setView] = useState<View>("roster");
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("cards");
  }, []);
  const [drawerFacilitator, setDrawerFacilitator] = useState<Facilitator | null>(
    null
  );
  // Who you're about to ask about dates. Kept by id so the set survives
  // the 60s auto-refresh replacing every facilitator object.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) select ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilitators?t=${Date.now()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: Facilitator[] = await res.json();
      // Sort alphabetically by name — the sheet isn't sorted, so we sort
      // here so the roster/cards/map/chat results all render in a
      // predictable order. localeCompare so accented names ("Anja
      // Novković", "Alejandro") fall into the right slot.
      if (Array.isArray(data)) {
        data.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );
      }
      // Apply any locally-stored transcript patches on top of the server data.
      // This guarantees the operator sees their own applied updates even when
      // Vercel's per-lambda /tmp has cycled (see lib/overlay-merge.ts).
      const localOverlay = readLocalOverlay();
      setFacilitators(applyOverlay(data, localOverlay));
      setSyncedAt(new Date());
    } catch {
      setError("Couldn't reach the sheet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Auto-refresh from the Google Sheet so edits show up without a manual
   * click. Polls every 60s while the tab is visible, and fires immediately
   * whenever the tab regains focus — i.e. you alt-tab from the sheet back
   * to the app and it's already current.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchData();
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchData]);

  // Industry options come from the loaded data, most common first, so the
  // dropdown stays in sync with whatever the sheet + bio parsing produced.
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
    const q = search.trim().toLowerCase();
    return facilitators.filter((f) => {
      // Defensive lowercasing — any missing field used to throw and make
      // the whole search look broken with zero results for everything.
      const contains = (s: string | undefined | null) =>
        !!s && s.toLowerCase().includes(q);
      const matchesSearch =
        !q ||
        contains(f.name) ||
        contains(f.location) ||
        contains(f.bio) ||
        contains(f.country) ||
        contains(f.city) ||
        contains(f.region) ||
        contains(f.email) ||
        contains(f.notes) ||
        contains(f.focus) ||
        contains(f.tier) ||
        contains(f.experienceLevel) ||
        contains(f.availability) ||
        (f.languages || []).some((l) => contains(l)) ||
        (f.industryExperience || []).some((i) => contains(i)) ||
        (f.pastCompanies || []).some((c) => contains(c)) ||
        (f.pastRoles || []).some((r) => contains(r));
      const matchesFocus = focusFilter === "All" || f.focus === focusFilter;
      const matchesExp = expFilter === "All" || f.experienceLevel === expFilter;
      const matchesAvail =
        availFilter === "All" || f.availability === availFilter;
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
        ) ??
          false);
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
  }, [
    facilitators,
    search,
    focusFilter,
    expFilter,
    availFilter,
    regionFilter,
    industryFilter,
    availableOn,
  ]);

  // "N free" here counted the sheet's default Availability cell and
  // reported it as live fact. We don't have anyone's calendar, so the
  // header states the two things we can stand behind: how many people are
  // on the bench, and when we last read the sheet.
  const headerStatus = facilitators.length
    ? `${facilitators.length} on the bench${
        syncedAt
          ? ` · synced ${syncedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""
      }`
    : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-ink-50">
      <AppHeader status={headerStatus}>
        <HeaderButton
          onClick={fetchData}
          disabled={loading}
          title="Pull the latest from the sheet"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </HeaderButton>
      </AppHeader>

      <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-4 px-4 py-5 sm:px-6">
        <StatsBar
          facilitators={facilitators}
          activeFocus={focusFilter}
          onFocusClick={(focus) =>
            setFocusFilter(focus === focusFilter ? "All" : focus)
          }
        />

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
          availableOn={availableOn}
          onAvailableOnChange={setAvailableOn}
          view={view}
          onViewChange={setView}
          totalCount={facilitators.length}
          filteredCount={filtered.length}
        />

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stop-200 bg-stop-50 px-4 py-3 text-sm text-stop-700">
            <span>{error} The roster below may be out of date.</span>
            <button
              onClick={fetchData}
              className="font-medium underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {loading && facilitators.length === 0 && <Loading label="Loading the bench…" />}

        {!loading && !error && filtered.length === 0 && facilitators.length > 0 && (
          <div className="rounded-lg border border-ink-200 bg-white py-16 text-center">
            <p className="text-sm font-medium text-ink-800">
              Nobody matches all of those filters.
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Drop one, or{" "}
              <a href="/chat" className="text-arctic-700 underline underline-offset-2">
                describe the deal in plain English
              </a>{" "}
              and let the matcher find the closest fits.
            </p>
          </div>
        )}

        {!error && filtered.length > 0 && (
          <>
            {view === "roster" && (
              <FacilitatorRoster
                facilitators={filtered}
                onOpen={setDrawerFacilitator}
                selected={selected}
                onToggle={toggleOne}
                onToggleAll={toggleMany}
              />
            )}

            {view === "cards" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((f) => (
                  <FacilitatorCard key={f.id} f={f} onOpen={setDrawerFacilitator} />
                ))}
              </div>
            )}

            {view === "map" && (
              <Suspense fallback={<Loading label="Loading the map…" />}>
                <div className="overflow-hidden rounded-lg border border-ink-200">
                  <div style={{ height: "640px" }}>
                    <MapView facilitators={filtered} />
                  </div>
                </div>
                {/* Pins are coloured by focus, not availability. An
                    earlier version of this legend described availability,
                    which the map has never shown. */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-xs text-ink-600">
                  <span className="eyebrow">Pin colour</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-arctic-500" />
                    Facilitation
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-arctic-300" />
                    Tech
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-arctic-800" />
                    Both
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ink-400" />
                    Focus not set
                  </span>
                </div>
              </Suspense>
            )}

            {view === "calendar" && (
              <Suspense fallback={<Loading label="Loading the timeline…" />}>
                <CalendarView
                  facilitators={filtered}
                  onPickFacilitator={setDrawerFacilitator}
                />
              </Suspense>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-ink-200 bg-white">
        <div className="tnum mx-auto max-w-[1600px] px-4 py-3 text-xs text-ink-400 sm:px-6">
          {syncedAt
            ? `Pool Data · last synced ${syncedAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} · refreshes every minute`
            : "Pool Data"}
        </div>
      </footer>

      {/* Nobody on the bench has ever submitted availability, so the
          roster can't answer "who's free in March". The missing piece was
          never the form — it was a way to ask particular people about
          particular dates. */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
            <span className="tnum text-sm text-ink-700">
              <span className="font-semibold">{selected.size}</span> selected
            </span>
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-arctic-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-arctic-700"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Ask about dates
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>
      )}

      {asking && (
        <AskForDates
          people={facilitators.filter((f) => selected.has(f.id))}
          onClose={() => setAsking(false)}
        />
      )}

      <FacilitatorDrawer
        facilitator={drawerFacilitator}
        onClose={() => setDrawerFacilitator(null)}
      />
    </main>
  );
}
