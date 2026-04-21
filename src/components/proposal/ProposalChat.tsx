"use client";

import { useState } from "react";
import { ProposalInput, ProposalTrack } from "@/types/proposal";
import { Sparkles, Loader2, ArrowRight, Plus, Trash2 } from "lucide-react";

const DEFAULT_AGENDA = [
  "The AI-First Mindset: Why this moment is different from previous technology waves",
  "AI in Action: Live demonstrations and case studies from your industry",
  "Hands-On with Approved Tools: Practical demonstrations in your own context",
  "Designing Your First AI Experiment: Interactive group exercise to identify a high-impact pilot",
  "Governance and Responsible AI: Practical frameworks for safe and compliant adoption",
];

const QUICK_FILL_BAHRAIN: Partial<ProposalInput> = {
  clientName: "Bahrain Credit",
  documentType: "Proposal",
  monthYear: "February 2026",
  clientContext:
    "Bahrain Credit is at an inflection point in its AI journey. Having already deployed Microsoft Copilot across the organisation and invested in AWS cloud capabilities and Claude enterprise licences, the team is now focused on translating these investments into measurable business value.",
  currentState: [
    "Copilot is live across the organisation",
    "A Claude enterprise licence is in place",
    "The internal AWS team is actively shipping AI solutions",
    "A Gartner AI Maturity Assessment is underway",
  ],
  tracks: [
    {
      name: "Track A: Executive Leadership Session",
      audience: "CEO, Deputy CEO, C-Suite, VPs",
      audienceSize: "~15 executives",
      format: "Full-day, in-person workshop",
      focusTools: "Microsoft Copilot, Claude enterprise with broader market scan",
      agendaItems: DEFAULT_AGENDA,
    },
    {
      name: "Track B: IT and AI Champions Session",
      audience: "IT team and departmental AI champions",
      audienceSize: "~20 champions",
      format: "Full-day, in-person workshop",
      focusTools: "Copilot, Claude, AWS AI services, automation tools",
      agendaItems: [
        "Advanced Copilot and Claude: Unlocking capabilities most users have not discovered",
        "The AI Tool Landscape: Expanded survey of tools relevant to IT",
        "AI Use Case Design: Structured methodology for identifying and scoping AI projects",
        "Building vs. Buying: Framework for deciding when to build vs. adopt vendor tools",
        "Working Session: Champions define 2-3 concrete AI initiatives for their departments",
      ],
    },
  ],
  location: "Bahrain",
  deliveryMonth: "April 2026",
  timelineItems: [
    { phase: "Alignment", when: "February–March 2026", activities: "Proposal sign-off, pre-engagement scoping calls" },
    { phase: "Discovery", when: "March 2026", activities: "3-4 executive calls, 2-3 IT/champions leads" },
    { phase: "Delivery", when: "April 2026", activities: "On-site in Bahrain: Track A + Track B" },
    { phase: "Debrief", when: "May 2026 (30 days post)", activities: "Post-workshop follow-up and roadmap refinement" },
  ],
  discoveryDescription: "",
  pricingLines: [
    { service: "Discovery & Design", audience: "Executive Team (3-4 calls), IT Champions (2-3 calls)", deliverable: "Summary Report and Tailored Workshop Agendas", feesLocal: "Included", feesUSD: "Included" },
    { service: "Delivery of Track A & Track B", audience: "~35 Participants", deliverable: "Full-day in-person for both tracks", feesLocal: "BHD 18,500", feesUSD: "$49,000" },
    { service: "Post-Workshop Support (30 Days)", audience: "All Participants", deliverable: "Follow-up strategy calls", feesLocal: "Included", feesUSD: "Included" },
  ],
  totalLocal: "BHD 18,500",
  totalUSD: "USD 49,000",
  ongoingOption: "Given the pace at which AI is evolving, many organisations find value in a structured quarterly engagement to keep leadership and champions continuously updated. ArcticBlue can design a bespoke ongoing programme covering quarterly sessions (virtual or in-person), content refreshed each quarter, and ongoing advisory access between sessions.",
};

const QUICK_FILL_EXEC_1ON1: Partial<ProposalInput> = {
  clientName: "[Client Name]",
  documentType: "Proposal",
  monthYear: "June 2026",
  clientContext:
    "[Client Name] is building AI capability from the executive level down. The CEO has prioritized direct, hands-on AI literacy for themselves and the senior team before rolling capability out across the broader organization.",
  currentState: [],
  tracks: [
    {
      name: "Executive 1:1 AI Intensive",
      audience: "CEO (primary), optional senior execs",
      audienceSize: "1-4 participants",
      format: "Full-day, in-person (or multi-session if preferred)",
      focusTools: "ChatGPT, Claude, Microsoft Copilot — tailored to the executive's daily workflows",
      agendaItems: [
        "From zero: what AI is, what it isn't, and why this moment matters",
        "Prompts and prompt engineering: working demonstrations using real work",
        "Hands-on with your inbox, calendar, and meeting prep",
        "Strategic use cases: where AI creates leverage for a CEO",
        "Governance, risk, and when NOT to use AI",
        "Your 30-day plan: 3 experiments to run before our debrief",
      ],
    },
  ],
  location: "[Client Location]",
  deliveryMonth: "June 2026",
  timelineItems: [
    { phase: "Discovery", when: "Week 1", activities: "30-min call with executive to calibrate experience level, tools, and priorities" },
    { phase: "Design", when: "Week 2", activities: "Tailored agenda, demo scripts, and real-work use cases" },
    { phase: "Delivery", when: "Week 3-4", activities: "Full-day in-person intensive" },
    { phase: "Debrief", when: "30 Days Post", activities: "1:1 follow-up to review the 3 experiments and refine next steps" },
  ],
  discoveryDescription: "",
  pricingLines: [
    { service: "Discovery & Custom Design", audience: "Executive + stakeholders", deliverable: "Tailored agenda, materials", feesUSD: "Included" },
    { service: "Full-Day Delivery", audience: "CEO + up to 3 senior execs", deliverable: "In-person intensive", feesUSD: "$[amount]" },
    { service: "30-Day Debrief", audience: "Executive", deliverable: "Follow-up call & action review", feesUSD: "Included" },
  ],
  totalUSD: "USD $[total]",
};

export default function ProposalChat({
  onGenerate,
}: {
  onGenerate: (input: ProposalInput, enhance: boolean) => Promise<void>;
}) {
  const [input, setInput] = useState<ProposalInput>(() => ({
    clientName: "",
    documentType: "Proposal",
    monthYear: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    clientContext: "",
    currentState: [],
    tracks: [
      {
        name: "Track A: Executive Leadership Session",
        audience: "",
        audienceSize: "",
        format: "Full-day, in-person workshop",
        focusTools: "",
        agendaItems: DEFAULT_AGENDA,
      },
    ],
    location: "",
    deliveryMonth: "",
    timelineItems: [
      { phase: "Alignment", when: "Week 1", activities: "Confirm scope, success metrics, and key contacts" },
      { phase: "Discovery", when: "Week 1-2", activities: "3-4 stakeholder interviews" },
      { phase: "Design", when: "Week 2-3", activities: "Finalize program agenda and materials" },
      { phase: "Delivery", when: "Week 3-4", activities: "In-person workshop" },
      { phase: "Debrief", when: "30 Days Post", activities: "Follow-up and measurement" },
    ],
    discoveryDescription: "",
    pricingLines: [],
    totalUSD: "",
  }));

  const [loading, setLoading] = useState(false);
  const [enhance, setEnhance] = useState(true);

  const applyQuickFill = (data: Partial<ProposalInput>) => {
    setInput((prev) => ({ ...prev, ...data }));
  };

  const updateTrack = (index: number, field: keyof ProposalTrack, value: unknown) => {
    setInput((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  };

  const addTrack = () => {
    setInput((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        {
          name: `Track ${String.fromCharCode(65 + prev.tracks.length)}: New Session`,
          audience: "",
          audienceSize: "",
          format: "Full-day, in-person workshop",
          focusTools: "",
          agendaItems: DEFAULT_AGENDA,
        },
      ],
    }));
  };

  const removeTrack = (index: number) => {
    setInput((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onGenerate(input, enhance);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Quick fill presets */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-900">
            Quick-fill a template to start
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyQuickFill(QUICK_FILL_BAHRAIN)}
            className="text-xs px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100"
          >
            Enterprise 2-Track (Bahrain-style)
          </button>
          <button
            onClick={() => applyQuickFill(QUICK_FILL_EXEC_1ON1)}
            className="text-xs px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100"
          >
            Executive 1:1 (1-4 people)
          </button>
        </div>
      </div>

      {/* Meta */}
      <Section title="Client & Document">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Client name">
            <input
              type="text"
              value={input.clientName}
              onChange={(e) => setInput({ ...input, clientName: e.target.value })}
              placeholder="e.g., Bahrain Credit"
              className={inputClass}
            />
          </Field>
          <Field label="Month / Year">
            <input
              type="text"
              value={input.monthYear}
              onChange={(e) => setInput({ ...input, monthYear: e.target.value })}
              placeholder="e.g., April 2026"
              className={inputClass}
            />
          </Field>
          <Field label="Partner (optional — if prime contractor)">
            <input
              type="text"
              value={input.partnerName || ""}
              onChange={(e) => setInput({ ...input, partnerName: e.target.value })}
              placeholder="e.g., Capgemini"
              className={inputClass}
            />
          </Field>
          <Field label="End client (optional — if different from partner)">
            <input
              type="text"
              value={input.endClientName || ""}
              onChange={(e) => setInput({ ...input, endClientName: e.target.value })}
              placeholder="e.g., Scout Motors"
              className={inputClass}
            />
          </Field>
          <Field label="Document type">
            <select
              value={input.documentType}
              onChange={(e) =>
                setInput({ ...input, documentType: e.target.value as "Proposal" | "Discussion Document" })
              }
              className={inputClass}
            >
              <option value="Proposal">Proposal (with pricing)</option>
              <option value="Discussion Document">Discussion Document (no pricing)</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Context */}
      <Section title="Context & Opportunity">
        <Field label="Client context (2-3 sentences on their situation)">
          <textarea
            value={input.clientContext}
            onChange={(e) => setInput({ ...input, clientContext: e.target.value })}
            rows={4}
            placeholder="Describe their AI journey, where they are today, why now..."
            className={inputClass}
          />
        </Field>
        <Field label="Current state (one per line — what they've already done)">
          <textarea
            value={input.currentState.join("\n")}
            onChange={(e) =>
              setInput({ ...input, currentState: e.target.value.split("\n").filter(Boolean) })
            }
            rows={4}
            placeholder={"Copilot is live across the organisation\nClaude enterprise licence in place"}
            className={inputClass}
          />
        </Field>
      </Section>

      {/* Tracks */}
      <Section title="Program Tracks">
        {input.tracks.map((track, ti) => (
          <div key={ti} className="border border-gray-200 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">Track {ti + 1}</span>
              {input.tracks.length > 1 && (
                <button
                  onClick={() => removeTrack(ti)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Track name">
                <input
                  type="text"
                  value={track.name}
                  onChange={(e) => updateTrack(ti, "name", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Audience size">
                <input
                  type="text"
                  value={track.audienceSize}
                  onChange={(e) => updateTrack(ti, "audienceSize", e.target.value)}
                  placeholder="~15 executives"
                  className={inputClass}
                />
              </Field>
              <Field label="Audience description">
                <input
                  type="text"
                  value={track.audience}
                  onChange={(e) => updateTrack(ti, "audience", e.target.value)}
                  placeholder="CEO, Deputy CEO, C-Suite, VPs"
                  className={inputClass}
                />
              </Field>
              <Field label="Format">
                <input
                  type="text"
                  value={track.format}
                  onChange={(e) => updateTrack(ti, "format", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Focus tools" span2>
                <input
                  type="text"
                  value={track.focusTools}
                  onChange={(e) => updateTrack(ti, "focusTools", e.target.value)}
                  placeholder="Microsoft Copilot, Claude enterprise"
                  className={inputClass}
                />
              </Field>
              <Field label="Agenda items (one per line)" span2>
                <textarea
                  value={track.agendaItems.join("\n")}
                  onChange={(e) =>
                    updateTrack(ti, "agendaItems", e.target.value.split("\n").filter(Boolean))
                  }
                  rows={5}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          onClick={addTrack}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <Plus className="w-4 h-4" /> Add another track
        </button>
      </Section>

      {/* Logistics */}
      <Section title="Logistics">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Location">
            <input
              type="text"
              value={input.location}
              onChange={(e) => setInput({ ...input, location: e.target.value })}
              placeholder="Bahrain / San Francisco / Remote"
              className={inputClass}
            />
          </Field>
          <Field label="Delivery month">
            <input
              type="text"
              value={input.deliveryMonth}
              onChange={(e) => setInput({ ...input, deliveryMonth: e.target.value })}
              placeholder="April 2026"
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      {/* Pricing */}
      {input.documentType === "Proposal" && (
        <Section title="Pricing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Total (local currency, optional)">
              <input
                type="text"
                value={input.totalLocal || ""}
                onChange={(e) => setInput({ ...input, totalLocal: e.target.value })}
                placeholder="BHD 18,500"
                className={inputClass}
              />
            </Field>
            <Field label="Total USD">
              <input
                type="text"
                value={input.totalUSD}
                onChange={(e) => setInput({ ...input, totalUSD: e.target.value })}
                placeholder="USD 49,000"
                className={inputClass}
              />
            </Field>
          </div>
        </Section>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 sticky bottom-4 shadow-lg">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={enhance}
            onChange={(e) => setEnhance(e.target.checked)}
            className="rounded"
          />
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          Enhance narrative with Claude (requires API key)
        </label>
        <button
          onClick={handleSubmit}
          disabled={!input.clientName || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              Generate Proposal <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400";

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "md:col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}
