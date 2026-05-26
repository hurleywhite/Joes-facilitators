import { EngagementRecord } from "@/types/facilitator";

/**
 * Seed data shown when GOOGLE_ENGAGEMENTS_CSV_URL is not set.
 * Once the env var is configured, the live sheet replaces this list.
 *
 * Engagement names default to "AI Workshop" — edit in the live sheet
 * to use the real program title (e.g. "Executive AI Strategy Sprint").
 */
export const dummyEngagements: EngagementRecord[] = [
  {
    id: "seed-1",
    name: "AI Workshop",
    client: "AbbVie",
    status: "Upcoming",
    startDate: "",
    endDate: "",
    location: "",
    type: "",
    facilitators: [],
    valueUSD: "",
    notes: "About to start",
  },
  {
    id: "seed-2",
    name: "AI Workshop",
    client: "Capgemini",
    status: "Upcoming",
    startDate: "",
    endDate: "",
    location: "",
    type: "",
    facilitators: [],
    valueUSD: "",
    notes: "About to start",
  },
  {
    id: "seed-3",
    name: "AI Workshop",
    client: "AWS (Amazon Web Services)",
    status: "Active",
    startDate: "",
    endDate: "",
    location: "",
    type: "",
    facilitators: [],
    valueUSD: "",
    notes: "Ongoing",
  },
  {
    id: "seed-4",
    name: "AI Workshop",
    client: "Tamkeen",
    status: "Active",
    startDate: "",
    endDate: "",
    location: "",
    type: "",
    facilitators: [],
    valueUSD: "",
    notes: "Ongoing",
  },
  {
    id: "seed-5",
    name: "AI Workshop",
    client: "MoMA (Museum of Modern Art)",
    status: "Upcoming",
    startDate: "",
    endDate: "",
    location: "",
    type: "",
    facilitators: [],
    valueUSD: "",
    notes: "About to start",
  },
];
