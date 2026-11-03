"use client";

import { Search, LayoutGrid, Map as MapIcon, Calendar, Rows3, X } from "lucide-react";

export type View = "roster" | "cards" | "map" | "calendar";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  focusFilter: string;
  onFocusChange: (v: string) => void;
  expFilter: string;
  onExpChange: (v: string) => void;
  availFilter: string;
  onAvailChange: (v: string) => void;
  regionFilter: string;
  onRegionChange: (v: string) => void;
  industryFilter: string;
  onIndustryChange: (v: string) => void;
  industryOptions: string[];
  availableOn: string;
  onAvailableOnChange: (v: string) => void;
  view: View;
  onViewChange: (v: View) => void;
  totalCount: number;
  filteredCount: number;
}

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "roster", label: "Roster", icon: <Rows3 className="h-3.5 w-3.5" /> },
  { key: "cards", label: "Cards", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: "map", label: "Map", icon: <MapIcon className="h-3.5 w-3.5" /> },
  { key: "calendar", label: "Calendar", icon: <Calendar className="h-3.5 w-3.5" /> },
];

/** One shape for every dropdown. Active state is weight + a left accent
 *  rule, never a different hue per filter — the old bar used five. */
function selectClass(active: boolean) {
  return `rounded-md border py-1.5 pl-2.5 text-sm transition-colors ${
    active
      ? "border-arctic-300 bg-arctic-50 font-medium text-arctic-800"
      : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
  }`;
}

export default function FilterBar({
  search,
  onSearchChange,
  focusFilter,
  onFocusChange,
  expFilter,
  onExpChange,
  availFilter,
  onAvailChange,
  regionFilter,
  onRegionChange,
  industryFilter,
  onIndustryChange,
  industryOptions,
  availableOn,
  onAvailableOnChange,
  view,
  onViewChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const activeCount =
    [focusFilter, expFilter, availFilter, regionFilter, industryFilter].filter(
      (v) => v !== "All"
    ).length + (availableOn ? 1 : 0) + (search.trim() ? 1 : 0);

  const clearAll = () => {
    onSearchChange("");
    onFocusChange("All");
    onExpChange("All");
    onAvailChange("All");
    onRegionChange("All");
    onIndustryChange("All");
    onAvailableOnChange("");
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search a name, city, language, industry, or a company they've worked with"
            className="w-full rounded-md border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 transition-colors hover:border-ink-300 focus:border-arctic-400"
          />
        </div>

        <div
          role="group"
          aria-label="View"
          className="inline-flex shrink-0 overflow-hidden rounded-md border border-ink-200 bg-white"
        >
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => onViewChange(v.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                i > 0 ? "border-l border-ink-200" : ""
              } ${
                view === v.key
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* These read off the sheet's Availability column, which is a
            field somebody types into — not a calendar. The labels say
            "marked" so the filter doesn't imply more than it knows. */}
        <select
          aria-label="Availability marked on the sheet"
          value={availFilter}
          onChange={(e) => onAvailChange(e.target.value)}
          className={selectClass(availFilter !== "All")}
          title="Reads the Availability column in the sheet. It is set by hand, not from anyone's calendar."
        >
          <option value="All">Any availability</option>
          <option value="Available">Marked available</option>
          <option value="On Assignment">Marked on assignment</option>
          <option value="Unavailable">Marked unavailable</option>
        </select>

        <select
          aria-label="Region"
          value={regionFilter}
          onChange={(e) => onRegionChange(e.target.value)}
          className={selectClass(regionFilter !== "All")}
        >
          <option value="All">Any region</option>
          <option value="Americas">Americas</option>
          <option value="Europe">Europe</option>
          <option value="Asia-Pacific">Asia-Pacific</option>
          <option value="Middle East & Africa">Middle East &amp; Africa</option>
        </select>

        <select
          aria-label="Focus"
          value={focusFilter}
          onChange={(e) => onFocusChange(e.target.value)}
          className={selectClass(focusFilter !== "All")}
        >
          <option value="All">Any focus</option>
          <option value="Facilitation">Facilitation</option>
          <option value="Tech">Tech</option>
          <option value="Both">Both</option>
        </select>

        <select
          aria-label="Tier"
          value={expFilter}
          onChange={(e) => onExpChange(e.target.value)}
          className={selectClass(expFilter !== "All")}
        >
          <option value="All">Any tier</option>
          <option value="High">Top</option>
          <option value="Medium">Mid</option>
          <option value="Low">Low</option>
        </select>

        {industryOptions.length > 0 && (
          <select
            aria-label="Industry"
            value={industryFilter}
            onChange={(e) => onIndustryChange(e.target.value)}
            className={selectClass(industryFilter !== "All")}
          >
            <option value="All">Any industry</option>
            {industryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {/* Date filter lives here now. It used to get its own full-width
            card below the filters, which separated it from the thing it
            filters and made it read like a feature rather than a control. */}
        <label
          className={`flex items-center gap-2 rounded-md border py-1.5 pl-2.5 pr-2 text-sm transition-colors ${
            availableOn
              ? "border-arctic-300 bg-arctic-50 text-arctic-800"
              : "border-ink-200 bg-white text-ink-600"
          }`}
          title="Only show people whose submitted windows cover this date"
        >
          <span className="whitespace-nowrap">Free on</span>
          <input
            type="date"
            value={availableOn}
            onChange={(e) => onAvailableOnChange(e.target.value)}
            className="tnum bg-transparent text-sm text-inherit outline-none"
          />
        </label>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-3.5 w-3.5" />
            Clear {activeCount}
          </button>
        )}

        <p className="tnum ml-auto text-xs text-ink-500">
          {filteredCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? "person" : "people"}`
            : `${filteredCount} of ${totalCount}`}
        </p>
      </div>
    </div>
  );
}
