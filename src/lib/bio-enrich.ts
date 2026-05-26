import { Facilitator } from "@/types/facilitator";

/**
 * Generates a plausible professional bio for a facilitator based on the
 * structured data we have (focus, experience, languages, industries, location).
 *
 * Used when a facilitator has no bio in the spreadsheet. Deterministic and
 * fast — no API calls.
 */
export function generateBio(
  f: Pick<
    Facilitator,
    | "name"
    | "focus"
    | "experienceLevel"
    | "languages"
    | "industryExperience"
    | "location"
  >
): string {
  // First sentence: experience + focus combined into one natural sentence.
  const opener = experienceFocusOpener(f.experienceLevel, f.focus);

  const sentences: string[] = [opener];

  if (f.location) {
    sentences.push(`Based in ${f.location}.`);
  }

  if (f.industryExperience && f.industryExperience.length > 0) {
    sentences.push(
      `Industry experience across ${formatList(f.industryExperience.slice(0, 3))}.`
    );
  }

  if (f.languages && f.languages.length > 1) {
    sentences.push(
      `Delivers in ${formatList(f.languages.slice(0, 4))}.`
    );
  }

  return sentences.join(" ").trim();
}

/**
 * Combines experience level and focus into a single grammatical sentence.
 */
function experienceFocusOpener(experience: string, focus?: string): string {
  const exp =
    experience === "High"
      ? "Senior"
      : experience === "Medium"
        ? "Experienced"
        : "Emerging";

  const role =
    focus === "Facilitation"
      ? "facilitator who designs and runs hands-on workshops that turn AI theory into team capability"
      : focus === "Tech"
        ? "technical AI trainer with hands-on experience implementing AI in enterprise environments"
        : focus === "Both"
          ? "AI practitioner who bridges strategic facilitation and technical depth — equally comfortable leading executive sessions and hands-on workshops"
          : "facilitator with experience delivering AI workshops and training programs";

  return `${exp} ${role}.`;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
