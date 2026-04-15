/**
 * Maps LinkedIn usernames to locally hosted profile photos.
 * Photos are in /public/photos/ — no external API dependency.
 * If a facilitator has a Photo URL in the spreadsheet, that takes priority.
 */

const linkedinToPhoto: Record<string, string> = {
  alliekmiller: "/photos/alliekmiller.jpg",
  andrewyng: "/photos/andrewyng.jpg",
  "kathleen-walch": "/photos/kath0134.jpg",
  andreasmwelsch: "/photos/andreasmwelsch.jpg",
  alalia: "/photos/scrumcrumbs.jpg",
  davidlinthicum: "/photos/davidlinthicum.jpg",
  yizhou: "/photos/yizhou.jpg",
  antonalexander: "/photos/antonalexander.jpg",
  marcofal: "/photos/marcofaldini.jpg",
  amyinfinity: "/photos/amyriseinfinity.jpg",
  "adam-biddlecombe": "/photos/adam_bidd.jpg",
  "heather-murray": "/photos/heather-murray.png",
  "matt-village": "/photos/matt_village.png",
  "sairam-sundaresan": "/photos/dsaience.jpg",
  "anna-york": "/photos/anna-york.webp",
  "anna-york-seo": "/photos/anna-york.webp",
  // madhav-mistry: no real photo available (uses cartoon avatar)
  "jodie-cook": "/photos/jodie_cook.png",
  rowancheung: "/photos/rowancheung.jpg",
  gregisenberg: "/photos/gregisenberg.jpg",
  rubenhassid: "/photos/rubenhassid.png",
};

/**
 * Given a LinkedIn URL, returns a photo URL.
 * Priority: local hosted photo > DiceBear initials fallback.
 */
export function getPhotoUrl(linkedinUrl: string, name: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (match) {
    const liUsername = match[1].toLowerCase();
    const photo = linkedinToPhoto[liUsername];
    if (photo) return photo;
  }
  // Fallback: DiceBear initials avatar
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=6366f1,8b5cf6,a855f7&fontFamily=Arial&fontSize=40`;
}
