"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  Notebook,
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

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "preview";
      action: EditAction;
      preview: string;
      status: "pending" | "applying" | "applied" | "cancelled" | "failed";
      message?: string;
    };

const SUGGESTIONS = [
  "Add Ryan McManus to the Tamkeen engagement",
  "Mark the Amazon engagement as completed",
  "Add a new engagement: 'AI Strategy Sprint' for Goldman Sachs in NYC, starting 2026-07-01",
  "Set Allie K. Miller's availability to On Assignment",
  'Add a note to Andy Hagerman: "Prefers in-person workshops, half-day max"',
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

      if (!data.action) {
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
          {
            role: "preview",
            action: data.action,
            preview: data.preview,
            status: "pending",
          },
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
        body: JSON.stringify({ action: turn.action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Apply failed (${res.status})`);
      const message =
        data.result && typeof data.result === "object" && "message" in data.result
          ? String((data.result as { message: string }).message)
          : "Done.";
      setTurns((prev) =>
        prev.map((t, i) =>
          i === idx && t.role === "preview"
            ? { ...t, status: "applied", message }
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
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src="/logo.avif" alt="ArcticMind" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Notebook className="w-5 h-5 text-indigo-600" />
                Notes → Sheet
              </h1>
              <p className="text-[11px] text-gray-500">
                Plain-English notes that update the spreadsheet automatically
              </p>
            </div>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          {turns.length === 0 && (
            <Welcome onPick={(s) => send(s)} />
          )}

          {turns.map((t, i) => {
            if (t.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm">
                    {t.content}
                  </div>
                </div>
              );
            }
            if (t.role === "assistant") {
              return (
                <div key={i} className="flex items-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm text-gray-800">
                    {t.content}
                  </div>
                </div>
              );
            }
            // preview
            return <PreviewCard key={i} turn={t} onApply={() => apply(i)} onCancel={() => cancel(i)} />;
          })}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 px-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading your note…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white sticky bottom-0">
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
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Parse
            </button>
          </form>
          <p className="text-[11px] text-gray-400 mt-2 px-1">
            Every change shows a preview — nothing writes to the sheet without a Confirm click.
          </p>
        </div>
      </div>
    </main>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Update the sheet without opening it
        </h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Type a short note. I&apos;ll figure out what changed, show you a
        preview, and write it to the spreadsheet only after you confirm.
      </p>
      <div className="space-y-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="block w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
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
  return (
    <div
      className={`border rounded-xl p-4 ${
        status === "applied"
          ? "bg-green-50 border-green-200"
          : status === "failed"
            ? "bg-red-50 border-red-200"
            : status === "cancelled"
              ? "bg-gray-50 border-gray-200"
              : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex items-start gap-2">
        {status === "applied" ? (
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        ) : status === "failed" ? (
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : status === "cancelled" ? (
          <X className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
        ) : (
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-0.5">
            {status === "applied"
              ? "Applied"
              : status === "failed"
                ? "Failed"
                : status === "cancelled"
                  ? "Cancelled"
                  : status === "applying"
                    ? "Applying…"
                    : "Confirm change"}
          </div>
          <div className="text-sm text-gray-800">{turn.preview}</div>
          {turn.message && (
            <div className="text-xs text-gray-500 mt-1">{turn.message}</div>
          )}
        </div>
      </div>

      {status === "pending" && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700"
          >
            Confirm &amp; apply
          </button>
        </div>
      )}
      {status === "applying" && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs text-amber-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing to sheet…
        </div>
      )}
    </div>
  );
}
