"use client";

import { Facilitator } from "@/types/facilitator";
import { statedAvailability } from "@/lib/availability-display";
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

  // No status light here either. The dot beside the name was green for
  // 82 of 84 people because that's the sheet's default, not because we
  // can see their calendars. See lib/availability-display.ts.
  const stated = statedAvailability(f);

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
        <div className="sticky top-0 z-10 bg-white border-b border-ink-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink-900 truncate">
                {f.name}
              </h2>
            </div>
            {f.location && (
              <div className="flex items-center gap-1 text-xs text-ink-500 mt-0.5">
                <MapPin className="w-3 h-3" />
                {f.location}
                <span className="text-ink-300">·</span>
                <span>{f.region}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-ink-100 text-ink-500"
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
                `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`
              }
              alt={f.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-ink-100 bg-arctic-100"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-800">
                {f.focus ?? "Focus not set"}
                <span className="text-ink-300"> · </span>
                {f.experienceLevel === "High"
                  ? "Top"
                  : f.experienceLevel === "Medium"
                    ? "Mid"
                    : "Low"}{" "}
                tier
              </p>
              {stated && (
                <p className="tnum mt-0.5 text-sm text-ink-500">
                  {stated.line}
                  {stated.sub && (
                    <span className="text-ink-400"> · {stated.sub}</span>
                  )}
                </p>
              )}
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-arctic-50 text-arctic-700 border border-arctic-100 rounded-lg hover:bg-arctic-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> LinkedIn
                </a>
              )}
              {f.demoVideoUrl && (
                <a
                  href={f.demoVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-stop-50 text-stop-700 border border-stop-200 rounded-lg hover:bg-stop-50"
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Watch demo
                </a>
              )}
              {f.email && (
                <a
                  href={`mailto:${f.email}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-ink-50 text-ink-700 border border-ink-200 rounded-lg hover:bg-ink-100"
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              )}
              {f.website && (
                <a
                  href={f.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-ink-50 text-ink-700 border border-ink-200 rounded-lg hover:bg-ink-100"
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
                      className="text-sm text-ink-700 inline-flex items-center gap-1.5 px-2 py-0.5 bg-ok-50 border border-ok-200 text-ok-700 rounded mr-1"
                    >
                      {formatWindow(w.start, w.end)}
                    </li>
                  ))}
                </ul>
              )}
              {f.willingToTravel && (
                <div className="text-xs text-ink-600 inline-flex items-center gap-1">
                  <Plane className="w-3 h-3" />
                  Travel:{" "}
                  <span className="font-medium text-ink-800">
                    {f.willingToTravel === "Domestic"
                      ? "Domestic only"
                      : f.willingToTravel}
                  </span>
                </div>
              )}
              {f.availabilityNotes && (
                <div className="text-xs text-ink-500 mt-1.5 italic">
                  &ldquo;{f.availabilityNotes}&rdquo;
                </div>
              )}
              {f.availabilityUpdatedAt && (
                <div className="text-[10px] text-ink-400 mt-1.5">
                  Updated {new Date(f.availabilityUpdatedAt).toLocaleDateString()}
                </div>
              )}
            </Section>
          )}

          {/* Bio */}
          {f.bio && (
            <Section title="About">
              <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
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
                    className="text-[11px] px-2 py-0.5 bg-ink-50 text-ink-700 border border-ink-100 rounded-full"
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
                    className="text-[11px] px-2 py-0.5 bg-white border border-ink-200 text-ink-700 rounded-full"
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
                    className="text-[11px] px-2 py-0.5 bg-white border border-arctic-200 text-arctic-700 rounded-full font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* English is dropped here the way it is everywhere else. It's
              true of effectively the whole bench, so listing it tells you
              nothing and buries the language that would actually decide a
              staffing call. */}
          {f.languages?.some((l) => l.toLowerCase() !== "english") && (
            <Section title="Languages besides English">
              <div className="flex flex-wrap gap-1">
                {f.languages
                  .filter((l) => l.toLowerCase() !== "english")
                  .map((l) => (
                    <span
                      key={l}
                      className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700"
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
                    <span className="text-ink-700">{eng.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-400">{eng.date}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          eng.status === "Active"
                            ? "bg-ok-50 text-ok-700"
                            : eng.status === "Completed"
                              ? "bg-ink-100 text-ink-600"
                              : "bg-ink-50 text-ink-400"
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
      <h3 className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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
