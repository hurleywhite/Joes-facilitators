"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Sparkles,
  Files,
} from "lucide-react";
import type { ExtractResult } from "@/lib/transcript-extract";
import { addLocalPatch } from "@/lib/overlay-merge";

/* ---------------------------------------------------------------------------
 * Transcript Ingestion Page
 *
 * Three input modes:
 *   1) Drag-and-drop one or many transcript files
 *   2) "Click to upload" multi-file picker
 *   3) Batch paste box: paste many transcripts in one go, separated by lines
 *      like `--- transcript: filename ---` (auto-detected) or just `---`
 *
 * Pipeline:
 *   files / paste → /api/transcripts/extract → review UI with per-field
 *   evidence quotes → user confirms → /api/transcripts/apply → updates
 *   overlay, which the facilitators API merges on next refresh.
 * ------------------------------------------------------------------------ */

type TranscriptInput = { filename: string; text: string };

type FieldKey =
  | "availability"
  | "currentEngagement"
  | "location"
  | "bio"
  | "languages"
  | "industryExperience"
  | "tier"
  | "notes"
  | "email"
  | "website"
  | "employmentStatus"
  | "newEngagements";

const FIELD_LABELS: Record<FieldKey, string> = {
  availability: "Availability",
  currentEngagement: "Current Engagement",
  location: "Location",
  bio: "Bio",
  languages: "Languages",
  industryExperience: "Industry Experience",
  tier: "Tier",
  notes: "Notes",
  email: "Email",
  website: "Website",
  employmentStatus: "Employment Status",
  newEngagements: "New Engagements",
};

interface RowState {
  result: ExtractResult;
  // Which facilitator the user wants to apply this to (defaults to matched, or first candidate)
  chosenFacilitator: string;
  // Which fields are checked for application
  checkedFields: Record<FieldKey, boolean>;
}

export default function TranscriptsPage() {
  const [queue, setQueue] = useState<TranscriptInput[]>([]);
  const [batchText, setBatchText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<RowState[]>([]);
  const [applying, setApplying] = useState(false);
  const [applySummary, setApplySummary] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // --- File handling ------------------------------------------------------

  const readFile = (file: File): Promise<TranscriptInput> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ filename: file.name, text: String(reader.result || "") });
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const newInputs: TranscriptInput[] = [];
    for (const f of arr) {
      // Accept anything that's plausibly text
      try {
        const ti = await readFile(f);
        if (ti.text.trim().length > 0) newInputs.push(ti);
      } catch (err) {
        console.error("Failed to read file", f.name, err);
      }
    }
    setQueue((prev) => [...prev, ...newInputs]);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  // --- Batch paste handling ----------------------------------------------

  const parseBatchText = (text: string): TranscriptInput[] => {
    if (!text.trim()) return [];
    // Split on lines that look like markers: `---`, `===`, `### transcript`,
    // or `--- transcript: name ---`
    const lines = text.split(/\r?\n/);
    const sections: { name: string; lines: string[] }[] = [
      { name: "Pasted #1", lines: [] },
    ];
    let count = 1;
    const markerRe = /^\s*(?:-{3,}|={3,}|#{2,})\s*(?:transcript[:\-]?\s*)?(.*?)\s*(?:-{3,}|={3,})?\s*$/i;
    for (const line of lines) {
      const m = markerRe.exec(line);
      const trimmed = line.trim();
      const isMarker =
        (trimmed.startsWith("---") && trimmed.endsWith("---") && trimmed.length > 6) ||
        (trimmed.startsWith("===") && trimmed.endsWith("===") && trimmed.length > 6) ||
        /^#+\s*transcript/i.test(trimmed);
      if (isMarker) {
        // Start a new section, naming it from the marker if possible
        let name = `Pasted #${++count}`;
        if (m && m[1]) {
          const candidate = m[1].replace(/[-=]+/g, "").trim();
          if (candidate) name = candidate;
        }
        sections.push({ name, lines: [] });
      } else {
        sections[sections.length - 1].lines.push(line);
      }
    }
    return sections
      .map((s) => ({ filename: s.name, text: s.lines.join("\n").trim() }))
      .filter((s) => s.text.length > 0);
  };

  const addBatchToQueue = () => {
    const parsed = parseBatchText(batchText);
    if (parsed.length > 0) {
      setQueue((prev) => [...prev, ...parsed]);
      setBatchText("");
    }
  };

  const removeFromQueue = (idx: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== idx));
  };

  // --- Extraction ---------------------------------------------------------

  const runExtraction = async () => {
    if (queue.length === 0) return;
    setExtracting(true);
    setTopLevelError(null);
    setResults([]);
    setApplySummary(null);
    try {
      const res = await fetch("/api/transcripts/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcripts: queue }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Extract failed: ${res.status}`);
      }
      const json = (await res.json()) as { results: ExtractResult[] };

      const rows: RowState[] = json.results.map((r) => {
        const chosen =
          r.matchedFacilitator?.name ||
          r.candidates[0]?.name ||
          r.extraction.facilitatorName ||
          "";
        const checkedFields: Record<FieldKey, boolean> = {
          availability: !!r.extraction.availability,
          currentEngagement: !!r.extraction.currentEngagement,
          location: !!r.extraction.location,
          bio: !!r.extraction.bio,
          languages: !!(r.extraction.languages && r.extraction.languages.length),
          industryExperience: !!(
            r.extraction.industryExperience && r.extraction.industryExperience.length
          ),
          tier: !!r.extraction.tier,
          notes: !!r.extraction.notes,
          email: !!r.extraction.email,
          website: !!r.extraction.website,
          employmentStatus: !!r.extraction.employmentStatus,
          newEngagements: !!(
            r.extraction.newEngagements && r.extraction.newEngagements.length
          ),
        };
        return { result: r, chosenFacilitator: chosen, checkedFields };
      });

      setResults(rows);
      // Clear the queue once extraction has produced rows — user reviews next
      setQueue([]);
    } catch (err) {
      setTopLevelError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  // --- Apply --------------------------------------------------------------

  const applyChecked = async () => {
    setApplying(true);
    setTopLevelError(null);
    setApplySummary(null);
    try {
      const applications = results
        .filter((row) => row.chosenFacilitator.trim().length > 0)
        .map((row) => {
          const e = row.result.extraction;
          const patch: Record<string, unknown> = {};
          (Object.keys(row.checkedFields) as FieldKey[]).forEach((k) => {
            if (row.checkedFields[k]) patch[k] = e[k];
          });
          return {
            facilitatorName: row.chosenFacilitator,
            source: row.result.filename,
            patch: { ...patch, evidence: e.evidence },
          };
        })
        .filter((a) => Object.keys(a.patch).length > 1); // evidence + at least one field

      if (applications.length === 0) {
        setApplySummary("Nothing checked to apply.");
        setApplying(false);
        return;
      }

      const res = await fetch("/api/transcripts/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applications }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Apply failed: ${res.status}`);
      }
      const j = (await res.json()) as { applied: number };

      // Persist the same patches to localStorage so the operator's pool view
      // still shows them even if the server-side /tmp store has been cycled
      // by a Vercel lambda cold start (see lib/overlay-merge.ts).
      const appliedAt = new Date().toISOString();
      for (const a of applications) {
        addLocalPatch(a.facilitatorName, {
          ...a.patch,
          appliedAt,
          source: a.source,
        } as Parameters<typeof addLocalPatch>[1]);
      }

      setApplySummary(
        `Applied updates to ${j.applied} facilitator${j.applied === 1 ? "" : "s"}. The platform pages will reflect this on next refresh.`
      );
      setResults([]);
    } catch (err) {
      setTopLevelError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const updateRow = (idx: number, mut: (r: RowState) => RowState) => {
    setResults((prev) => prev.map((r, i) => (i === idx ? mut(r) : r)));
  };

  // ------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Pool
            </Link>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  Transcript Ingestion
                </h1>
                <p className="text-xs text-gray-500">
                  Upload meeting transcripts &mdash; we extract verified updates and merge them into the pool
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {topLevelError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{topLevelError}</div>
          </div>
        )}
        {applySummary && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {applySummary}{" "}
              <Link href="/" className="underline font-medium">
                Go to pool
              </Link>
            </div>
          </div>
        )}

        {/* Upload zone */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors bg-white ${
            dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300"
          }`}
        >
          <Upload className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-gray-900">
            Drop transcript files here
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Accepts .txt, .md, .vtt, .srt, or any plain-text export. Multiple files at once is fine.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.vtt,.srt,.text,.log,text/*"
            onChange={onFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            Choose files
          </button>
        </section>

        {/* Batch paste */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Files className="w-5 h-5 text-gray-700" />
            <h2 className="text-base font-semibold text-gray-900">
              Batch paste mode
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Paste multiple transcripts in one shot. Separate them with a line of three dashes (<code className="bg-gray-100 px-1 rounded">---</code>) or <code className="bg-gray-100 px-1 rounded">--- transcript: Name ---</code>.
          </p>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder="Paste one or many transcripts here. Use --- between them."
            className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={addBatchToQueue}
            disabled={!batchText.trim()}
            className="mt-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
          >
            Add to queue
          </button>
        </section>

        {/* Queue */}
        {queue.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                Queue ({queue.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQueue([])}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
                <button
                  onClick={runExtraction}
                  disabled={extracting}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {extracting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {extracting ? "Extracting..." : "Extract updates"}
                </button>
              </div>
            </div>
            <ul className="divide-y divide-gray-100">
              {queue.map((q, i) => (
                <li
                  key={i}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 text-gray-700 truncate">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="truncate font-medium">{q.filename}</span>
                    <span className="text-gray-400 text-xs">
                      ({q.text.length.toLocaleString()} chars)
                    </span>
                  </div>
                  <button
                    onClick={() => removeFromQueue(i)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Results */}
        {results.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Review extracted updates ({results.length})
              </h2>
              <button
                onClick={applyChecked}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {applying ? "Applying..." : "Apply checked updates"}
              </button>
            </div>

            {results.map((row, idx) => (
              <ResultCard
                key={idx}
                row={row}
                onChange={(mut) => updateRow(idx, mut)}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function ResultCard({
  row,
  onChange,
}: {
  row: RowState;
  onChange: (mut: (r: RowState) => RowState) => void;
}) {
  const { result } = row;
  const ext = result.extraction;
  const isError = !!result.error;
  const confidenceColor =
    ext.matchConfidence === "high"
      ? "bg-emerald-100 text-emerald-700"
      : ext.matchConfidence === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";

  const fieldRows = (
    [
      { key: "availability", value: ext.availability },
      { key: "currentEngagement", value: ext.currentEngagement },
      { key: "location", value: ext.location },
      { key: "bio", value: ext.bio },
      { key: "languages", value: ext.languages },
      { key: "industryExperience", value: ext.industryExperience },
      { key: "tier", value: ext.tier },
      { key: "notes", value: ext.notes },
      { key: "email", value: ext.email },
      { key: "website", value: ext.website },
      { key: "employmentStatus", value: ext.employmentStatus },
      { key: "newEngagements", value: ext.newEngagements },
    ] as { key: FieldKey; value: unknown }[]
  ).filter((r) => {
    if (r.value === null || r.value === undefined) return false;
    if (Array.isArray(r.value) && r.value.length === 0) return false;
    return true;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <FileText className="w-4 h-4" />
            <span className="font-mono truncate">{result.filename}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={row.chosenFacilitator}
              onChange={(e) =>
                onChange((r) => ({ ...r, chosenFacilitator: e.target.value }))
              }
              placeholder="Facilitator name (must match an existing roster entry)"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium w-72"
            />
            {result.candidates.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    onChange((r) => ({ ...r, chosenFacilitator: e.target.value }));
                }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">Pick from roster…</option>
                {result.candidates.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}
            >
              {ext.matchConfidence} confidence
            </span>
          </div>
          {ext.matchReason && (
            <p className="text-xs text-gray-500 mt-1 italic">{ext.matchReason}</p>
          )}
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 flex items-start gap-1"
            >
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {result.error}
        </div>
      )}

      {fieldRows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No fields were extracted with sufficient evidence.
        </p>
      ) : (
        <div className="space-y-2">
          {fieldRows.map(({ key, value }) => {
            const evidence = ext.evidence?.[key];
            const displayValue = Array.isArray(value)
              ? key === "newEngagements"
                ? (value as { name: string; status: string; date: string }[])
                    .map((e) => `${e.name} (${e.status}${e.date ? ", " + e.date : ""})`)
                    .join("; ")
                : (value as string[]).join(", ")
              : String(value);
            return (
              <label
                key={key}
                className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={row.checkedFields[key]}
                  onChange={(e) =>
                    onChange((r) => ({
                      ...r,
                      checkedFields: {
                        ...r.checkedFields,
                        [key]: e.target.checked,
                      },
                    }))
                  }
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {FIELD_LABELS[key]}
                  </div>
                  <div className="text-sm text-gray-900 break-words">
                    {displayValue}
                  </div>
                  {evidence && (
                    <div className="text-xs text-gray-500 italic mt-1 border-l-2 border-indigo-200 pl-2">
                      Evidence: &ldquo;{evidence}&rdquo;
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
