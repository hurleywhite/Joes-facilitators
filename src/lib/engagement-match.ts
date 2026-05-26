/**
 * Token-overlap fuzzy matcher for engagement names.
 *
 * Used to back-link a facilitator's per-row "Eng N Name" entries
 * (e.g. "Tamkeen Bahrain", "AbbVie AI Workshop") to the canonical
 * engagement rows on the Engagements tab (e.g. "Tamkeen", "AbbVie"),
 * which are usually shorter and may use different conventions.
 *
 * Algorithm: lowercase + strip non-alnum + tokenize. Match when the
 * shorter side's significant tokens are all contained in the longer
 * side. So:
 *   "Tamkeen" ↔ "Tamkeen Bahrain"   → match
 *   "AbbVie"  ↔ "AbbVie AI Workshop"→ match
 *   "Google"  ↔ "Goldman Sachs"     → no match
 *
 * Stop-words ("the", "and", "for", common workshop nouns) are
 * dropped so they don't anchor a false positive.
 */

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "engagement",
  "workshop",
  "training",
  "session",
  "sessions",
  "program",
  "programs",
  "course",
  "courses",
  "summit",
  "event",
  "meeting",
  "meetings",
  "deal",
  "ai",
  "tech",
  "inc",
  "llc",
  "ltd",
]);

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Returns true when the two strings refer to the same engagement.
 * Lowercase exact match → true. Otherwise: the shorter side's
 * significant tokens must all appear in the longer side.
 */
export function engagementNamesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const an = a.toLowerCase().trim();
  const bn = b.toLowerCase().trim();
  if (an === bn) return true;

  const aTokens = normalize(a);
  const bTokens = normalize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  const [shorter, longer] =
    aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const longerSet = new Set(longer);
  for (const t of shorter) {
    if (!longerSet.has(t)) return false;
  }
  return true;
}
