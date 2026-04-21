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
  clientName: string;
  partnerName?: string;
  endClientName?: string;
  documentType: "Proposal" | "Discussion Document";
  monthYear: string;
  clientContext: string;
  currentState: string[];
  tracks: ProposalTrack[];
  location: string;
  deliveryMonth: string;
  timelineItems: ProposalTimelineItem[];
  discoveryDescription: string;
  pricingLines: ProposalPricingLine[];
  totalLocal?: string;
  totalUSD: string;
  ongoingOption?: string;
  whyArcticBlueCustom?: string;
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
  content: string[];
  bullets?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  subsections?: ProposalSection[];
};
