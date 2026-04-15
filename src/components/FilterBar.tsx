"use client";

import { Search, Filter, LayoutGrid, Map as MapIcon } from "lucide-react";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  focusFilter: string;
  onFocusChange: (v: string) => void;
  expFilter: string;
  onExpChange: (v: string) => void;
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

        {/* Focus filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={focusFilter}
            onChange={(e) => onFocusChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="All">All Focus</option>
            <option value="Facilitation">Facilitation</option>
            <option value="Tech">Tech</option>
            <option value="Both">Both</option>
          </select>
        </div>

        {/* Experience filter */}
        <select
          value={expFilter}
          onChange={(e) => onExpChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="All">All Experience</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

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

      {/* Results count */}
      <div className="mt-2 text-xs text-gray-400">
        Showing {filteredCount} of {totalCount} facilitators
      </div>
    </div>
  );
}
