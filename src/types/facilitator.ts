export type Focus = "Facilitation" | "Tech" | "Both";
export type ExperienceLevel = "High" | "Medium" | "Low";
export type EngagementStatus = "Active" | "Completed" | "None";
export type Availability = "Available" | "On Assignment" | "Unavailable";
export type Region = "Americas" | "Europe" | "Asia-Pacific" | "Middle East & Africa";

/**
 * Status lifecycle for an EngagementRecord (the row-per-engagement view used
 * on the /engagements page). Distinct from EngagementStatus (which is about
 * the per-facilitator engagement entries embedded in the Speaking Directory).
 */
export type EngagementRecordStatus =
  | "Active"      // currently happening
  | "Upcoming"    // booked but not started
  | "Completed"   // delivered
  | "Cancelled"
  | "On Hold";

/**
 * One engagement (workshop / training / program) sourced from the
 * "Engagements" tab of the Pool Data spreadsheet.
 */
export interface EngagementRecord {
  id: string;
  name: string;              // Workshop / engagement title
  client: string;            // Organization being served
  status: EngagementRecordStatus;
  startDate: string;         // free-form, displayed as-is
  endDate: string;           // optional
  location: string;          // optional
  type: string;              // "Workshop", "Training", "1:1", etc.
  facilitators: string[];    // names matching Speaking Directory entries
  valueUSD: string;          // optional, free-form
  notes: string;             // optional
}

export interface Engagement {
  name: string;
  status: EngagementStatus;
  date: string;
}

export interface Facilitator {
  id: string;
  name: string;
  photoUrl: string;
  linkedinUrl: string;
  email?: string;
  website?: string;
  focus?: Focus; // optional — undefined means not yet categorized in sheet
  experienceLevel: ExperienceLevel;
  availability: Availability;
  region: Region;
  tier?: string; // Joe's tier rating from sheet (e.g., "Yes", "Tier 1")
  location: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  bio: string;
  languages: string[];
  industryExperience: string[];
  employmentStatus?: string;
  notes?: string;
  engagements: Engagement[];
  currentEngagement: string | null;
}
