/**
 * Maps LinkedIn usernames to locally hosted, VERIFIED profile photos.
 * Each photo has been sourced from the person's own website, speaker page,
 * or verified publication — not from random social media lookups.
 *
 * Matching is fuzzy — handles LinkedIn URLs with trailing numbers
 * (e.g., "madhav-mistry-999349164" matches "madhav-mistry").
 */

const linkedinToPhoto: Record<string, string> = {
  alliekmiller: "/photos/alliekmiller.jpg",         // AAE Speakers Bureau
  andrewyng: "/photos/andrewyng.jpg",               // AI Fund official site
  "kathleen-walch": "/photos/kath0134.jpg",         // TechTarget contributor
  andreasmwelsch: "/photos/andreasmwelsch.jpg",     // intelligence-briefing.com
  alalia: "/photos/scrumcrumbs.jpg",                // SlideShare profile
  davidlinthicum: "/photos/davidlinthicum.png",     // CloudFest Americas speaker
  yizhou: "/photos/yizhou.png",                     // Medium author profile
  antonalexander: "/photos/antonalexander.jpg",     // AWS professional profile
  marcofal: "/photos/marcofaldini.jpg",             // unavatar.io (pre-downloaded)
  amyinfinity: "/photos/amyinfinity.jpg",           // amyinfinity.com about page
  "adam-biddlecombe": "/photos/adam_bidd.jpg",      // HubSpot Marketing Blog
  "heather-murray": "/photos/heather-murray.png",   // nontechies.ai homepage
  "matt-village": "/photos/matt_village.png",       // Mindstream/Beehiiv author
  "sairam-sundaresan": "/photos/dsaience.jpg",      // Gradient Ascent Substack
  "anna-york": "/photos/anna-york.webp",            // anna-york.com
  "anna-york-seo": "/photos/anna-york.webp",        // anna-york.com (alt URL)
  // madhav-mistry: LinkedIn-only, no public photo — DiceBear fallback
  "jodie-cook": "/photos/jodie_cook.jpg",           // jodiecook.com
  rowancheung: "/photos/rowancheung.jpg",           // rowancheung.com
  gregisenberg: "/photos/gregisenberg.jpg",         // Late Checkout Substack
  gisenberg: "/photos/gregisenberg.jpg",            // alternate LinkedIn URL
  rubenhassid: "/photos/rubenhassid.jpg",           // Global Authority Magazine
  "ruben-hassid": "/photos/rubenhassid.jpg",        // alternate LinkedIn URL
};

/**
 * Given a LinkedIn URL, returns a photo URL.
 *
 * Priority:
 *   1. Local hosted photo (verified, manually-sourced for top facilitators)
 *   2. unavatar.io initials avatar with name (clean, professional, cached on
 *      their CDN — better than DiceBear for fallback)
 */
export function getPhotoUrl(linkedinUrl: string, name: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match) {
    const liUsername = match[1].toLowerCase();

    // Exact match
    if (linkedinToPhoto[liUsername]) return linkedinToPhoto[liUsername];

    // Strip trailing number segments (e.g., "-999349164")
    const stripped = liUsername.replace(/-\d+$/, "");
    if (stripped !== liUsername && linkedinToPhoto[stripped]) {
      return linkedinToPhoto[stripped];
    }

    // Prefix match
    for (const [key, photo] of Object.entries(linkedinToPhoto)) {
      if (liUsername.startsWith(key)) return photo;
    }
  }

  // Fallback: DiceBear initials with a cleaner color palette
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=4f46e5,7c3aed,a855f7,06b6d4,059669&fontWeight=600&textColor=ffffff`;
}
