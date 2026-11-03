"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  ExternalLink,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { Facilitator } from "@/types/facilitator";
import AppHeader from "@/components/AppHeader";

type ChatMatch = {
  facilitator: Facilitator;
  reason: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  matches?: ChatMatch[];
  usedClaude?: boolean;
};

const SUGGESTIONS = [
  "We have a deal in Morocco — who's available with healthcare experience?",
  "Need a Tech facilitator in Europe who speaks French",
  "Who has fintech experience in the Americas?",
  "Top tier facilitators available for an exec workshop in APAC",
];

export default function ChatPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, loading]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || loading) return;

    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      // Send the prior turns so the model has memory across follow-ups.
      // Keep only role + content — the matches array is huge and not
      // useful as conversation context.
      const priorHistory = turns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: priorHistory }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = (await res.json()) as {
        answer: string;
        matches: ChatMatch[];
        usedClaude: boolean;
      };
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          matches: data.matches,
          usedClaude: data.usedClaude,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-ink-50 flex flex-col">
      {/* Header */}
      <AppHeader />

      {/* Conversation. No page-title band here: the empty state already
          says what this page is for, and printing it twice was the first
          thing you saw. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {turns.length === 0 && (
            <Welcome onPick={(s) => send(s)} />
          )}

          {turns.map((turn, i) => (
            <Turn key={i} turn={turn} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-ink-500 px-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching the pool…
            </div>
          )}

          {error && (
            <div className="bg-stop-50 border border-stop-200 text-stop-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-ink-200 bg-white sticky bottom-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
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
              placeholder="e.g., who's available in Morocco for a healthcare deal?"
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
              Ask
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

/* -------------------- subcomponents -------------------- */

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  // Previously a tinted card pinned to the top of a 600px void, repeating
  // the page heading underneath it and speaking in the first person ("I'll
  // narrow the pool"). Now it sits in the space it was leaving empty, says
  // its piece once, and leads with the examples — which are the part people
  // actually click.
  return (
    <div className="mx-auto max-w-2xl py-16 text-center sm:py-24">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">
        Who do you need in the room?
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        Country, industry, language, timing, focus — however much you know.
        Every name comes back with the reason it came back.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-left text-sm text-ink-700 transition-colors hover:border-arctic-300 hover:bg-arctic-50/40 hover:text-ink-900"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-arctic-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm">
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="bg-white border border-ink-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm text-ink-800">
          {turn.content}
          {turn.usedClaude !== undefined && (
            <div className="text-[10px] text-ink-400 mt-1">
              {turn.usedClaude ? "🤖 Claude" : "📋 Heuristic"}
            </div>
          )}
        </div>
      </div>

      {turn.matches && turn.matches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {turn.matches.map((m) => (
            <ResultCard key={m.facilitator.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ match }: { match: ChatMatch }) {
  const f = match.facilitator;
  const availColor =
    f.availability === "Available"
      ? "bg-ok-600"
      : f.availability === "On Assignment"
        ? "bg-warn-600"
        : "bg-stop-600";

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`
            }
            alt={f.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-ink-100 bg-arctic-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?textColor=1a5584&seed=${encodeURIComponent(f.name)}&backgroundColor=dceefa`;
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${availColor}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink-900 text-sm truncate">
              {f.name}
            </h3>
            {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-arctic-600 hover:text-arctic-800 flex-shrink-0"
                title="LinkedIn"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {f.demoVideoUrl && (
              <a
                href={f.demoVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stop-600 hover:text-stop-700 flex-shrink-0 inline-flex items-center"
                title="Watch demo video"
              >
                <PlayCircle className="w-4 h-4" />
              </a>
            )}
          </div>
          {f.location && (
            <div className="flex items-center gap-1 text-xs text-ink-500 mt-0.5">
              <MapPin className="w-3 h-3" />
              {f.location}
            </div>
          )}
          {(f.pastCompanies?.length || 0) > 0 && (
            <div className="text-[11px] text-ink-500 mt-0.5 truncate">
              <span className="text-ink-400">Has worked with:</span>{" "}
              {f.pastCompanies!.slice(0, 4).join(" · ")}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {f.focus && (
              <span className="text-[10px] px-1.5 py-0.5 bg-ink-50 text-ink-700 border border-ink-100 rounded-full">
                {f.focus}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-warn-50 text-warn-700 border border-warn-200 rounded-full">
              {f.experienceLevel === "High"
                ? "Top tier"
                : f.experienceLevel === "Medium"
                  ? "Mid tier"
                  : "Low tier"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-ink-50 text-ink-600 border border-ink-100 rounded-full">
              {f.availability}
            </span>
            {f.industryExperience?.slice(0, 3).map((ind) => (
              <span
                key={ind}
                className="text-[10px] px-1.5 py-0.5 bg-ink-50 text-ink-700 border border-ink-100 rounded-full"
              >
                {ind}
              </span>
            ))}
          </div>
          <div className="text-xs text-arctic-700 mt-2 italic">
            Why: {match.reason}
          </div>
        </div>
      </div>
    </div>
  );
}
