/**
 * Maps LinkedIn usernames to photo URLs.
 * Priority: spreadsheet Photo URL > this map > DiceBear initials.
 *
 * Most photos come from X/Twitter via unavatar.io.
 * For people without X accounts, we use direct URLs from their websites.
 */

const linkedinToXHandle: Record<string, string> = {
  alliekmiller: "alliekmiller",
  andrewyng: "AndrewYNg",
  "kathleen-walch": "kath0134",
  andreasmwelsch: "AndreasMWelsch",
  alalia: "scrumcrumbs",
  davidlinthicum: "DavidLinthicum",
  antonalexander: "AntonAlexander",
  marcofal: "marcofaldini",
  amyinfinity: "amyriseinfinity",
  "adam-biddlecombe": "Adam_Bidd",
  "matt-village": "matt_village",
  "sairam-sundaresan": "DSaience",
  "madhav-mistry": "MistryMad",
  "jodie-cook": "jodie_cook",
  rowancheung: "rowancheung",
  gregisenberg: "gregisenberg",
  rubenhassid: "rubenhassid",
};

/**
 * Direct photo URLs for people without X/Twitter accounts.
 */
const linkedinToDirectPhoto: Record<string, string> = {
  yizhou:
    "https://img1.wsimg.com/isteam/ip/413cebf1-681b-438f-a4b5-f2906194cb73/headshot.jpg/:/rs=w:400,h:400,cg:true",
  "heather-murray":
    "https://nontechies.ai/wp-content/uploads/2026/03/Heather_homepage.png",
  "anna-york-seo":
    "https://anna-york.com/wp-content/uploads/2025/08/Anna-York-SEO.webp",
  "anna-york":
    "https://anna-york.com/wp-content/uploads/2025/08/Anna-York-SEO.webp",
};

/**
 * Given a LinkedIn URL, returns a photo URL.
 * Priority: direct photo URL > unavatar.io/x/{handle} > DiceBear initials.
 */
export function getPhotoUrl(linkedinUrl: string, name: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match) {
    const liUsername = match[1].toLowerCase();

    // Check for direct photo URL first
    const directPhoto = linkedinToDirectPhoto[liUsername];
    if (directPhoto) return directPhoto;

    // Then try X/Twitter via unavatar
    const xHandle = linkedinToXHandle[liUsername];
    if (xHandle) return `https://unavatar.io/x/${xHandle}`;
  }

  // Fallback: DiceBear initials avatar
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6366f1,8b5cf6,a855f7&fontFamily=Arial&fontSize=40`;
}
