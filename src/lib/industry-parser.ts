/**
 * Heuristic industry-experience extractor.
 *
 * Many facilitators don't have an "Industry Experience" column filled in but
 * mention industries in their bio ("Pharma background", "Worked across
 * fintech", etc.). This module scans bios for industry keywords so the data
 * shows up on the card and is filterable / searchable in the chatbot without
 * Joe having to hand-tag every row.
 *
 * Keep the keyword list deliberately narrow — better to miss a vague mention
 * than to slap "Healthcare" on someone who happens to use the word "wellness".
 */

export const KNOWN_INDUSTRIES = [
  "Healthcare",
  "Pharma",
  "Financial Services",
  "Insurance",
  "Technology",
  "SaaS",
  "Retail",
  "E-commerce",
  "Consumer Goods",
  "Manufacturing",
  "Automotive",
  "Energy",
  "Education",
  "Government",
  "Media",
  "Marketing",
  "Legal",
  "Real Estate",
  "Telecom",
  "Logistics",
  "Travel & Hospitality",
  "Non-profit",
  "Enterprise / Fortune 500",
  "Startups",
  "Cloud",
] as const;

export type KnownIndustry = (typeof KNOWN_INDUSTRIES)[number];

/**
 * Each industry maps to the keyword/regex fragments that signal it.
 * Patterns are case-insensitive and matched as whole words where it matters
 * (so "card" doesn't trigger "card[iac]"... we use word boundaries below).
 */
const INDUSTRY_PATTERNS: Record<KnownIndustry, RegExp[]> = {
  Healthcare: [
    /\bhealth\s*care\b/i,
    /\bhealthcare\b/i,
    /\bmedical\b/i,
    /\bbiotech\b/i,
    /\bhospitals?\b/i,
    /\bclinical\b/i,
    /\bpatient(s)?\b/i,
    /\blife\s+sciences?\b/i,
  ],
  Pharma: [/\bpharma(ceutical)?s?\b/i, /\bdrug\s+(discovery|development)\b/i],
  "Financial Services": [
    /\bfintech\b/i,
    /\bbanking\b/i,
    /\bbank(s)?\b/i,
    /\bfinancial\s+services\b/i,
    /\bcapital\s+markets\b/i,
    /\bwealth\s+management\b/i,
    /\binvestment\s+banking\b/i,
    /\btrading\b/i,
    /\bcredit\b/i,
  ],
  Insurance: [/\binsurance\b/i, /\binsurer(s)?\b/i, /\bre[\s-]?insurance\b/i],
  Technology: [
    /\btech\s+industry\b/i,
    /\btech\s+(companies|company|sector|firms?)\b/i,
    /\bsoftware\s+(industry|companies|company)\b/i,
  ],
  SaaS: [/\bsaas\b/i, /\bsoftware[\s-]as[\s-]a[\s-]service\b/i],
  Retail: [/\bretail\b/i, /\bretailer(s)?\b/i],
  "E-commerce": [/\be[\s-]?commerce\b/i, /\bonline\s+retail\b/i, /\bdtc\b/i],
  "Consumer Goods": [/\bconsumer\s+goods\b/i, /\bcpg\b/i, /\bfmcg\b/i],
  Manufacturing: [/\bmanufactur(ing|ers?)\b/i, /\bindustrial\b/i, /\bfactor(y|ies)\b/i],
  Automotive: [/\bautomotive\b/i, /\bauto\s+industry\b/i, /\bvehicle(s)?\b/i, /\bcar\s+(industry|companies)\b/i],
  Energy: [
    /\benergy\s+(sector|industry|companies|company)\b/i,
    /\boil\s*(\&|and)\s*gas\b/i,
    /\brenewable(s)?\b/i,
    /\butilit(y|ies)\b/i,
  ],
  Education: [/\beducation\b/i, /\bedtech\b/i, /\bacademic\b/i, /\buniversit(y|ies)\b/i, /\bschools?\b/i],
  Government: [/\bgovernment\b/i, /\bpublic\s+sector\b/i, /\bcivic\b/i, /\bpolicy\b/i, /\bgovt\b/i],
  Media: [/\bmedia\b/i, /\bpublishing\b/i, /\bentertainment\b/i, /\bbroadcast/i],
  Marketing: [/\bmarketing\b/i, /\badvertising\b/i, /\bbrand(ing)?\b/i],
  Legal: [/\blegal\b/i, /\blaw\s+firms?\b/i, /\battorneys?\b/i],
  "Real Estate": [/\breal\s+estate\b/i, /\bpropert(y|ies)\b/i, /\bproptech\b/i],
  Telecom: [/\btelecom(munications)?\b/i, /\bmobile\s+operators?\b/i],
  Logistics: [/\blogistics\b/i, /\bsupply\s+chain\b/i, /\bshipping\b/i, /\bfreight\b/i],
  "Travel & Hospitality": [/\btravel\b/i, /\bhospitality\b/i, /\bairlines?\b/i, /\bhotels?\b/i],
  "Non-profit": [/\bnon[\s-]?profit(s)?\b/i, /\bngo(s)?\b/i, /\bcharit(y|ies)\b/i],
  "Enterprise / Fortune 500": [/\bfortune\s*500\b/i, /\bfortune\s*100\b/i, /\bf500\b/i, /\benterprise\s+companies\b/i, /\blarge\s+enterprises?\b/i],
  Startups: [/\bstartup(s)?\b/i, /\bventure\s+backed\b/i, /\bvc[\s-]backed\b/i, /\bearly[\s-]stage\b/i],
  Cloud: [/\bcloud\s+(architecture|computing|infrastructure|providers?|platforms?)\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i],
};

/**
 * Extracts industry tags from a free-form bio string.
 *
 * Returns a deduped, ordered list of canonical industry labels. Empty input
 * returns []. Conservative — only flags an industry when a real keyword fires.
 */
export function parseIndustriesFromBio(bio: string): KnownIndustry[] {
  if (!bio || !bio.trim()) return [];
  const found = new Set<KnownIndustry>();

  for (const [industry, patterns] of Object.entries(INDUSTRY_PATTERNS) as [
    KnownIndustry,
    RegExp[]
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(bio)) {
        found.add(industry);
        break;
      }
    }
  }

  return Array.from(found);
}

/**
 * Merges explicit (sheet-provided) industries with parsed-from-bio industries.
 * Explicit values are kept verbatim and come first; parsed values are added
 * only if they don't already appear (case-insensitively).
 */
export function mergeIndustries(
  explicit: string[],
  bio: string
): string[] {
  const parsed = parseIndustriesFromBio(bio);
  const seen = new Set(explicit.map((s) => s.toLowerCase().trim()));
  const out = [...explicit];
  for (const p of parsed) {
    if (!seen.has(p.toLowerCase())) {
      out.push(p);
      seen.add(p.toLowerCase());
    }
  }
  return out;
}
