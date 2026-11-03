"use client";

import { Facilitator } from "@/types/facilitator";
import { Check, PlayCircle } from "lucide-react";

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
      ? "bg-ok-600"
      : f.availability === "On Assignment"
        ? "bg-warn-600"
        : "bg-stop-600";

  return (
    <button
      onClick={onToggle}
      className={`text-left bg-white border-2 rounded-xl p-4 transition-all hover:shadow-md ${
        selected
          ? "border-arctic-500 ring-2 ring-arctic-200"
          : "border-ink-200 hover:border-ink-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}`
            }
            alt={f.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-ink-100 bg-arctic-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}`;
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${availColor}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-semibold text-ink-900 text-sm truncate">
                {f.name}
              </h3>
              {f.demoVideoUrl && (
                <a
                  href={f.demoVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-stop-600 hover:text-stop-700 flex-shrink-0"
                  title="Watch demo video"
                >
                  <PlayCircle className="w-4 h-4" />
                </a>
              )}
            </div>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected ? "bg-arctic-600 text-white" : "bg-ink-100 text-transparent"
              }`}
            >
              <Check className="w-3 h-3" />
            </span>
          </div>
          <div className="text-xs text-ink-500 mt-0.5">{f.location}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            <Tag color="purple">{f.focus}</Tag>
            <Tag color="amber">{f.experienceLevel}</Tag>
            <Tag color="gray">{f.region}</Tag>
          </div>
          <div className="text-xs text-ink-600 mt-2 line-clamp-2">{f.bio}</div>
          <div className="text-xs text-ink-400 mt-1.5">
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
    purple: "bg-ink-100 text-ink-700",
    amber: "bg-warn-50 text-warn-700",
    gray: "bg-ink-100 text-ink-600",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
