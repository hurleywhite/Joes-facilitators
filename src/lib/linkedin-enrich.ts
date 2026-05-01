/**
 * LinkedIn enrichment — best-effort bio/photo extraction from public LinkedIn profiles.
 *
 * LinkedIn doesn't provide a free official API, but their public profile pages
 * include Open Graph metadata that we can parse: og:title, og:description, og:image.
 * These typically contain the person's headline and profile photo URL.
 *
 * Notes:
 *   - LinkedIn aggressively bot-blocks. This may return null in production.
 *   - Results are cached per serverless instance to avoid repeat calls.
 *   - For reliable scraping at scale, use a paid service like Proxycurl.
 */

type LinkedInData = {
  title?: string; // e.g., "John Doe | LinkedIn"
  description?: string; // e.g., "Workshop Facilitator at ACME | 15 years..."
  imageUrl?: string;
};

const cache = new Map<string, LinkedInData | null>();

/**
 * Fetches public LinkedIn metadata for a profile URL.
 * Returns null if the page is blocked or unparseable.
 */
export async function fetchLinkedInMetadata(
  url: string
): Promise<LinkedInData | null> {
  if (!url || !url.includes("linkedin.com/in/")) return null;
  if (cache.has(url)) return cache.get(url)!;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ArcticMind-FacilitatorPool/1.0; +https://joes-fac.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      cache.set(url, null);
      return null;
    }

    const html = await res.text();
    const data: LinkedInData = {
      title: extractMeta(html, "og:title"),
      description: extractMeta(html, "og:description"),
      imageUrl: extractMeta(html, "og:image"),
    };

    cache.set(url, data);
    return data;
  } catch {
    cache.set(url, null);
    return null;
  }
}

function extractMeta(html: string, property: string): string | undefined {
  // <meta property="og:description" content="...">
  const re1 = new RegExp(
    `<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`,
    "i"
  );
  const m = html.match(re1) || html.match(re2);
  return m?.[1] ? decodeHtml(m[1]) : undefined;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
