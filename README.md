# Joe's Facilitator Pool

A visual dashboard for managing a global pool of workshop facilitators and trainers. Built with Next.js, Tailwind CSS, and Leaflet maps.

## Features

- **Card View** - Browse facilitators with photos, LinkedIn links, focus areas, and experience levels
- **Map View** - Interactive world map showing facilitator locations with color-coded markers
- **Filters** - Search by name/location, filter by focus (Facilitation, Tech, Both) and experience (High, Medium, Low)
- **Engagement Tracking** - View past and current engagements for each facilitator
- **Google Sheets Integration** - Auto-populate from a published Google Sheet
- **Profile Photos** - Supports custom photo URLs with DiceBear avatar fallback

## Google Sheets Setup

1. Create a Google Sheet with these columns:
   `Name, Photo URL, LinkedIn URL, Focus, Experience Level, City, Country, Lat, Lng, Bio, Current Engagement, Engagement History`
2. Go to File > Share > Publish to web > Select CSV format > Copy the URL
3. Set the `GOOGLE_SHEET_CSV_URL` environment variable to that URL

### Engagement History Format
Semicolon-separated entries: `Name|Status|Date;Name|Status|Date`
Example: `ACME Workshop|Completed|2025-11-15;TechSummit|Active|2026-01-10`

## Profile Photos

Since LinkedIn photos can't be pulled directly, use one of these approaches:
- Add a direct image URL in the "Photo URL" column of the spreadsheet
- Leave blank to auto-generate an avatar from the person's initials

## Development

```bash
npm install
npm run dev
```

## Deployment

Deployed on Vercel. Push to `main` to trigger auto-deploy.
