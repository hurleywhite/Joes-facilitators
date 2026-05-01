/**
 * LinkedIn enrichment — best-effort bio/photo extraction from public LinkedIn profiles.
 *
 * Uses Open Graph metadata (og:title, og:description, og:image) from LinkedIn's
 * public profile pages. LinkedIn allows some og: scraping with realistic User-Agent
 * but rate-limits aggressively, so:
 *   - Per-instance cache prevents re-fetches
 *   - Negative results also cached (avoid retry storms)
 *   - Realistic Chrome User-Agent
 *   - 6s timeout per request (LinkedIn can be slow)
 */

type LinkedInData = {
  title?: string;
  description?: string;
  imageUrl?: string;
};

const cache = new Map<string, LinkedInData | null>();

const REALISTIC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchLinkedInMetadata(
  url: string
): Promise<LinkedInData | null> {
  if (!url || !url.includes("linkedin.com/in/")) return null;
  if (cache.has(url)) return cache.get(url)!;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": REALISTIC_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      cache.set(url, null);
      return null;
    }

    const html = await res.text();

    // LinkedIn anti-bot challenge page is small (~1.5KB). Real pages are 700KB+
    if (html.length < 5000) {
      cache.set(url, null);
      return null;
    }

    const data: LinkedInData = {
      title: extractMeta(html, "og:title"),
      description: extractMeta(html, "og:description"),
      imageUrl: extractMeta(html, "og:image"),
    };

    // If we got nothing useful, treat as failure
    if (!data.title && !data.description && !data.imageUrl) {
      cache.set(url, null);
      return null;
    }

    cache.set(url, data);
    return data;
  } catch {
    cache.set(url, null);
    return null;
  }
}

function extractMeta(html: string, property: string): string | undefined {
  // <meta property="og:image" content="...">
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
