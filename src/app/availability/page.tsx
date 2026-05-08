"use client";

import { useState } from "react";
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
  const [quarter, setQuarter] = useState<number>(currentQuarter());
  const [blockedRanges, setBlockedRanges] = useState<
    Array<{ start: string; end: string }>
  >([{ start: "", end: "" }]);
  const [willingToTravel, setWillingToTravel] = useState<Travel>("Yes");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          quarter: mode === "quarter" ? quarter : undefined,
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Got it, thanks!</h1>
          <p className="text-sm text-gray-600">
            Your availability has been recorded. The team will see it
            automatically — no further action needed.
          </p>
          <button
            onClick={() => {
              setDone(false);
              setFirstName("");
              setLastName("");
              setBlockedRanges([{ start: "", end: "" }]);
              setNotes("");
            }}
            className="mt-6 text-xs text-indigo-600 hover:text-indigo-800"
          >
            Submit another response
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">
            Set your availability
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Let us know when you&apos;re open to facilitate engagements. You
            can update this any time.
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

        {/* Mode */}
        <Field label="When are you available?" required>
          <div className="space-y-2">
            <RadioRow
              checked={mode === "rest_of_year"}
              onChange={() => setMode("rest_of_year")}
              title="Available for the rest of the year"
              subtitle="Open for engagements through Dec 31"
            />
            <RadioRow
              checked={mode === "quarter"}
              onChange={() => setMode("quarter")}
              title="Available for a specific quarter"
              subtitle="Pick the quarter below"
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

        {/* Quarter — conditional */}
        {mode === "quarter" && (
          <Field label="Quarter" required>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuarter(q)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    quarter === q
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  Q{q}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {quarterLabel(year, quarter)}
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

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
            </>
          ) : (
            "Submit availability"
          )}
        </button>
      </div>
    </main>
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
