"use client";

import { Facilitator } from "@/types/facilitator";
import {
  X,
  ExternalLink,
  MapPin,
  PlayCircle,
  Briefcase,
  Mail,
  Globe,
  Calendar,
  Plane,
} from "lucide-react";
import { useEffect } from "react";

/**
 * Slide-over drawer that shows a single facilitator's full profile.
 *
 * Used from the engagements page (clicking a facilitator chip) and
 * available anywhere else we want a "click to learn more" affordance
 * without leaving the current page.
 *
 * Closes on backdrop click and on Escape so it never traps the user.
 */
export default function FacilitatorDrawer({
  facilitator,
  onClose,
}: {
  facilitator: Facilitator | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!facilitator) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while drawer is open so the underlying list
    // doesn't scroll behind it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [facilitator, onClose]);

  if (!facilitator) return null;
  const f = facilitator;

  const availColor =
    f.availability === "Available"
      ? "bg-green-500"
      : f.availability === "On Assignment"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto">
        {/* Sticky header — name, location, close. Stays visible while
            the bio + companies + roles scroll. */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {f.name}
              </h2>
              <span
                className={`w-2.5 h-2.5 rounded-full ${availColor}`}
                title={f.availability}
              />
            </div>
            {f.location && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <MapPin className="w-3 h-3" />
                {f.location}
                <span className="text-gray-300">·</span>
                <span>{f.region}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Avatar + quick badges */}
          <div className="flex items-start gap-4">
            <img
              src={
                f.photoUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`
              }
              alt={f.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-100 bg-indigo-100"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`;
              }}
            />
            <div className="flex-1 flex flex-wrap gap-1.5">
              {f.focus && (
                <Tag tone="purple">{f.focus}</Tag>
              )}
              <Tag tone="amber">
                {f.experienceLevel === "High"
                  ? "Top tier"
                  : f.experienceLevel === "Medium"
                    ? "Mid tier"
                    : "Low tier"}
              </Tag>
              <Tag tone="gray">{f.availability}</Tag>
            </div>
          </div>

          {/* Action links */}
          {(f.linkedinUrl || f.demoVideoUrl || f.email || f.website) && (
            <div className="flex flex-wrap gap-2">
              {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
                <a
                  href={f.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> LinkedIn
                </a>
              )}
              {f.demoVideoUrl && (
                <a
                  href={f.demoVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-100 rounded-lg hover:bg-red-100"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Watch demo
                </a>
              )}
              {f.email && (
                <a
                  href={`mailto:${f.email}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              )}
              {f.website && (
                <a
                  href={f.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  <Globe className="w-3.5 h-3.5" /> Website
                </a>
              )}
            </div>
          )}

          {/* Availability — surfaced near the top because it's the
              question Joe is most often answering ("can they take this
              deal?"). Empty when the facilitator hasn't filled the
              self-service form yet. */}
          {(f.availableWindows?.length || f.willingToTravel) && (
            <Section title="Availability" icon={<Calendar className="w-3 h-3" />}>
              {f.availableWindows && f.availableWindows.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {f.availableWindows.map((w, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-700 inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-100 text-green-800 rounded mr-1"
                    >
                      {formatWindow(w.start, w.end)}
                    </li>
                  ))}
                </ul>
              )}
              {f.willingToTravel && (
                <div className="text-xs text-gray-600 inline-flex items-center gap-1">
                  <Plane className="w-3 h-3" />
                  Travel:{" "}
                  <span className="font-medium text-gray-800">
                    {f.willingToTravel === "Domestic"
                      ? "Domestic only"
                      : f.willingToTravel}
                  </span>
                </div>
              )}
              {f.availabilityNotes && (
                <div className="text-xs text-gray-500 mt-1.5 italic">
                  &ldquo;{f.availabilityNotes}&rdquo;
                </div>
              )}
              {f.availabilityUpdatedAt && (
                <div className="text-[10px] text-gray-400 mt-1.5">
                  Updated {new Date(f.availabilityUpdatedAt).toLocaleDateString()}
                </div>
              )}
            </Section>
          )}

          {/* Bio */}
          {f.bio && (
            <Section title="About">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {f.bio}
              </p>
            </Section>
          )}

          {/* Industries */}
          {f.industryExperience?.length > 0 && (
            <Section title="Industry experience">
              <div className="flex flex-wrap gap-1">
                {f.industryExperience.map((i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full"
                  >
                    {i}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {(f.pastRoles?.length || 0) > 0 && (
            <Section title="Past roles" icon={<Briefcase className="w-3 h-3" />}>
              <div className="flex flex-wrap gap-1">
                {f.pastRoles!.map((r) => (
                  <span
                    key={r}
                    className="text-[11px] px-2 py-0.5 bg-white border border-gray-200 text-gray-700 rounded-full"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {(f.pastCompanies?.length || 0) > 0 && (
            <Section title="Has worked with">
              <div className="flex flex-wrap gap-1">
                {f.pastCompanies!.map((c) => (
                  <span
                    key={c}
                    className="text-[11px] px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {f.languages?.length > 0 && (
            <Section title="Languages">
              <div className="flex flex-wrap gap-1">
                {f.languages.map((l) => (
                  <span
                    key={l}
                    className="text-[11px] px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {f.engagements.length > 0 && (
            <Section title="Engagement history">
              <ul className="space-y-1.5">
                {f.engagements.map((eng, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">{eng.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{eng.date}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          eng.status === "Active"
                            ? "bg-green-100 text-green-700"
                            : eng.status === "Completed"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-gray-50 text-gray-400"
                        }`}
                      >
                        {eng.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Pretty-print an availability window. Same year → "May 1 – Sep 30".
 * Cross-year → "Dec 15, 2026 – Jan 10, 2027". Single day → "May 5".
 */
function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  const fmt = (d: Date, includeYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: includeYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  if (startIso === endIso) {
    return fmt(start, start.getUTCFullYear() !== new Date().getUTCFullYear());
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (sameYear) {
    const includeYear = start.getUTCFullYear() !== new Date().getUTCFullYear();
    return `${fmt(start, false)} – ${fmt(end, includeYear)}`;
  }
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

function Tag({
  tone,
  children,
}: {
  tone: "purple" | "amber" | "gray";
  children: React.ReactNode;
}) {
  const map = {
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}
