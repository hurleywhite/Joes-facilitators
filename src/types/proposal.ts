export type ProposalTrack = {
  name: string;
  audience: string;
  audienceSize: string;
  format: string;
  focusTools: string;
  agendaItems: string[];
};

export type ProposalPricingLine = {
  service: string;
  audience: string;
  deliverable: string;
  feesLocal?: string;
  feesUSD: string;
};

export type ProposalTimelineItem = {
  phase: string;
  when: string;
  activities: string;
};

export type ProposalInput = {
  // Meta
  clientName: string;
  partnerName?: string; // e.g., "Capgemini" if prime contractor
  endClientName?: string; // e.g., "Scout Motors" if delivered via partner
  documentType: "Proposal" | "Discussion Document";
  monthYear: string; // "April 2026"

  // Context
  clientContext: string; // 2-3 paragraphs about why now, their situation
  currentState: string[]; // bullets about what they've already done

  // Program
  tracks: ProposalTrack[];

  // Logistics
  location: string;
  deliveryMonth: string;
  timelineItems: ProposalTimelineItem[];

  // Discovery
  discoveryDescription: string;

  // Pricing
  pricingLines: ProposalPricingLine[];
  totalLocal?: string;
  totalUSD: string;
  ongoingOption?: string;

  // Close
  whyArcticBlueCustom?: string; // optional custom addition
};

export type ProposalOutput = {
  title: string;
  subtitle: string;
  sections: ProposalSection[];
  generatedAt: string;
};

export type ProposalSection = {
  heading: string;
  level: 1 | 2 | 3;
  content: string[]; // paragraphs
  bullets?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  subsections?: ProposalSection[];
};
