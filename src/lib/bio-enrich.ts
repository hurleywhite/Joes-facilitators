import { Facilitator } from "@/types/facilitator";

/**
 * Generates a plausible professional bio for a facilitator based on the
 * structured data we have (focus, experience, languages, industries, location).
 *
 * Used when a facilitator has no bio in the spreadsheet. Deterministic and
 * fast — no API calls. When ANTHROPIC_API_KEY is set, the API route can
 * upgrade these with Claude-generated bios.
 */
export function generateBio(f: Pick<
  Facilitator,
  "name" | "focus" | "experienceLevel" | "languages" | "industryExperience" | "location" | "city" | "country"
>): string {
  const focusPhrase = focusPhrases[f.focus] || focusPhrases.Both;
  const experiencePhrase = experiencePhrases[f.experienceLevel];

  const locationPhrase = f.location ? `Based in ${f.location}` : "";

  const industryPhrase =
    f.industryExperience && f.industryExperience.length > 0
      ? `Industry experience across ${formatList(f.industryExperience.slice(0, 3))}.`
      : "";

  const languagePhrase =
    f.languages && f.languages.length > 1
      ? `Delivers in ${formatList(f.languages.slice(0, 4))}.`
      : "";

  return [
    `${experiencePhrase} ${focusPhrase}.`,
    locationPhrase ? `${locationPhrase}.` : "",
    industryPhrase,
    languagePhrase,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

const focusPhrases: Record<string, string> = {
  Facilitation:
    "Designs and runs hands-on workshops that turn AI theory into team capability",
  Tech: "Technical AI trainer with hands-on experience implementing AI in enterprise environments",
  Both: "Bridges strategic facilitation and technical depth — equally comfortable leading executive sessions and hands-on technical workshops",
};

const experiencePhrases: Record<string, string> = {
  High: "Senior AI facilitator with a track record of delivering programs for enterprise clients",
  Medium: "Experienced AI facilitator with proven workshop and training delivery",
  Low: "AI facilitator building expertise through diverse engagements",
};

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
