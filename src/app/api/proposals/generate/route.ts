import { NextResponse } from "next/server";
import { Facilitator } from "@/types/facilitator";
import { ProposalOutput, ProposalSection } from "@/types/proposal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GenerateInput = {
  clientName: string;
  context: string; // free-text: what Joe knows about the deal
  deliveryMonth?: string;
  location?: string;
  pricingUSD?: string;
  pricingLocal?: string;
  engagementType?: "Executive Workshop" | "Technical Training" | "Full Program" | "1:1 Intensive";
  selectedFacilitators: Facilitator[];
};

export async function POST(req: Request) {
  try {
    const input = (await req.json()) as GenerateInput;

    // If Claude API is configured, use it for the full synthesis
    if (process.env.ANTHROPIC_API_KEY) {
      const proposal = await generateWithClaude(input);
      return NextResponse.json({ proposal });
    }

    // Otherwise use fast template fallback
    const proposal = generateFromTemplate(input);
    return NextResponse.json({ proposal, fallback: true });
  } catch (err) {
    console.error("Proposal gen error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * Full Claude-powered generation. Uses reference style but writes from scratch.
 */
async function generateWithClaude(input: GenerateInput): Promise<ProposalOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const facilitatorSummary = input.selectedFacilitators
    .map(
      (f) =>
        `- ${f.name} (${f.focus}, ${f.experienceLevel} experience, ${f.location}): ${f.bio}`
    )
    .join("\n");

  const prompt = `You are writing a client-ready AI training proposal for ArcticBlue.

REFERENCE STYLE (ArcticBlue's voice):
- Direct, confident, no hedging or generic buzzwords
- Focus on business outcomes, not features
- Three-phase design process: Alignment/Discovery/Design → Delivery → Debrief
- Core framework: Mindset × Skillset × Toolset
- ArcticBlue differentiates by: built by operators who've shipped AI at scale (Amazon, MetLife, Pfizer, 75+ Fortune 100), not generic educators

CLIENT: ${input.clientName}
ENGAGEMENT TYPE: ${input.engagementType || "AI Training Program"}
CONTEXT (what we know about this deal): ${input.context}
DELIVERY: ${input.deliveryMonth || "TBD"} in ${input.location || "TBD"}
PRICING: ${input.pricingUSD || "TBD"}${input.pricingLocal ? ` (${input.pricingLocal})` : ""}

PROPOSED FACILITATORS (from our pool):
${facilitatorSummary}

Generate a concise, client-ready proposal. Return JSON in EXACTLY this format:
{
  "title": "ArcticBlue + [Client]: [Program Name]",
  "subtitle": "Proposal — [Month Year]",
  "sections": [
    {
      "heading": "Executive Summary",
      "level": 2,
      "content": ["paragraph 1", "paragraph 2"]
    },
    {
      "heading": "Context & Opportunity",
      "level": 2,
      "content": ["paragraph"],
      "bullets": ["optional bullet"]
    },
    {
      "heading": "Our Approach",
      "level": 2,
      "content": ["..."]
    },
    {
      "heading": "Proposed Team",
      "level": 2,
      "content": ["paragraph about why these facilitators fit"]
    },
    {
      "heading": "Program Overview",
      "level": 2,
      "content": ["..."],
      "bullets": ["agenda item 1", "..."]
    },
    {
      "heading": "Timeline",
      "level": 2,
      "content": ["..."],
      "table": {"headers": ["Phase", "When", "Activities"], "rows": [["...", "...", "..."]]}
    },
    {
      "heading": "Pricing",
      "level": 2,
      "content": ["pricing paragraph"]
    },
    {
      "heading": "Why ArcticBlue",
      "level": 2,
      "content": ["..."]
    },
    {
      "heading": "Next Steps",
      "level": 2,
      "content": ["..."],
      "bullets": ["step 1", "step 2"]
    }
  ]
}

Keep each section punchy (2-4 sentences per paragraph, max 2 paragraphs per section). Match the confident, operator voice. Do NOT invent specific dollar amounts — use what's given or say "to be finalized". Return ONLY the JSON, no other text.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");

  const parsed = JSON.parse(match[0]) as ProposalOutput;
  parsed.generatedAt = new Date().toISOString();
  return parsed;
}

/**
 * Fast template-based fallback when no API key.
 */
function generateFromTemplate(input: GenerateInput): ProposalOutput {
  const sections: ProposalSection[] = [
    {
      heading: "Executive Summary",
      level: 2,
      content: [
        `${input.clientName} is ready to move from AI exploration to AI execution. ArcticBlue proposes a tailored training program designed to build the mindset, skills, and practical confidence for the team to lead and execute an AI-first strategy.`,
        `Delivery is proposed for ${input.deliveryMonth || "Q2 2026"}${input.location ? ` in ${input.location}` : ""}, with an option to continue as an ongoing engagement.`,
      ],
    },
    {
      heading: "Context & Opportunity",
      level: 2,
      content: [input.context || `${input.clientName} is at an inflection point in its AI journey. This is an opportunity to establish an AI-first culture and drive measurable business value.`],
    },
    {
      heading: "Our Approach",
      level: 2,
      content: [
        `Sustainable AI adoption comes from establishing a strong foundation of Mindset, Skillset, and Toolset. Our programs follow three phases: Alignment/Discovery/Design, Delivery, and 30-day Debrief. Training without discovery produces generic content — our discovery process surfaces the specific misconceptions and strategic priorities of the people in the room.`,
      ],
    },
    {
      heading: "Proposed Team",
      level: 2,
      content: [
        `We are proposing ${input.selectedFacilitators.length} facilitator${input.selectedFacilitators.length !== 1 ? "s" : ""} from our global pool, matched to this engagement's focus area, experience level, and regional context:`,
      ],
      bullets: input.selectedFacilitators.map(
        (f) => `${f.name} — ${f.focus}, ${f.experienceLevel} experience (${f.location})`
      ),
    },
    {
      heading: "Program Overview",
      level: 2,
      content: [
        `${input.engagementType || "Full-day, in-person workshop"} tailored to ${input.clientName}'s team, workflows, and strategic priorities. Example modules include:`,
      ],
      bullets: [
        "The AI-First Mindset: Why this moment is different from prior technology waves",
        "AI in Action: Live demonstrations and case studies from your industry",
        "Hands-On with Approved Tools: Practical demonstrations in your own context",
        "Designing Your First AI Experiment: Interactive exercise to identify a high-impact pilot",
        "Governance and Responsible AI: Practical frameworks for safe adoption",
      ],
    },
    {
      heading: "Timeline",
      level: 2,
      content: [],
      table: {
        headers: ["Phase", "When", "Activities"],
        rows: [
          ["Alignment", "Week 1", "Confirm scope, success metrics, and logistics"],
          ["Discovery", "Week 1-2", "3-4 stakeholder calls"],
          ["Design", "Week 2-3", "Tailor agenda, case studies, and materials"],
          ["Delivery", "Week 3-4", "On-site workshop"],
          ["Debrief", "30 Days Post", "Follow-up and implementation review"],
        ],
      },
    },
    {
      heading: "Pricing",
      level: 2,
      content: [
        input.pricingUSD
          ? `**Total: ${input.pricingUSD}${input.pricingLocal ? ` / ${input.pricingLocal}` : ""}** (plus applicable taxes, travel, accommodation, venue, and materials). Discovery calls and 30-day post-workshop debrief are included.`
          : `Pricing to be finalized once scope is confirmed. Discovery calls and 30-day post-workshop debrief are included at no additional cost.`,
      ],
    },
    {
      heading: "Why ArcticBlue",
      level: 2,
      content: [
        `Most AI training fails because it's designed by educators who've never shipped an AI product or sat inside the organizations they're trying to change. ArcticBlue's leadership has built AI solutions used by hundreds of millions of consumers and over 75 Fortune 100 companies, with direct experience at Amazon, MetLife, Pfizer, Nissan, AWS, and more.`,
        `Every session is built around the specific misconceptions, adoption barriers, and strategic priorities of the people in the room — not a generic curriculum pulled off the shelf.`,
      ],
    },
    {
      heading: "Next Steps",
      level: 2,
      content: ["To move forward:"],
      bullets: [
        "Confirm the target delivery date and location",
        `Schedule a 45-60 minute working session between ArcticBlue and the ${input.clientName} team`,
        "Agree on 3-5 success metrics before design begins",
        "ArcticBlue to begin discovery outreach to stakeholders",
      ],
    },
  ];

  return {
    title: `ArcticBlue + ${input.clientName}`,
    subtitle: `Proposal — ${input.deliveryMonth || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    sections,
    generatedAt: new Date().toISOString(),
  };
}
