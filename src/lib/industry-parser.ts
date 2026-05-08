/**
 * Heuristic industry-experience and company extractor.
 *
 * Two extraction passes work in parallel against a free-form bio:
 *
 *   1. Keyword-based industry detection (INDUSTRY_PATTERNS) — fires on
 *      generic terms like "fintech", "pharma", "Fortune 500" that don't
 *      name a specific company.
 *
 *   2. Company-name detection (KNOWN_COMPANIES) — fires on specific
 *      employer/client mentions ("Pfizer", "AWS", "Visa") and contributes
 *      BOTH the company name (so it surfaces as a past-company chip) AND
 *      the industry implied by that company.
 *
 * Both passes are deliberately conservative: better to under-tag than to
 * slap "Healthcare" on someone who happens to use the word "wellness".
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
 * Patterns are case-insensitive and matched as whole words where it
 * matters (\b word boundaries).
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
    /\bdigital\s+health\b/i,
    /\bhealth[\s-]tech\b/i,
  ],
  Pharma: [
    /\bpharma(ceutical)?s?\b/i,
    /\bdrug\s+(discovery|development)\b/i,
    /\btherapeutics?\b/i,
  ],
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
    /\bpayments?\b/i,
    /\bhedge\s+funds?\b/i,
    /\basset\s+management\b/i,
    /\bprivate\s+equity\b/i,
  ],
  Insurance: [/\binsurance\b/i, /\binsurer(s)?\b/i, /\bre[\s-]?insurance\b/i],
  Technology: [
    /\btech\s+industry\b/i,
    /\btech\s+(companies|company|sector|firms?)\b/i,
    /\bsoftware\s+(industry|companies|company)\b/i,
    /\bsilicon\s+valley\b/i,
    /\btech\s+startups?\b/i,
  ],
  SaaS: [/\bsaas\b/i, /\bsoftware[\s-]as[\s-]a[\s-]service\b/i, /\bb2b\s+software\b/i],
  Retail: [/\bretail\b/i, /\bretailer(s)?\b/i, /\bd2c\b/i],
  "E-commerce": [/\be[\s-]?commerce\b/i, /\bonline\s+retail\b/i, /\bdtc\b/i, /\bmarketplaces?\b/i],
  "Consumer Goods": [/\bconsumer\s+goods\b/i, /\bcpg\b/i, /\bfmcg\b/i, /\bbeverages?\b/i],
  Manufacturing: [/\bmanufactur(ing|ers?)\b/i, /\bindustrial\b/i, /\bfactor(y|ies)\b/i, /\bsupply\s+chain\b/i],
  Automotive: [/\bautomotive\b/i, /\bauto\s+industry\b/i, /\bvehicle(s)?\b/i, /\bcar\s+(industry|companies)\b/i, /\bmobility\s+(sector|companies)\b/i],
  Energy: [
    /\benergy\s+(sector|industry|companies|company)\b/i,
    /\boil\s*(\&|and)\s*gas\b/i,
    /\brenewable(s)?\b/i,
    /\butilit(y|ies)\b/i,
    /\bclean\s+energy\b/i,
  ],
  Education: [/\beducation\b/i, /\bedtech\b/i, /\bacademic\b/i, /\buniversit(y|ies)\b/i, /\bschools?\b/i, /\bfaculty\b/i, /\bprofessor\b/i, /\bteach(er|ing)\b/i, /\bcurriculum\b/i],
  Government: [/\bgovernment\b/i, /\bpublic\s+sector\b/i, /\bcivic\b/i, /\bpolicy\b/i, /\bgovt\b/i, /\bdepartment\s+of\s+(defense|state|education|energy|treasury)\b/i, /\bmilitary\b/i, /\bair\s+force\b/i, /\bfederal\s+agency\b/i],
  Media: [/\bmedia\b/i, /\bpublishing\b/i, /\bentertainment\b/i, /\bbroadcast/i, /\bpodcast/i, /\bstreaming\b/i],
  Marketing: [/\bmarketing\b/i, /\badvertising\b/i, /\bbrand(ing)?\b/i, /\bagenc(y|ies)\b/i],
  Legal: [/\blegal\b/i, /\blaw\s+firms?\b/i, /\battorneys?\b/i, /\bcompliance\b/i],
  "Real Estate": [/\breal\s+estate\b/i, /\bpropert(y|ies)\b/i, /\bproptech\b/i],
  Telecom: [/\btelecom(munications)?\b/i, /\bmobile\s+operators?\b/i],
  Logistics: [/\blogistics\b/i, /\bsupply\s+chain\b/i, /\bshipping\b/i, /\bfreight\b/i, /\bwarehous/i],
  "Travel & Hospitality": [/\btravel\b/i, /\bhospitality\b/i, /\bairlines?\b/i, /\bhotels?\b/i, /\bcruise/i],
  "Non-profit": [/\bnon[\s-]?profit(s)?\b/i, /\bngo(s)?\b/i, /\bcharit(y|ies)\b/i, /\bnonprofit/i, /\bfoundation\b/i],
  "Enterprise / Fortune 500": [/\bfortune\s*500\b/i, /\bfortune\s*100\b/i, /\bfortune\s*400\b/i, /\bf500\b/i, /\benterprise\s+companies\b/i, /\blarge\s+enterprises?\b/i, /\bfortune-?(?:100|500)\b/i],
  Startups: [/\bstartup(s)?\b/i, /\bventure\s+backed\b/i, /\bvc[\s-]backed\b/i, /\bearly[\s-]stage\b/i, /\bfounder\b/i, /\bco[\s-]?founder\b/i],
  Cloud: [/\bcloud\s+(architecture|computing|infrastructure|providers?|platforms?)\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i, /\bgoogle\s+cloud\b/i],
};

/**
 * Curated company → industries map. Keys are matched as whole words,
 * case-insensitive. Listed first by sector cluster so additions are
 * easy to find. We deliberately keep this finite (~150 names) — the
 * goal is high precision on the names that actually show up in
 * facilitator bios, not exhaustive coverage of every Fortune 500
 * company.
 *
 * When a company is mentioned in a bio, the parser surfaces:
 *   - the company name as a past-company chip
 *   - all of the implied industries as industry-experience chips
 */
export const KNOWN_COMPANIES: Record<string, KnownIndustry[]> = {
  // ------------------------------------------------------------ Tech
  "Google": ["Technology", "Cloud"],
  "Microsoft": ["Technology", "Cloud"],
  "Microsoft Azure": ["Cloud"],
  "Azure": ["Cloud"],
  "Amazon": ["Technology", "E-commerce", "Cloud"],
  "Amazon Web Services": ["Cloud"],
  "AWS": ["Cloud"],
  "Apple": ["Technology"],
  "Meta": ["Technology"],
  "Facebook": ["Technology"],
  "Netflix": ["Media", "Technology"],
  "Spotify": ["Media", "Technology"],
  "IBM": ["Technology"],
  "Oracle": ["Technology", "SaaS"],
  "Salesforce": ["SaaS", "Technology"],
  "HubSpot": ["SaaS", "Marketing"],
  "Adobe": ["SaaS"],
  "SAP": ["SaaS"],
  "Pandora": ["Media"],
  "SiriusXM": ["Media"],
  "Slack": ["SaaS"],
  "Mural": ["SaaS"],
  "Atlassian": ["SaaS"],
  "Cadence": ["Technology"],
  "Propellernet": ["Marketing"],
  "Howspace": ["SaaS"],

  // ----------------------------------------------- Financial Services
  "Visa": ["Financial Services"],
  "Mastercard": ["Financial Services"],
  "American Express": ["Financial Services"],
  "Amex": ["Financial Services"],
  "JPMorgan": ["Financial Services"],
  "Goldman Sachs": ["Financial Services"],
  "Morgan Stanley": ["Financial Services"],
  "BlackRock": ["Financial Services"],
  "Bank of America": ["Financial Services"],
  "Capital One": ["Financial Services"],
  "Wells Fargo": ["Financial Services"],
  "Citibank": ["Financial Services"],
  "Citigroup": ["Financial Services"],
  "HSBC": ["Financial Services"],
  "BBVA": ["Financial Services"],
  "BNP Paribas": ["Financial Services"],
  "Arval": ["Financial Services"],
  "Lloyds Banking Group": ["Financial Services"],
  "Lloyds Bank": ["Financial Services"],
  "LendingClub": ["Financial Services"],
  "Lending Club": ["Financial Services"],
  "Stripe": ["Financial Services", "Technology"],
  "PayPal": ["Financial Services"],
  "Ameriprise": ["Financial Services"],
  "Ameriprise Financial": ["Financial Services"],
  "DE Shaw": ["Financial Services"],
  "Tamkeen": ["Financial Services", "Government"],

  // -------------------------------------------------------- Insurance
  "Zurich Insurance": ["Insurance"],
  "Zurich Insurances": ["Insurance"],
  "MetLife": ["Insurance"],
  "Allianz": ["Insurance"],
  "AXA": ["Insurance"],
  "Liberty Mutual": ["Insurance"],
  "AIG": ["Insurance"],

  // -------------------------------------------------- Pharma / Health
  "Pfizer": ["Pharma"],
  "Merck": ["Pharma"],
  "AbbVie": ["Pharma"],
  "Novartis": ["Pharma"],
  "AstraZeneca": ["Pharma"],
  "GlaxoSmithKline": ["Pharma"],
  "GSK": ["Pharma"],
  "Roche": ["Pharma"],
  "Sanofi": ["Pharma"],
  "Eli Lilly": ["Pharma"],
  "Johnson & Johnson": ["Pharma", "Healthcare"],
  "Bayer": ["Pharma"],
  "Bristol-Myers": ["Pharma"],
  "Bristol-Myers Squibb": ["Pharma"],
  "Allina Health": ["Healthcare"],
  "UnitedHealth": ["Healthcare"],
  "Anthem": ["Healthcare"],
  "Cigna": ["Healthcare"],
  "Walgreens": ["Healthcare", "Retail"],
  "CVS": ["Healthcare", "Retail"],

  // ---------------------------------------------------- Retail / CPG
  "Walmart": ["Retail"],
  "Target": ["Retail"],
  "Costco": ["Retail"],
  "Best Buy": ["Retail"],
  "Etsy": ["E-commerce", "Retail"],
  "Nike": ["Retail", "Consumer Goods"],
  "Adidas": ["Retail", "Consumer Goods"],
  "Under Armour": ["Retail", "Consumer Goods"],
  "Chanel": ["Retail", "Consumer Goods"],
  "IKEA": ["Retail", "Consumer Goods"],
  "Nestlé": ["Consumer Goods"],
  "Nestle": ["Consumer Goods"],
  "P&G": ["Consumer Goods"],
  "Procter & Gamble": ["Consumer Goods"],
  "Unilever": ["Consumer Goods"],
  "Coca-Cola": ["Consumer Goods"],
  "PepsiCo": ["Consumer Goods"],
  "Pepsi": ["Consumer Goods"],

  // ------------------------------------------ Consulting / Pro Svcs
  "McKinsey": ["Enterprise / Fortune 500"],
  "BCG": ["Enterprise / Fortune 500"],
  "Boston Consulting Group": ["Enterprise / Fortune 500"],
  "Bain": ["Enterprise / Fortune 500"],
  "Deloitte": ["Enterprise / Fortune 500"],
  "Deloitte Greenhouse": ["Enterprise / Fortune 500"],
  "Accenture": ["Enterprise / Fortune 500", "Technology"],
  "KPMG": ["Enterprise / Fortune 500"],
  "PwC": ["Enterprise / Fortune 500"],
  "EY": ["Enterprise / Fortune 500"],
  "Ernst & Young": ["Enterprise / Fortune 500"],
  "Heidrick & Struggles": ["Enterprise / Fortune 500"],
  "businessfourzero": ["Enterprise / Fortune 500"],
  "IDEO": ["Education"],
  "Cap Gemini": ["Enterprise / Fortune 500", "Technology"],
  "Capgemini": ["Enterprise / Fortune 500", "Technology"],
  "Kearney": ["Enterprise / Fortune 500"],
  "Point B": ["Enterprise / Fortune 500"],
  "BanyanGlobal": ["Financial Services"],
  "The Oxford Group": ["Education"],

  // ------------------------------------------------------- Automotive
  "Tesla": ["Automotive"],
  "Ford": ["Automotive"],
  "GM": ["Automotive"],
  "General Motors": ["Automotive"],
  "Toyota": ["Automotive"],
  "BMW": ["Automotive"],
  "Honda": ["Automotive"],
  "Nissan": ["Automotive"],

  // ------------------------------------------- Travel / Hospitality
  "Marriott": ["Travel & Hospitality"],
  "Hilton": ["Travel & Hospitality"],
  "Airbnb": ["Travel & Hospitality"],
  "Delta": ["Travel & Hospitality"],
  "United Airlines": ["Travel & Hospitality"],
  "American Airlines": ["Travel & Hospitality"],

  // ------------------------------------------------------------ Energy
  "Shell": ["Energy"],
  "BP": ["Energy"],
  "ExxonMobil": ["Energy"],
  "Chevron": ["Energy"],
  "Saudi Aramco": ["Energy"],

  // ----------------------------------------------- Education / Academic
  "Harvard": ["Education"],
  "Harvard Kennedy School": ["Education"],
  "Harvard Business School": ["Education"],
  "MIT": ["Education"],
  "MIT xPRO": ["Education"],
  "Stanford": ["Education"],
  "Berkeley": ["Education"],
  "Berkeley SkyDeck": ["Education", "Startups"],
  "Northwestern Kellogg": ["Education"],
  "Northwestern": ["Education"],
  "Imperial College": ["Education"],
  "Imperial College Business School": ["Education"],
  "Kellogg": ["Education"],
  "James Madison University": ["Education"],

  // -------------------------------------------- Non-profit / Government
  "Rockefeller Foundation": ["Non-profit"],
  "Robin Hood Foundation": ["Non-profit"],
  "Bill & Melinda Gates Foundation": ["Non-profit"],
  "AARP": ["Non-profit"],
  "United Nations": ["Non-profit", "Government"],
  "NASA": ["Government"],
  "Department of Defense": ["Government"],
  "Department of State": ["Government"],
  "US Air Force": ["Government"],
  "Air Force": ["Government"],
  "Veterans Affairs": ["Government"],
  "NYC Department of Education": ["Government", "Education"],

  // -------------------------------------------------------------- Media
  "Disney": ["Media"],
  "NBC": ["Media"],
  "BBC": ["Media"],
  "Kantar": ["Marketing"],
  "Ogilvy": ["Marketing"],
  "TED": ["Media", "Non-profit"],
  "Tough Mudder": ["Media", "Travel & Hospitality"],

  // ------------------------------------------------------------ Telecom
  "AT&T": ["Telecom"],
  "Verizon": ["Telecom"],
  "T-Mobile": ["Telecom"],
};

/**
 * Escape characters that have special meaning inside a regex so that
 * "P&G" or "AT&T" can be matched literally without crashing the regex
 * engine on the "&" or other punctuation.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a single combined regex per case-distinct alphabet bucket so we
 * scan the bio once instead of N times. We compile once and cache.
 */
let _companyMatcher: RegExp | null = null;
let _companyOrder: string[] = [];

function ensureCompanyMatcher(): void {
  if (_companyMatcher) return;
  // Sort by length descending so "Amazon Web Services" is tried before
  // "Amazon" — otherwise the shorter prefix would always win and we'd
  // miss the more specific match.
  _companyOrder = Object.keys(KNOWN_COMPANIES).sort(
    (a, b) => b.length - a.length
  );
  const alts = _companyOrder.map(escapeRegExp).join("|");
  // \b at end won't anchor right after "&" — use a lookahead for non-word
  // OR end-of-string. \b at start works fine for letter-leading names.
  _companyMatcher = new RegExp(`\\b(?:${alts})(?=\\b|[^A-Za-z0-9])`, "gi");
}

/**
 * Detect known companies mentioned in the bio. Returns:
 *   - companies: canonical-cased company names in first-seen order
 *   - industries: union of industries those companies imply
 * Empty bio → empty result. Does not modify the input.
 */
export function parseCompaniesFromBio(bio: string): {
  companies: string[];
  industries: KnownIndustry[];
} {
  if (!bio || !bio.trim()) return { companies: [], industries: [] };
  ensureCompanyMatcher();

  const seenCompanies = new Set<string>();
  const companies: string[] = [];
  const industries = new Set<KnownIndustry>();

  // Reset lastIndex because we kept the regex global.
  _companyMatcher!.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = _companyMatcher!.exec(bio)) !== null) {
    // Map back to the canonical key (case-insensitive lookup).
    const matched = m[0];
    const canonical =
      _companyOrder.find((k) => k.toLowerCase() === matched.toLowerCase()) ||
      matched;
    if (seenCompanies.has(canonical.toLowerCase())) continue;
    seenCompanies.add(canonical.toLowerCase());
    companies.push(canonical);
    for (const ind of KNOWN_COMPANIES[canonical] || []) industries.add(ind);
  }

  return { companies, industries: Array.from(industries) };
}

/**
 * Extracts industry tags from a free-form bio. Combines:
 *   - keyword matches against INDUSTRY_PATTERNS
 *   - industries implied by KNOWN_COMPANIES mentions
 * Returns deduped, ordered. Empty input returns [].
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

  // Add industries derived from named companies. parseCompaniesFromBio
  // already dedupes on its side; the Set here merges the two sources.
  for (const ind of parseCompaniesFromBio(bio).industries) {
    found.add(ind);
  }

  return Array.from(found);
}

/**
 * Merges sheet-provided industries with parsed-from-bio industries.
 * Explicit values are kept verbatim and come first; parsed values are
 * added only if they don't already appear (case-insensitively).
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

/**
 * Merges sheet-provided past companies with bio-detected ones. Same
 * "explicit-first, dedupe case-insensitively" semantics as
 * mergeIndustries. Used by the data layer so a bio that says "worked
 * at AWS, Pfizer, and Visa" populates the past-companies chip row even
 * if the sheet column is blank.
 */
export function mergePastCompanies(
  explicit: string[],
  bio: string
): string[] {
  const detected = parseCompaniesFromBio(bio).companies;
  const seen = new Set(explicit.map((s) => s.toLowerCase().trim()));
  const out = [...explicit];
  for (const c of detected) {
    if (!seen.has(c.toLowerCase())) {
      out.push(c);
      seen.add(c.toLowerCase());
    }
  }
  return out;
}
