"use client";

import { useState, useRef, useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import {
  ListChecks,
  Send,
  Loader2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

/**
 * Operator-facing note → spreadsheet edit chatbot.
 *
 * Flow per turn:
 *   1. Operator types a free-text note ("add Ryan to the Tamkeen engagement").
 *   2. /api/edit/parse asks Claude to pick exactly one tool action and
 *      returns either a structured action + preview line, or a
 *      clarifying question.
 *   3. The UI renders the preview with Confirm / Cancel buttons.
 *   4. On Confirm, /api/edit/apply forwards the action to Apps Script,
 *      which writes to the spreadsheet.
 *
 * Intentionally no auto-apply — every write is gated behind a click so
 * a misread note can't silently mutate the sheet.
 */

type EditAction = {
  kind:
    | "add_engagement"
    | "add_facilitator_to_engagement"
    | "update_engagement_status"
    | "add_facilitator_note"
    | "update_facilitator_field";
  [k: string]: unknown;
};

type Step = { action: EditAction; preview: string };

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "preview";
      steps: Step[];
      status: "pending" | "applying" | "applied" | "cancelled" | "failed";
      perStepResults?: Array<{ ok: boolean; message: string }>;
      message?: string;
    };

const SUGGESTIONS = [
  "Add Ryan McManus to the Tamkeen engagement",
  "Mark the Amazon engagement as completed and add Sarah Smith to it",
  "Add a new engagement: 'AI Strategy Sprint' for Goldman Sachs in NYC, starting 2026-07-01",
  "Set Allie K. Miller's availability to On Assignment, and add a note: 'Out of office until June 15'",
  "Add Ryan, Charis, and Allie to the Tamkeen engagement",
];

export default function EditPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, loading]);

  const send = async (text: string) => {
    const note = text.trim();
    if (!note || loading) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: note }]);
    setLoading(true);

    try {
      const res = await fetch("/api/edit/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Parse failed (${res.status})`);

      const steps: Step[] = data.steps || [];
      if (steps.length === 0) {
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.needsClarification || "I couldn't pick an action.",
          },
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          { role: "preview", steps, status: "pending" },
        ]);
      }
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const apply = async (idx: number) => {
    setTurns((prev) =>
      prev.map((t, i) =>
        i === idx && t.role === "preview" ? { ...t, status: "applying" } : t
      )
    );
    const turn = turns[idx];
    if (!turn || turn.role !== "preview") return;

    try {
      const res = await fetch("/api/edit/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actions: turn.steps.map((s) => s.action),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Apply failed (${res.status})`);
      // Apps Script returns { ok, results: [{ok, message}] } for batch.
      const result = (data.result || {}) as {
        ok?: boolean;
        results?: Array<{ ok: boolean; message: string }>;
        message?: string;
      };
      const perStepResults = result.results || [];
      const allOk =
        result.ok ?? perStepResults.every((r) => r && r.ok);
      const message = perStepResults.length
        ? `${perStepResults.filter((r) => r.ok).length}/${perStepResults.length} applied`
        : (result.message || "Done.");
      setTurns((prev) =>
        prev.map((t, i) =>
          i === idx && t.role === "preview"
            ? {
                ...t,
                status: allOk ? "applied" : "failed",
                perStepResults,
                message,
              }
            : t
        )
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((t, i) =>
          i === idx && t.role === "preview"
            ? {
                ...t,
                status: "failed",
                message: err instanceof Error ? err.message : "Apply failed.",
              }
            : t
        )
      );
    }
  };

  const cancel = (idx: number) => {
    setTurns((prev) =>
      prev.map((t, i) =>
        i === idx && t.role === "preview" ? { ...t, status: "cancelled" } : t
      )
    );
  };

  return (
    <main className="min-h-screen bg-ink-50 flex flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink-900">Notes</h1>
        <p className="mt-0.5 text-sm text-ink-500">Type what happened. We turn it into sheet edits and show you every one before it lands.</p>
      </div>


      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          {turns.length === 0 && (
            <Welcome onPick={(s) => send(s)} />
          )}

          {turns.map((t, i) => {
            if (t.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-arctic-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm">
                    {t.content}
                  </div>
                </div>
              );
            }
            if (t.role === "assistant") {
              return (
                <div key={i} className="flex items-start">
                  <div className="bg-white border border-ink-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm text-ink-800">
                    {t.content}
                  </div>
                </div>
              );
            }
            // preview
            return <PreviewCard key={i} turn={t} onApply={() => apply(i)} onCancel={() => cancel(i)} />;
          })}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-ink-500 px-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading your note…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink-200 bg-white sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., add Ryan to the Tamkeen engagement"
              className="flex-1 px-4 py-2.5 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-arctic-200 focus:border-arctic-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-arctic-600 text-white rounded-lg hover:bg-arctic-700 disabled:bg-ink-300 text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Parse
            </button>
          </form>
          <p className="text-[11px] text-ink-400 mt-2 px-1">
            Every change shows a preview — nothing writes to the sheet without a Confirm click.
          </p>
        </div>
      </div>
    </main>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto max-w-xl py-12 text-center sm:py-16">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">
        Update the sheet without opening it
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        Type what happened, the way you&apos;d say it to a colleague. You get a
        preview of every cell that would change, and nothing is written until
        you confirm it.
      </p>
      <div className="mt-6 space-y-2 text-left">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="block w-full text-left bg-white border border-ink-200 rounded-lg px-3 py-2 text-sm text-ink-700 hover:border-arctic-300 hover:bg-arctic-50/30 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewCard({
  turn,
  onApply,
  onCancel,
}: {
  turn: Extract<Turn, { role: "preview" }>;
  onApply: () => void;
  onCancel: () => void;
}) {
  const status = turn.status;
  const isMulti = turn.steps.length > 1;
  return (
    <div
      className={`border rounded-xl p-4 ${
        status === "applied"
          ? "bg-ok-50 border-ok-200"
          : status === "failed"
            ? "bg-stop-50 border-stop-200"
            : status === "cancelled"
              ? "bg-ink-50 border-ink-200"
              : "bg-warn-50 border-warn-200"
      }`}
    >
      <div className="flex items-start gap-2">
        {status === "applied" ? (
          <Check className="w-5 h-5 text-ok-600 flex-shrink-0 mt-0.5" />
        ) : status === "failed" ? (
          <AlertCircle className="w-5 h-5 text-stop-600 flex-shrink-0 mt-0.5" />
        ) : status === "cancelled" ? (
          <X className="w-5 h-5 text-ink-400 flex-shrink-0 mt-0.5" />
        ) : (
          <ListChecks className="w-5 h-5 text-warn-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-1.5">
            {status === "applied"
              ? "Applied"
              : status === "failed"
                ? `Failed${turn.message ? ` — ${turn.message}` : ""}`
                : status === "cancelled"
                  ? "Cancelled"
                  : status === "applying"
                    ? "Applying…"
                    : `Confirm ${turn.steps.length} change${isMulti ? "s" : ""}`}
          </div>
          <ol
            className={`space-y-1.5 text-sm text-ink-800 ${
              isMulti ? "list-decimal list-inside" : ""
            }`}
          >
            {turn.steps.map((step, i) => {
              const result = turn.perStepResults?.[i];
              return (
                <li key={i} className="leading-snug">
                  <span>{step.preview}</span>
                  {result && (
                    <span
                      className={`ml-2 text-[11px] inline-flex items-center gap-0.5 ${
                        result.ok ? "text-ok-700" : "text-stop-700"
                      }`}
                    >
                      {result.ok ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <AlertCircle className="w-3 h-3" />
                      )}
                      {result.message}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {turn.message && !turn.perStepResults && (
            <div className="text-xs text-ink-500 mt-1.5">{turn.message}</div>
          )}
        </div>
      </div>

      {status === "pending" && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="text-xs text-ink-500 hover:text-ink-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="text-xs font-medium bg-arctic-600 text-white rounded-lg px-3 py-1.5 hover:bg-arctic-700"
          >
            {isMulti ? `Confirm all ${turn.steps.length}` : "Confirm & apply"}
          </button>
        </div>
      )}
      {status === "applying" && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs text-warn-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing to sheet…
        </div>
      )}
    </div>
  );
}
