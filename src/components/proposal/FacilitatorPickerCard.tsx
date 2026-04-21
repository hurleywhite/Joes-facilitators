"use client";

import { Facilitator } from "@/types/facilitator";
import { Check } from "lucide-react";

export default function FacilitatorPickerCard({
  f,
  selected,
  onToggle,
}: {
  f: Facilitator;
  selected: boolean;
  onToggle: () => void;
}) {
  const availColor =
    f.availability === "Available"
      ? "bg-green-500"
      : f.availability === "On Assignment"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <button
      onClick={onToggle}
      className={`text-left bg-white border-2 rounded-xl p-4 transition-all hover:shadow-md ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-200"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}`
            }
            alt={f.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-gray-100 bg-indigo-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}`;
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${availColor}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm truncate">
              {f.name}
            </h3>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected ? "bg-indigo-600 text-white" : "bg-gray-100 text-transparent"
              }`}
            >
              <Check className="w-3 h-3" />
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{f.location}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            <Tag color="purple">{f.focus}</Tag>
            <Tag color="amber">{f.experienceLevel}</Tag>
            <Tag color="gray">{f.region}</Tag>
          </div>
          <div className="text-xs text-gray-600 mt-2 line-clamp-2">{f.bio}</div>
          <div className="text-xs text-gray-400 mt-1.5">
            {f.engagements.length} engagement{f.engagements.length !== 1 ? "s" : ""} · {f.availability}
          </div>
        </div>
      </div>
    </button>
  );
}

function Tag({
  color,
  children,
}: {
  color: "purple" | "amber" | "gray";
  children: React.ReactNode;
}) {
  const colors = {
    purple: "bg-purple-100 text-purple-700",
    amber: "bg-amber-100 text-amber-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
