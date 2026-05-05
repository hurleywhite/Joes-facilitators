"use client";

import { Search, Filter, LayoutGrid, Map as MapIcon } from "lucide-react";

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
  view: "cards" | "map";
  onViewChange: (v: "cards" | "map") => void;
  totalCount: number;
  filteredCount: number;
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
  view,
  onViewChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, location, or keyword..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>

        {/* View toggle */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => onViewChange("cards")}
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              view === "cards"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Cards
          </button>
          <button
            onClick={() => onViewChange("map")}
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              view === "map"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <MapIcon className="w-4 h-4" />
            Map
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Filter className="w-4 h-4 text-gray-400" />

        {/* Availability filter */}
        <select
          value={availFilter}
          onChange={(e) => onAvailChange(e.target.value)}
          className={`border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
            availFilter !== "All"
              ? "border-green-400 text-green-700 bg-green-50"
              : "border-gray-200"
          }`}
        >
          <option value="All">All Availability</option>
          <option value="Available">🟢 Available</option>
          <option value="On Assignment">🟡 On Assignment</option>
          <option value="Unavailable">🔴 Unavailable</option>
        </select>

        {/* Region filter */}
        <select
          value={regionFilter}
          onChange={(e) => onRegionChange(e.target.value)}
          className={`border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
            regionFilter !== "All"
              ? "border-indigo-400 text-indigo-700 bg-indigo-50"
              : "border-gray-200"
          }`}
        >
          <option value="All">All Regions</option>
          <option value="Americas">Americas</option>
          <option value="Europe">Europe</option>
          <option value="Asia-Pacific">Asia-Pacific</option>
          <option value="Middle East & Africa">Middle East & Africa</option>
        </select>

        {/* Focus filter */}
        <select
          value={focusFilter}
          onChange={(e) => onFocusChange(e.target.value)}
          className={`border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
            focusFilter !== "All"
              ? "border-purple-400 text-purple-700 bg-purple-50"
              : "border-gray-200"
          }`}
        >
          <option value="All">All Focus</option>
          <option value="Facilitation">Facilitation</option>
          <option value="Tech">Tech</option>
          <option value="Both">Both</option>
        </select>

        {/* Experience filter */}
        <select
          value={expFilter}
          onChange={(e) => onExpChange(e.target.value)}
          className={`border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
            expFilter !== "All"
              ? "border-amber-400 text-amber-700 bg-amber-50"
              : "border-gray-200"
          }`}
        >
          <option value="All">All Tiers</option>
          <option value="High">Top</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Results count */}
      <div className="mt-2 text-xs text-gray-400">
        Showing {filteredCount} of {totalCount} facilitators
      </div>
    </div>
  );
}
