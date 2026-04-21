"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  FileText,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Users,
  MessageSquare,
} from "lucide-react";
import { Facilitator } from "@/types/facilitator";
import { ProposalOutput } from "@/types/proposal";
import ProposalPreview from "@/components/proposal/ProposalPreview";
import FacilitatorPickerCard from "@/components/proposal/FacilitatorPickerCard";

type Step = "input" | "team" | "preview";

export default function ProposalsPage() {
  const [step, setStep] = useState<Step>("input");
  const [proposal, setProposal] = useState<ProposalOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Input state
  const [clientName, setClientName] = useState("");
  const [context, setContext] = useState("");
  const [clientRegion, setClientRegion] = useState<"Americas" | "Europe" | "Asia-Pacific" | "Middle East & Africa" | "">("");
  const [neededFocus, setNeededFocus] = useState<"Facilitation" | "Tech" | "Both" | "Any">("Any");
  const [deliveryMonth, setDeliveryMonth] = useState("");
  const [location, setLocation] = useState("");
  const [pricingUSD, setPricingUSD] = useState("");
  const [engagementType, setEngagementType] = useState<
    "Executive Workshop" | "Technical Training" | "Full Program" | "1:1 Intensive"
  >("Executive Workshop");

  // Recommendation + selection
  const [recommended, setRecommended] = useState<Facilitator[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Slack research state
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackStatus, setSlackStatus] = useState<string | null>(null);
  const [slackMessageCount, setSlackMessageCount] = useState(0);

  const handlePullSlackContext = async () => {
    if (!clientName.trim()) {
      setSlackStatus("Enter a client name first");
      return;
    }
    setSlackLoading(true);
    setSlackStatus(null);
    try {
      const res = await fetch("/api/proposals/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clientName }),
      });
      const data = await res.json();
      if (data.error) {
        setSlackStatus(`⚠️ ${data.error}`);
      } else if (data.messages && data.messages.length > 0) {
        // Append to existing context (don't overwrite)
        const prefix = context.trim() ? `${context.trim()}\n\n--- From Slack ---\n` : "";
        setContext(`${prefix}${data.summary}`);
        setSlackMessageCount(data.messages.length);
        setSlackStatus(`✅ Pulled ${data.messages.length} Slack message${data.messages.length !== 1 ? "s" : ""}`);
      } else {
        setSlackStatus(`No Slack messages found for "${clientName}"`);
      }
    } catch (err) {
      setSlackStatus(err instanceof Error ? err.message : "Failed to reach Slack");
    } finally {
      setSlackLoading(false);
    }
  };

  const handleResearch = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/proposals/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRegion: clientRegion || undefined,
          neededFocus,
          count: 5,
        }),
      });
      if (!res.ok) throw new Error("Failed to get recommendations");
      const data = await res.json();
      setRecommended(data.recommended);
      // Pre-select top 3
      setSelectedIds(new Set(data.recommended.slice(0, 3).map((f: Facilitator) => f.id)));
      setStep("team");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const selectedFacilitators = recommended.filter((f) => selectedIds.has(f.id));
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          context,
          deliveryMonth,
          location,
          pricingUSD,
          engagementType,
          selectedFacilitators,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setProposal(data.proposal);
      setStep("preview");
      setTimeout(() => {
        document.getElementById("proposal-doc")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();
  const handleCopyHTML = async () => {
    const el = document.getElementById("proposal-doc");
    if (!el) return;
    await navigator.clipboard.writeText(el.outerHTML);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFacilitator = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src="/logo.avif" alt="ArcticMind" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Proposal Generator
              </h1>
              <p className="text-xs text-gray-500">
                Minimal input. Smart facilitator matching. Client-ready output.
              </p>
            </div>
          </div>
          {proposal && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStep("input"); setProposal(null); }}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                New proposal
              </button>
              <button
                onClick={handleCopyHTML}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-green-600" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy HTML</>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Printer className="w-4 h-4" /> Save PDF
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6 print:p-0">
        {/* Step indicator */}
        {!proposal && (
          <div className="flex items-center gap-2 text-xs print:hidden">
            <StepPill label="1 · Context" active={step === "input"} done={step !== "input"} />
            <div className="flex-1 h-px bg-gray-200" />
            <StepPill label="2 · Team" active={step === "team"} done={step === "preview"} />
            <div className="flex-1 h-px bg-gray-200" />
            <StepPill label="3 · Preview" active={(step as Step) === "preview"} done={false} />
          </div>
        )}

        {/* STEP 1: Input */}
        {step === "input" && !proposal && (
          <div className="space-y-5 print:hidden">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                Who's the client?
              </h2>
              <p className="text-sm text-gray-600">
                Give me a company name and a few sentences of context. I'll match facilitators from the pool and draft the proposal.
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <Field label="Client / Company name" required>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Bahrain Credit, Scout Motors, Nike"
                  className={inputClass}
                />
              </Field>

              <Field label="Context — what you know about the deal">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handlePullSlackContext}
                    disabled={!clientName.trim() || slackLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slackLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching Slack...</>
                    ) : (
                      <><MessageSquare className="w-3.5 h-3.5" /> Pull context from Slack</>
                    )}
                  </button>
                  {slackStatus && (
                    <span className="text-xs text-gray-500">{slackStatus}</span>
                  )}
                </div>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={slackMessageCount > 0 ? 10 : 4}
                  placeholder="e.g., $10M RR self-funded biz. CEO wants 1:1 AI training starting from zero. Kicking off in June. Sub'd from Andrew Hoag."
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Click the Slack button to auto-pull mentions of the company, or paste context manually.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Engagement type">
                  <select
                    value={engagementType}
                    onChange={(e) => setEngagementType(e.target.value as typeof engagementType)}
                    className={inputClass}
                  >
                    <option>Executive Workshop</option>
                    <option>Technical Training</option>
                    <option>Full Program</option>
                    <option>1:1 Intensive</option>
                  </select>
                </Field>
                <Field label="Client region">
                  <select
                    value={clientRegion}
                    onChange={(e) => setClientRegion(e.target.value as typeof clientRegion)}
                    className={inputClass}
                  >
                    <option value="">Any / Unknown</option>
                    <option value="Americas">Americas</option>
                    <option value="Europe">Europe</option>
                    <option value="Asia-Pacific">Asia-Pacific</option>
                    <option value="Middle East & Africa">Middle East & Africa</option>
                  </select>
                </Field>
                <Field label="Needed focus">
                  <select
                    value={neededFocus}
                    onChange={(e) => setNeededFocus(e.target.value as typeof neededFocus)}
                    className={inputClass}
                  >
                    <option value="Any">Any</option>
                    <option value="Facilitation">Facilitation-heavy</option>
                    <option value="Tech">Tech-heavy</option>
                    <option value="Both">Both</option>
                  </select>
                </Field>
                <Field label="Delivery month">
                  <input
                    type="text"
                    value={deliveryMonth}
                    onChange={(e) => setDeliveryMonth(e.target.value)}
                    placeholder="June 2026"
                    className={inputClass}
                  />
                </Field>
                <Field label="Location">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Miami / Remote / Bahrain"
                    className={inputClass}
                  />
                </Field>
                <Field label="Pricing (USD, optional)">
                  <input
                    type="text"
                    value={pricingUSD}
                    onChange={(e) => setPricingUSD(e.target.value)}
                    placeholder="$10,000 or TBD"
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleResearch}
                disabled={!clientName || loading}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 font-medium"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Matching facilitators...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Match facilitators</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Team selection */}
        {step === "team" && (
          <div className="space-y-5 print:hidden">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-gray-900">
                  Recommended facilitators
                </h2>
              </div>
              <p className="text-sm text-gray-600">
                Ranked by availability, region match, focus match, and track record.
                Select the ones to propose for {clientName}.
                <span className="ml-2 font-semibold text-indigo-600">
                  {selectedIds.size} selected
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recommended.map((f) => (
                <FacilitatorPickerCard
                  key={f.id}
                  f={f}
                  selected={selectedIds.has(f.id)}
                  onToggle={() => toggleFacilitator(f.id)}
                />
              ))}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep("input")}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={selectedIds.size === 0 || loading}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 font-medium"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Drafting proposal...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate proposal</>
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm print:hidden">
            {error}
          </div>
        )}

        {/* STEP 3: Preview */}
        {proposal && (
          <div className="print:m-0">
            <ProposalPreview proposal={proposal} />
          </div>
        )}
      </div>
    </main>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400";

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
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

function StepPill({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`px-3 py-1 rounded-full font-medium ${
        active
          ? "bg-indigo-600 text-white"
          : done
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500"
      }`}
    >
      {label}
    </span>
  );
}
