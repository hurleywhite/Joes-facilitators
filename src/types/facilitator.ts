export type Focus = "Facilitation" | "Tech" | "Both";
export type ExperienceLevel = "High" | "Medium" | "Low";
export type EngagementStatus = "Active" | "Completed" | "None";

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
  focus: Focus;
  experienceLevel: ExperienceLevel;
  location: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  bio: string;
  engagements: Engagement[];
  currentEngagement: string | null;
}
