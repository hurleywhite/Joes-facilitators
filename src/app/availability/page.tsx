"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, AlertCircle, Plus, X } from "lucide-react";

/**
 * Public, no-auth form for facilitators to submit their own availability.
 *
 * Distributed via a direct link (e.g. arcticmind.app/availability).
 * Intentionally shows nothing about the facilitator portal — it's a
 * write-only surface. The submission is forwarded to the Apps Script
 * web app, which appends a row to the Availability tab of the Pool
 * Data spreadsheet.
 */

type Mode = "rest_of_year" | "quarter" | "blocked";
type Travel = "Yes" | "Domestic" | "No";

const CURRENT_YEAR = new Date().getFullYear();

export default function AvailabilityPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mode, setMode] = useState<Mode>("rest_of_year");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  // Multi-select quarters. Past quarters in the current year are hidden,
  // so the initial selection picks the next quarter that hasn't ended.
  const [quarters, setQuarters] = useState<Set<number>>(
    () => new Set([currentOrNextQuarter()])
  );
  const [blockedRanges, setBlockedRanges] = useState<
    Array<{ start: string; end: string }>
  >([{ start: "", end: "" }]);
  const [willingToTravel, setWillingToTravel] = useState<Travel>("Yes");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the year changes, drop any selected quarters that are no longer
  // selectable (e.g. user picked Q3 in current year, then switched to a
  // future year — selection stays valid; vice versa, if someone had
  // bizarrely selected a past quarter and switched to current year, it
  // gets pruned). If the selection ends up empty, seed it.
  useEffect(() => {
    setQuarters((prev) => {
      const next = new Set(
        Array.from(prev).filter((q) => isQuarterSelectable(year, q))
      );
      if (next.size === 0) next.add(currentOrNextQuarter());
      return next;
    });
  }, [year]);

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (mode === "blocked") {
      const valid = blockedRanges.filter((r) => r.start);
      if (valid.length === 0) {
        setError("Add at least one blocked date range.");
        return;
      }
    }
    if (mode === "quarter" && quarters.size === 0) {
      setError("Pick at least one quarter.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/availability/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          mode,
          year,
          // Multi-select — send sorted array. The submit API and Apps
          // Script both accept either `quarters: number[]` or the legacy
          // single `quarter` field.
          quarters:
            mode === "quarter"
              ? Array.from(quarters).sort((a, b) => a - b)
              : undefined,
          blockedRanges:
            mode === "blocked"
              ? blockedRanges
                  .filter((r) => r.start)
                  .map((r) => ({ start: r.start, end: r.end || r.start }))
              : undefined,
          willingToTravel,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex flex-col">
        <Header minimal />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-md w-full p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Got it, thanks!
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your availability has been recorded. The ArcticMind team will see
              it automatically — no further action needed. You can resubmit any
              time to update your windows.
            </p>
            <button
              onClick={() => {
                setDone(false);
                setFirstName("");
                setLastName("");
                setBlockedRanges([{ start: "", end: "" }]);
                setNotes("");
              }}
              className="mt-6 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Submit another response →
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex flex-col">
      <Header />
      <div className="flex-1 py-10 px-4">
        <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm p-8 sm:p-10 space-y-7">
        <header className="border-b border-gray-100 pb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Share your availability
          </h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Let the ArcticMind team know when you&apos;re open to facilitate
            engagements. We&apos;ll match you with the right engagements. You
            can update this any time — your latest submission overwrites the
            previous one.
          </p>
        </header>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
              autoComplete="family-name"
            />
          </Field>
        </div>

        {/* Mode — labels adapt to the picked year. For a future year
            "rest of the year" doesn't make sense (the whole year is
            ahead) so it switches to "entire year". */}
        <Field label="When are you available?" required>
          <div className="space-y-2">
            <RadioRow
              checked={mode === "rest_of_year"}
              onChange={() => setMode("rest_of_year")}
              title={
                year > CURRENT_YEAR
                  ? `Available for the entire year (${year})`
                  : "Available for the rest of the year"
              }
              subtitle={
                year > CURRENT_YEAR
                  ? `Open for engagements Jan 1 – Dec 31, ${year}`
                  : "Open for engagements through Dec 31"
              }
            />
            <RadioRow
              checked={mode === "quarter"}
              onChange={() => setMode("quarter")}
              title="Available for specific quarter(s)"
              subtitle="Pick one or more quarters below"
            />
            <RadioRow
              checked={mode === "blocked"}
              onChange={() => setMode("blocked")}
              title="Block off specific dates"
              subtitle="Otherwise available rest of year"
            />
          </div>
        </Field>

        {/* Year (always) */}
        <Field label="Year">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className={inputClass}
          >
            <option value={CURRENT_YEAR}>{CURRENT_YEAR}</option>
            <option value={CURRENT_YEAR + 1}>{CURRENT_YEAR + 1}</option>
          </select>
        </Field>

        {/* Quarter(s) — multi-select. Past quarters of the current
            year are hidden so a facilitator filling this out in May
            doesn't see Q1 as an option. Future years show all four. */}
        {mode === "quarter" && (
          <Field label="Quarters" required>
            <div className="flex gap-2">
              {[1, 2, 3, 4]
                .filter((q) => isQuarterSelectable(year, q))
                .map((q) => {
                  const selected = quarters.has(q);
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() =>
                        setQuarters((prev) => {
                          const next = new Set(prev);
                          if (next.has(q)) next.delete(q);
                          else next.add(q);
                          return next;
                        })
                      }
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      Q{q}
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {quarters.size > 0
                ? Array.from(quarters)
                    .sort((a, b) => a - b)
                    .map((q) => quarterLabel(year, q))
                    .join(" · ")
                : "Pick one or more quarters"}
            </p>
          </Field>
        )}

        {/* Blocked ranges — conditional */}
        {mode === "blocked" && (
          <Field label="Dates you're blocking off" required>
            <div className="space-y-2">
              {blockedRanges.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={r.start}
                    onChange={(e) =>
                      setBlockedRanges((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, start: e.target.value } : p
                        )
                      )
                    }
                    className={inputClass}
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="date"
                    value={r.end}
                    onChange={(e) =>
                      setBlockedRanges((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, end: e.target.value } : p
                        )
                      )
                    }
                    className={inputClass}
                  />
                  {blockedRanges.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setBlockedRanges((prev) =>
                          prev.filter((_, j) => j !== i)
                        )
                      }
                      className="text-gray-400 hover:text-red-500"
                      aria-label="Remove range"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setBlockedRanges((prev) => [...prev, { start: "", end: "" }])
                }
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3 h-3" /> Add another range
              </button>
            </div>
          </Field>
        )}

        {/* Travel */}
        <Field label="Willing to travel?" required>
          <div className="flex gap-2">
            {(["Yes", "Domestic", "No"] as Travel[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setWillingToTravel(t)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  willingToTravel === t
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                }`}
              >
                {t === "Domestic" ? "Domestic only" : t}
              </button>
            ))}
          </div>
        </Field>

        {/* Notes */}
        <Field label="Anything else? (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything we should know — preferred lead time, regions to avoid, ongoing constraints…"
            className={inputClass}
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 shadow-sm transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
            ) : (
              "Submit availability"
            )}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-3">
            Your response is shared only with the ArcticMind facilitation
            team. We don&apos;t share it externally.
          </p>
        </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}

/* ---------- header / footer ---------- */

function Header({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className="bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.avif" alt="ArcticMind" className="h-8 w-auto" />
          <div>
            <div className="text-sm font-bold text-gray-900 tracking-tight">
              ArcticMind
            </div>
            {!minimal && (
              <div className="text-[11px] text-gray-500">
                Facilitator availability
              </div>
            )}
          </div>
        </div>
        <a
          href="https://arcticblue.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          arcticblue.ai
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 mt-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          ArcticMind &middot; AI training &amp; facilitation
        </span>
        <span>Questions? team@arcticblue.ai</span>
      </div>
    </footer>
  );
}

/* ---------- helpers ---------- */

const inputClass =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-200"
          : "border-gray-200 hover:border-indigo-300"
      }`}
    >
      <span
        className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 ${
          checked ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
        }`}
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{subtitle}</span>
      </span>
    </button>
  );
}

function currentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

/**
 * Pick a sane default quarter. If we're still inside the current
 * quarter, default to it. Otherwise (we're past Mar 31 / Jun 30 / etc.)
 * default to the next one. If we're already in Q4, default to Q4 (the
 * year picker will fall back to current year, and Q4 is the only
 * remaining option).
 */
function currentOrNextQuarter(): number {
  const today = new Date();
  const month = today.getMonth(); // 0..11
  const day = today.getDate();
  // Quarter ends: Mar 31, Jun 30, Sep 30, Dec 31
  const endsByQuarter = [
    new Date(today.getFullYear(), 2, 31),
    new Date(today.getFullYear(), 5, 30),
    new Date(today.getFullYear(), 8, 30),
    new Date(today.getFullYear(), 11, 31),
  ];
  for (let q = 1; q <= 4; q++) {
    if (endsByQuarter[q - 1] >= today) return q;
  }
  return 4;
}

/**
 * Quarters that have already ended in the current year are hidden.
 * For a future year (year > today's year), all four quarters are
 * selectable. For the current year, hide quarters whose last day is
 * before today.
 */
function isQuarterSelectable(year: number, q: number): boolean {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (year > today.getFullYear()) return true;
  if (year < today.getFullYear()) return false;
  // Same year — show this quarter only if its end is today or later.
  const endMonth = q * 3 - 1; // 0-indexed: Q1→2, Q2→5, Q3→8, Q4→11
  const lastDay = new Date(year, endMonth + 1, 0); // day 0 of next month = last day of this month
  return lastDay >= startOfToday;
}

function quarterLabel(year: number, q: number): string {
  const months = [
    ["Jan", "Mar"],
    ["Apr", "Jun"],
    ["Jul", "Sep"],
    ["Oct", "Dec"],
  ];
  const [start, end] = months[q - 1];
  return `${start} 1, ${year} – ${end} 30/31, ${year}`;
}
