import {
  ProposalInput,
  ProposalOutput,
  ProposalSection,
} from "@/types/proposal";

/**
 * Generates a full client-ready proposal in ArcticBlue's standard format.
 * Matches the structure of the Bahrain Credit and Capgemini/Scout proposals.
 */
export function generateProposal(input: ProposalInput): ProposalOutput {
  const title = input.partnerName
    ? `ArcticBlue + ${input.partnerName}: AI Training & Literacy Program`
    : `ArcticBlue AI + ${input.clientName}`;

  const subtitle = input.documentType === "Discussion Document"
    ? "Discussion Document"
    : `Proposal for AI Training — ${input.monthYear}`;

  const sections: ProposalSection[] = [
    buildExecutiveSummary(input),
    buildContextOpportunity(input),
    buildApproach(input),
    buildProgramOverview(input),
    buildDiscovery(input),
    buildSuccessMetrics(input),
    buildTimeline(input),
    buildPricing(input),
    buildWhyArcticBlue(input),
    buildNextSteps(input),
  ].filter((s): s is ProposalSection => s !== null);

  return {
    title,
    subtitle,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

function buildExecutiveSummary(input: ProposalInput): ProposalSection | null {
  if (input.documentType === "Discussion Document") return null;

  const clientRef = input.endClientName || input.clientName;
  const tracksDesc = input.tracks
    .map((t) => `**${t.name}**: ${t.audience} (${t.audienceSize})`)
    .join("; ");

  return {
    heading: "Executive Summary",
    level: 2,
    content: [
      `${clientRef} is at an inflection point in its AI journey. ${input.clientContext}`,
      `ArcticBlue proposes a tailored AI Training Program for ${clientRef}. The programme is designed to build the mindset, skills, and practical confidence to lead and execute an AI-first strategy:`,
    ],
    bullets: input.tracks.map(
      (t) => `${t.name}: ${t.audience} (${t.audienceSize})`
    ),
    subsections: [
      {
        heading: "",
        level: 3,
        content: [
          `This programme is designed to be delivered in ${input.deliveryMonth}, with an option to continue as an ongoing quarterly engagement and support.`,
        ],
      },
    ],
  };
}

function buildContextOpportunity(input: ProposalInput): ProposalSection {
  const clientRef = input.endClientName || input.clientName;
  return {
    heading: "Context & Opportunity",
    level: 2,
    content: [
      input.clientContext,
      `Even greenfield organizations are impacted by the forces that slow AI adoption everywhere. Stakeholders arrive with different starting points, uneven levels of AI familiarity, and preconceived notions about what AI is and isn't. Without a deliberate program to level the curve, those gaps widen faster than the technology moves.`,
      `A partnership with ArcticBlue gives ${input.partnerName || clientRef} a proven, structured approach to address this head-on: starting with an AI literacy and enablement program tailored to your team, and laying the foundation for an AI-first culture that embeds fluency across the organization as it scales.`,
    ],
    bullets: input.currentState.length > 0 ? input.currentState : undefined,
  };
}

function buildApproach(_input: ProposalInput): ProposalSection {
  return {
    heading: "Our Approach to AI Training",
    level: 2,
    content: [
      "Sustainable AI adoption doesn't come from training people on how to use new tools or write better prompts. Gaining the company-wide benefits of an \"AI-First\" culture comes by establishing (and building upon) a strong foundation of Mindset, Skillset, and Toolset. Our programs are structured around these three interconnected layers, always paired with two organizational enablers that training alone cannot create:",
    ],
    bullets: [
      "Executive sponsorship: senior leadership visibly championing AI adoption",
      "Aligned incentives: structures and rewards that make AI experimentation the expected default",
    ],
    subsections: [
      {
        heading: "The Core Framework: Mindsets — Skillsets — Toolsets",
        level: 3,
        content: [],
        table: {
          headers: ["Right Mindset", "Relevant Skillset", "Accessible Toolset"],
          rows: [
            [
              "How leaders and teams think about AI: culture, opportunity, and urgency",
              "Practical capabilities to solve business problems with AI",
              "Approved tools teams are equipped and empowered to use",
            ],
          ],
        },
      },
      {
        heading: "Program Design Process",
        level: 3,
        content: [
          "We build highly customized programs that serve the unique needs of your organization. Every program we deliver follows three phases:",
        ],
        table: {
          headers: ["Phase", "What We Do", "Why It Matters"],
          rows: [
            [
              "Alignment, Discovery & Design",
              "In-depth interviews with 3-4 stakeholders at different AI maturity levels. We uncover adoption barriers, misconceptions, and motivators.",
              "Training without discovery produces generic content that does not apply to the unique needs of the team/org/industry.",
            ],
            [
              "Delivery",
              "In-person or hybrid workshop(s) for targeted cohorts that balance strategic discussion with hands-on application.",
              "Teams learn by doing, not just listening. We build the habit of experimentation from day one.",
            ],
            [
              "Debrief",
              "30-day check-in to assess what's been implemented, what's stuck, and what needs reinforcement.",
              "Learning fades without accountability. The debrief turns insight into action.",
            ],
          ],
        },
      },
    ],
  };
}

function buildProgramOverview(input: ProposalInput): ProposalSection {
  return {
    heading: "AI Training Program Overview",
    level: 2,
    content: [],
    subsections: input.tracks.map((track) => ({
      heading: track.name,
      level: 3,
      content: [
        `**Audience:** ${track.audience} (${track.audienceSize})`,
        `**Format:** ${track.format}`,
        `**Focus tools:** ${track.focusTools}`,
        "",
        "**Example Agenda:**",
      ],
      bullets: track.agendaItems,
    })),
  };
}

function buildDiscovery(input: ProposalInput): ProposalSection {
  return {
    heading: "Discovery and Design (Pre-Workshop)",
    level: 2,
    content: [
      input.discoveryDescription ||
        `To ensure the program is tailored, ArcticBlue will conduct structured 30-45-minute calls with 3-4 stakeholders prior to delivery. These conversations will surface the specific pain points, scepticisms, and opportunities most relevant to ${input.clientName}, allowing us to build demos and case studies around the team's real challenges.`,
    ],
  };
}

function buildSuccessMetrics(_input: ProposalInput): ProposalSection {
  return {
    heading: "Measuring AI Literacy: Success Metrics",
    level: 2,
    content: [
      "We recommend measuring training effectiveness across three categories:",
    ],
    table: {
      headers: ["Category", "Metric", "How We Measure It"],
      rows: [
        [
          "Knowledge & Understanding",
          "Improvement in AI literacy score and knowledge retention",
          "Pre/post assessment covering AI concepts, use case identification, and governance/risk awareness",
        ],
        [
          "Team-Level Confidence & Maturity",
          "Self-reported measurement of comfort-level and willingness to utilize AI tools",
          "Participant survey immediately post-workshop and again after 30 days. Compared against actual behavior change.",
        ],
        [
          "Behavioral Change & Adoption",
          "Number of AI-related actions initiated",
          "30-day debrief: new tools adopted, experiments designed, team conversations started, internal proposals submitted",
        ],
      ],
    },
  };
}

function buildTimeline(input: ProposalInput): ProposalSection {
  return {
    heading: "Delivery Timeline",
    level: 2,
    content: [],
    table: {
      headers: ["Phase", "When", "Activities"],
      rows: input.timelineItems.map((t) => [t.phase, t.when, t.activities]),
    },
  };
}

function buildPricing(input: ProposalInput): ProposalSection | null {
  if (input.pricingLines.length === 0 && !input.totalUSD) return null;

  const hasLocal = input.pricingLines.some((l) => l.feesLocal);
  const headers = hasLocal
    ? ["Service", "Audience", "Deliverable", "Fees (Local)", "Fees (USD)"]
    : ["Service", "Audience", "Deliverable", "Fees (USD)"];

  const rows = input.pricingLines.map((l) =>
    hasLocal
      ? [l.service, l.audience, l.deliverable, l.feesLocal || "—", l.feesUSD]
      : [l.service, l.audience, l.deliverable, l.feesUSD]
  );

  const totalText = input.totalLocal
    ? `**Total: ${input.totalLocal} / ${input.totalUSD}** (plus applicable taxes and expenses)`
    : `**Total: ${input.totalUSD}** (plus applicable taxes and expenses)`;

  const content = [
    "The following pricing covers the AI Training Program described in this proposal. All fees exclude applicable taxes, travel, accommodation, venue, catering, and materials.",
    totalText,
  ];

  const subsections: ProposalSection[] = [];
  if (input.ongoingOption) {
    subsections.push({
      heading: "Optional: Ongoing Quarterly Program",
      level: 3,
      content: [input.ongoingOption],
    });
  }

  return {
    heading: "Pricing",
    level: 2,
    content,
    table: { headers, rows },
    subsections: subsections.length > 0 ? subsections : undefined,
  };
}

function buildWhyArcticBlue(input: ProposalInput): ProposalSection {
  return {
    heading: "Why ArcticBlue",
    level: 2,
    content: [
      "Most AI training fails because it's designed by educators who've never shipped an AI product, run a P&L, or sat inside the organizations they're trying to change.",
      "ArcticBlue is built differently: our leadership team has built AI solutions used by hundreds of millions of consumers and over 75 Fortune 100 companies, and has delivered AI transformation programs for leading organizations including Amazon, MetLife, Pfizer, Nissan, and more. Our leadership includes former executives from AWS, Invisible Technologies, Zynga, and Rally Health, giving us direct experience on both the technology-provider and enterprise-buyer sides.",
      input.whyArcticBlueCustom ||
        `Every session is built around the specific misconceptions, adoption barriers, and strategic priorities of the people in the room. We work with technical and non-technical audiences alike, and know that non-technical teams need different language, different proof, and different examples than a room full of IT professionals. We design for that distinction — and the result is a measurable shift in how teams think about, talk about, and act on AI.`,
    ],
  };
}

function buildNextSteps(input: ProposalInput): ProposalSection {
  return {
    heading: "Next Steps",
    level: 2,
    content: [
      "To keep the momentum going and deliver a tailored program in an accelerated timeframe:",
    ],
    bullets: [
      "Confirm the target delivery date and location",
      `Schedule a 45-60 minute working session between ArcticBlue and the ${input.clientName} team to align on scope, success metrics, and logistics`,
      "Agree on 3-5 success metrics before design begins",
      input.partnerName
        ? `Determine white-label vs. co-branded delivery approach for the ${input.endClientName || input.clientName} engagement`
        : "Confirm discovery interview participants",
      "ArcticBlue to begin discovery outreach to stakeholders",
    ],
  };
}
