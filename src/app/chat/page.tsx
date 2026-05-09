"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  MessageSquare,
  ExternalLink,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { Facilitator } from "@/types/facilitator";

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
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src="/logo.avif" alt="ArcticMind" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                Facilitator Finder
              </h1>
              <p className="text-xs text-gray-500">
                Ask in plain English. I&apos;ll match people from the pool.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Conversation */}
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
            <div className="flex items-center gap-2 text-sm text-gray-500 px-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching the pool…
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white sticky bottom-0">
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
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-gray-900">
          What do you need?
        </h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Describe the deal in your own words — country, industry, language,
        timing, focus area. I&apos;ll narrow the pool and explain why each
        person fits.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
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
        <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm">
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] text-sm text-gray-800">
          {turn.content}
          {turn.usedClaude !== undefined && (
            <div className="text-[10px] text-gray-400 mt-1">
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
      ? "bg-green-500"
      : f.availability === "On Assignment"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={
              f.photoUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`
            }
            alt={f.name}
            className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 bg-indigo-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name)}&backgroundColor=6366f1`;
            }}
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${availColor}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-sm truncate">
              {f.name}
            </h3>
            {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
              <a
                href={f.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 flex-shrink-0"
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
                className="text-red-600 hover:text-red-800 flex-shrink-0 inline-flex items-center"
                title="Watch demo video"
              >
                <PlayCircle className="w-4 h-4" />
              </a>
            )}
          </div>
          {f.location && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <MapPin className="w-3 h-3" />
              {f.location}
            </div>
          )}
          {(f.pastCompanies?.length || 0) > 0 && (
            <div className="text-[11px] text-gray-500 mt-0.5 truncate">
              <span className="text-gray-400">Has worked with:</span>{" "}
              {f.pastCompanies!.slice(0, 4).join(" · ")}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {f.focus && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full">
                {f.focus}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full">
              {f.experienceLevel === "High"
                ? "Top tier"
                : f.experienceLevel === "Medium"
                  ? "Mid tier"
                  : "Low tier"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full">
              {f.availability}
            </span>
            {f.industryExperience?.slice(0, 3).map((ind) => (
              <span
                key={ind}
                className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-full"
              >
                {ind}
              </span>
            ))}
          </div>
          <div className="text-xs text-indigo-700 mt-2 italic">
            Why: {match.reason}
          </div>
        </div>
      </div>
    </div>
  );
}
