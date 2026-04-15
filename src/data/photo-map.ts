/**
 * Maps LinkedIn usernames to X/Twitter handles for photo resolution.
 * Photos are served via unavatar.io/x/{handle} which returns real profile photos.
 * If a facilitator has a Photo URL in the spreadsheet, that takes priority.
 * If not, we fall back to this map → unavatar.io → DiceBear initials.
 */
export const linkedinToXHandle: Record<string, string> = {
  alliekmiller: "alliekmiller",
  andrewyng: "AndrewYNg",
  "kathleen-walch": "kath0134",
  andreasmwelsch: "AndreasMWelsch",
  alalia: "scrumcrumbs",
  davidlinthicum: "DavidLinthicum",
  // yizhou — no confirmed X handle
  antonalexander: "AntonAlexander",
  marcofal: "marcofaldini",
  amyinfinity: "amyriseinfinity",
  "adam-biddlecombe": "Adam_Bidd",
  // "heather-murray" — no confirmed X handle
  "matt-village": "matt_village",
  "sairam-sundaresan": "DSaience",
  // "anna-york" — no confirmed X handle
  "madhav-mistry": "MistryMad",
  "jodie-cook": "jodie_cook",
  rowancheung: "rowancheung",
  gregisenberg: "gregisenberg",
  rubenhassid: "rubenhassid",
};

/**
 * Given a LinkedIn URL, returns a photo URL.
 * Priority: unavatar.io/x/{handle} if we have the X handle, otherwise DiceBear.
 */
export function getPhotoUrl(linkedinUrl: string, name: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match) {
    const liUsername = match[1].toLowerCase();
    const xHandle = linkedinToXHandle[liUsername];
    if (xHandle) {
      return `https://unavatar.io/x/${xHandle}`;
    }
  }
  // Fallback: DiceBear initials avatar
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6366f1,8b5cf6,a855f7&fontFamily=Arial&fontSize=40`;
}
