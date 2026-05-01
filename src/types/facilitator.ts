export type Focus = "Facilitation" | "Tech" | "Both";
export type ExperienceLevel = "High" | "Medium" | "Low";
export type EngagementStatus = "Active" | "Completed" | "None";
export type Availability = "Available" | "On Assignment" | "Unavailable";
export type Region = "Americas" | "Europe" | "Asia-Pacific" | "Middle East & Africa";

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
