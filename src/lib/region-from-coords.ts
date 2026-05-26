import { Region } from "@/types/facilitator";

/**
 * Derive a Region label from latitude/longitude using bounding boxes.
 *
 * The previous implementation guessed the region from the country string
 * (e.g. "USA" → "Americas", "Israel" → "Middle East & Africa") which
 * disagreed with the map pin position whenever the country was missing,
 * misspelled, or ambiguous. Using the actual coordinates means the
 * region filter on the home page and the map pin location can never
 * disagree.
 *
 * Boxes are deliberately broad and ordered most-specific-first so an
 * Israel pin (lat ~32, lng ~35) hits Middle East & Africa before being
 * swept into Europe by the Eastern Europe box.
 *
 * Returns null when coords aren't usable, so callers can fall back to
 * the country-string derivation.
 */
export function regionFromCoords(lat: number, lng: number): Region | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }

  // Americas — both continents, plus Hawaii / Caribbean.
  if (lng <= -30 && lat >= -56 && lat <= 73) return "Americas";

  // Middle East & Africa — Africa, the Middle East, and the Gulf states.
  // Includes Israel, UAE, Saudi, Egypt, Morocco, South Africa, etc.
  if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 65) {
    return "Middle East & Africa";
  }

  // Europe — west of the Urals, north of the Mediterranean.
  // Lat 36 keeps Spain/Italy/Greece in Europe and Morocco/Tunisia in MEA.
  if (lat >= 36 && lat <= 72 && lng >= -25 && lng <= 60) return "Europe";

  // Asia-Pacific — everything east of ~60° longitude that didn't match
  // MEA, plus Australia and Pacific islands. Russia (most of it) lands
  // here too which matches how operators tend to think about regions.
  if (lng > 60 || lat < -10) return "Asia-Pacific";

  // Antarctica / weird coords — fall through to null so caller decides.
  return null;
}
