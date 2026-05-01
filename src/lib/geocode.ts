/**
 * Lightweight geocoding for facilitator locations.
 *
 * Uses a static lookup table of common cities for speed (no network call).
 * Falls back to Nominatim (OpenStreetMap) for unknown locations.
 *
 * Results cached in memory per serverless instance.
 */

// In-memory cache (per serverless instance — resets on deploy)
const cache = new Map<string, { lat: number; lng: number } | null>();

// Static lookup for major cities — instant, no network
const cityLookup: Record<string, { lat: number; lng: number }> = {
  // USA
  "san francisco": { lat: 37.7749, lng: -122.4194 },
  "san francisco bay area": { lat: 37.7749, lng: -122.4194 },
  "palo alto": { lat: 37.4419, lng: -122.143 },
  "san jose": { lat: 37.3382, lng: -121.8863 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  "new york": { lat: 40.7128, lng: -74.006 },
  "ny, ny": { lat: 40.7128, lng: -74.006 },
  brooklyn: { lat: 40.6782, lng: -73.9442 },
  "boston, ma": { lat: 42.3601, lng: -71.0589 },
  boston: { lat: 42.3601, lng: -71.0589 },
  "chicago, il": { lat: 41.8781, lng: -87.6298 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  "miami, fl": { lat: 25.7617, lng: -80.1918 },
  miami: { lat: 25.7617, lng: -80.1918 },
  "austin, tx": { lat: 30.2672, lng: -97.7431 },
  austin: { lat: 30.2672, lng: -97.7431 },
  "atlanta, ga": { lat: 33.749, lng: -84.388 },
  atlanta: { lat: 33.749, lng: -84.388 },
  "seattle, wa": { lat: 47.6062, lng: -122.3321 },
  seattle: { lat: 47.6062, lng: -122.3321 },
  "denver, co": { lat: 39.7392, lng: -104.9903 },
  denver: { lat: 39.7392, lng: -104.9903 },
  "portland, or": { lat: 45.5152, lng: -122.6784 },
  portland: { lat: 45.5152, lng: -122.6784 },
  "washington, dc": { lat: 38.9072, lng: -77.0369 },
  "reston, va": { lat: 38.9586, lng: -77.357 },
  "jackson, wy": { lat: 43.4799, lng: -110.7624 },
  "west palm beach, fl": { lat: 26.7153, lng: -80.0534 },
  "philadelphia, pa": { lat: 39.9526, lng: -75.1652 },
  "houston, tx": { lat: 29.7604, lng: -95.3698 },
  "dallas, tx": { lat: 32.7767, lng: -96.797 },
  "phoenix, az": { lat: 33.4484, lng: -112.074 },
  "san diego, ca": { lat: 32.7157, lng: -117.1611 },
  "minneapolis, mn": { lat: 44.9778, lng: -93.265 },
  "detroit, mi": { lat: 42.3314, lng: -83.0458 },
  // Canada
  toronto: { lat: 43.6532, lng: -79.3832 },
  vancouver: { lat: 49.2827, lng: -123.1207 },
  montreal: { lat: 45.5017, lng: -73.5673 },
  // UK / Europe
  london: { lat: 51.5074, lng: -0.1278 },
  manchester: { lat: 53.4808, lng: -2.2426 },
  birmingham: { lat: 52.4862, lng: -1.8904 },
  edinburgh: { lat: 55.9533, lng: -3.1883 },
  dublin: { lat: 53.3498, lng: -6.2603 },
  paris: { lat: 48.8566, lng: 2.3522 },
  berlin: { lat: 52.52, lng: 13.405 },
  munich: { lat: 48.1351, lng: 11.582 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  barcelona: { lat: 41.3851, lng: 2.1734 },
  rome: { lat: 41.9028, lng: 12.4964 },
  milan: { lat: 45.4642, lng: 9.19 },
  zurich: { lat: 47.3769, lng: 8.5417 },
  geneva: { lat: 46.2044, lng: 6.1432 },
  lisbon: { lat: 38.7223, lng: -9.1393 },
  stockholm: { lat: 59.3293, lng: 18.0686 },
  copenhagen: { lat: 55.6761, lng: 12.5683 },
  oslo: { lat: 59.9139, lng: 10.7522 },
  helsinki: { lat: 60.1699, lng: 24.9384 },
  warsaw: { lat: 52.2297, lng: 21.0122 },
  vienna: { lat: 48.2082, lng: 16.3738 },
  brussels: { lat: 50.8503, lng: 4.3517 },
  // Asia-Pacific
  tokyo: { lat: 35.6762, lng: 139.6503 },
  seoul: { lat: 37.5665, lng: 126.978 },
  beijing: { lat: 39.9042, lng: 116.4074 },
  shanghai: { lat: 31.2304, lng: 121.4737 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  "kuala lumpur": { lat: 3.139, lng: 101.6869 },
  "lumpur, malaysia": { lat: 3.139, lng: 101.6869 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  jakarta: { lat: -6.2088, lng: 106.8456 },
  manila: { lat: 14.5995, lng: 120.9842 },
  "hong kong": { lat: 22.3193, lng: 114.1694 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  "mumbai, india": { lat: 19.076, lng: 72.8777 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  delhi: { lat: 28.7041, lng: 77.1025 },
  "new delhi": { lat: 28.6139, lng: 77.209 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
  auckland: { lat: -36.8485, lng: 174.7633 },
  // Middle East & Africa
  "tel aviv": { lat: 32.0853, lng: 34.7818 },
  jerusalem: { lat: 31.7683, lng: 35.2137 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  "abu dhabi": { lat: 24.4539, lng: 54.3773 },
  doha: { lat: 25.2854, lng: 51.531 },
  riyadh: { lat: 24.7136, lng: 46.6753 },
  manama: { lat: 26.2285, lng: 50.586 },
  cairo: { lat: 30.0444, lng: 31.2357 },
  lagos: { lat: 6.5244, lng: 3.3792 },
  nairobi: { lat: -1.2921, lng: 36.8219 },
  johannesburg: { lat: -26.2041, lng: 28.0473 },
  "cape town": { lat: -33.9249, lng: 18.4241 },
  istanbul: { lat: 41.0082, lng: 28.9784 },
  // LATAM
  "mexico city": { lat: 19.4326, lng: -99.1332 },
  "são paulo": { lat: -23.5505, lng: -46.6333 },
  "sao paulo": { lat: -23.5505, lng: -46.6333 },
  "buenos aires": { lat: -34.6037, lng: -58.3816 },
  "rio de janeiro": { lat: -22.9068, lng: -43.1729 },
  santiago: { lat: -33.4489, lng: -70.6693 },
  bogota: { lat: 4.711, lng: -74.0721 },
  lima: { lat: -12.0464, lng: -77.0428 },
};

/**
 * Looks up a location string in the static table (case-insensitive).
 * Tries exact match first, then progressively shorter substrings.
 */
export function lookupCity(
  location: string
): { lat: number; lng: number } | null {
  if (!location) return null;
  const key = location.toLowerCase().trim();

  if (cityLookup[key]) return cityLookup[key];

  // Try just the first part (city before comma)
  const cityOnly = key.split(",")[0].trim();
  if (cityLookup[cityOnly]) return cityLookup[cityOnly];

  // Try matching by substring — e.g., "San Francisco Bay Area" should match "san francisco"
  for (const [k, v] of Object.entries(cityLookup)) {
    if (key.includes(k) || k.includes(cityOnly)) return v;
  }

  return null;
}

/**
 * Geocodes a location via Nominatim (free, no key, ~1 req/sec rate limit).
 * Should only be called for locations not in the static lookup.
 */
export async function geocodeNominatim(
  location: string
): Promise<{ lat: number; lng: number } | null> {
  if (cache.has(location)) return cache.get(location)!;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", location);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "ArcticMind-FacilitatorPool/1.0" },
    });
    if (!res.ok) {
      cache.set(location, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (data.length === 0) {
      cache.set(location, null);
      return null;
    }
    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
    cache.set(location, result);
    return result;
  } catch {
    cache.set(location, null);
    return null;
  }
}

/**
 * Resolves coords for a location: static lookup first, then optionally Nominatim.
 */
export async function resolveCoords(
  location: string,
  useNominatimFallback = false
): Promise<{ lat: number; lng: number } | null> {
  const fromTable = lookupCity(location);
  if (fromTable) return fromTable;

  if (useNominatimFallback) {
    return await geocodeNominatim(location);
  }
  return null;
}
