# Facilitator Pool App — Handoff Doc
<!-- redeploy trigger: 2026-05-11 — pick up new APPS_SCRIPT_AVAILABILITY_URL env var -->


A Next.js 16 app on Vercel that visualizes ArcticMind's global pool of
facilitators. Data lives in a Google Sheet ("Pool Data") with several tabs;
the app reads via published CSV URLs and writes back via a Google Apps Script
web app. Repo: `hurleywhite/Joes-facilitators` (default branch: `main`).

This doc captures the full state of the app, the data model, the integration
points, and every feature built so a fresh Claude Code session can pick up
without re-reading the entire chat history.

---

## 1. Tech stack

- **Frontend / API**: Next.js 16 (app router, RSC + client components), React
  19, Tailwind 4. Hosted on Vercel.
- **Data layer**: Google Sheets (Pool Data workbook), read via published-CSV
  URLs (gviz/tq?tqx=out:csv). Writes via Apps Script web app deployed from the
  same workbook.
- **AI**: Anthropic Claude Sonnet 4.5 for chat + edit parsing + bio
  synthesis (Haiku 4.5 inside Apps Script). Apollo + Exa for enrichment.
- **Map**: Leaflet via react-leaflet, OSM tiles.
- **Auth on the operator surfaces**: none currently — internal use only.

---

## 2. Repo layout

```
Joes-Facilitator-App/
├── apps-script/
│   └── SpeakingDirectoryEnrichment.gs   # Single Apps Script file —
│                                         # bound to Pool Data workbook
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Home (Cards/Map/Calendar views)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── chat/
│   │   │   └── page.tsx                 # /chat — natural-language Q&A
│   │   ├── engagements/
│   │   │   └── page.tsx                 # /engagements — eng cards + drawer
│   │   ├── availability/
│   │   │   └── page.tsx                 # /availability — public self-serve
│   │   ├── edit/
│   │   │   └── page.tsx                 # /edit — notes-to-sheet chatbot
│   │   ├── proposals/
│   │   │   └── page.tsx                 # /proposals — proposal generator
│   │   │                                #   (older flow, still functional)
│   │   └── api/
│   │       ├── facilitators/route.ts
│   │       ├── engagements/route.ts
│   │       ├── chat/route.ts
│   │       ├── availability/
│   │       │   └── submit/route.ts
│   │       ├── edit/
│   │       │   ├── parse/route.ts
│   │       │   └── apply/route.ts
│   │       └── proposals/
│   │           ├── research/route.ts
│   │           ├── recommend/route.ts
│   │           └── generate/route.ts
│   ├── components/
│   │   ├── FacilitatorCard.tsx          # Home page card
│   │   ├── FacilitatorDrawer.tsx        # Slide-over with full profile
│   │   ├── FilterBar.tsx                # Filters + view toggle
│   │   ├── StatsBar.tsx                 # Click-to-filter focus stats
│   │   ├── MapView.tsx                  # Leaflet
│   │   ├── CalendarView.tsx             # 6-month availability timeline
│   │   ├── EngagementDrawer.tsx         # Per-engagement team profiles
│   │   └── proposal/
│   │       ├── ProposalPreview.tsx
│   │       └── FacilitatorPickerCard.tsx
│   ├── data/
│   │   ├── sheets.ts                    # Speaking Directory parser
│   │   ├── engagements.ts               # Engagements tab parser
│   │   ├── availability.ts              # Availability tab parser
│   │   ├── dummy-facilitators.ts        # Fallback when no sheet URL
│   │   └── dummy-engagements.ts
│   ├── lib/
│   │   ├── industry-parser.ts           # Keyword + company → industries
│   │   ├── region-from-coords.ts        # lat/lng → Region label
│   │   ├── engagement-match.ts          # Token-overlap fuzzy matcher
│   │   ├── geocode.ts                   # Server-side geocoding helper
│   │   ├── bio-enrich.ts                # Bio-template fallback
│   │   ├── claude-bio-enrich.ts         # Claude-based bio generation
│   │   └── linkedin-enrich.ts           # LinkedIn metadata fetcher
│   └── types/
│       ├── facilitator.ts               # All core types
│       └── proposal.ts
├── public/                              # logo.avif, photos, etc.
├── HANDOFF.md                           # THIS FILE
└── README.md
```

---

## 3. Data flow

```
                  ┌─────────────────────────────────────┐
                  │   Pool Data workbook (Google Sheet) │
                  │                                      │
                  │   Tabs:                              │
                  │   - Speaking Directory               │
                  │   - Engagements (or Ongoing /        │
                  │     Engagement History)              │
                  │   - Availability                     │
                  └─┬─────────────────────────────┬─────┘
                    │                             │
                    │ published-CSV               │ Apps Script
                    │ (read)                      │ web app (write)
                    │                             │
              ┌─────▼──────┐               ┌──────▼─────────┐
              │ Vercel App │◄──────────────│ Apps Script    │
              │            │  proxy POST   │ doPost handler │
              │ /api/*     │  to web app   │                │
              └────┬───────┘               └────────────────┘
                   │
                   │ HTML/JSON
                   │
              ┌────▼───────┐
              │  Browser   │
              └────────────┘
```

The sheet is the source of truth. Vercel never writes directly — every write
goes through the Apps Script web app (which validates against an optional
shared-secret token in `Script Properties → AVAILABILITY_TOKEN`).

---

## 4. Environment variables (Vercel)

| Var | Used by | Notes |
|---|---|---|
| `GOOGLE_SHEET_CSV_URL` | `/api/facilitators`, `/api/chat`, `/api/edit/*`, `/api/engagements` | Published CSV of Speaking Directory tab. Pasted as the share URL with `?gid=<sheet_id>` or the direct gviz URL. |
| `GOOGLE_ENGAGEMENTS_CSV_URL` | `/api/engagements` | Published CSV of the engagements tab. Same format. |
| `GOOGLE_AVAILABILITY_CSV_URL` | `/api/facilitators`, `/api/chat` | Published CSV of the Availability tab created by `setupAvailabilitySheet()`. |
| `APPS_SCRIPT_AVAILABILITY_URL` | `/api/availability/submit`, `/api/edit/apply` | Web-app `/exec` URL from the Apps Script "Deploy" step. Same URL serves both `kind=availability` and `kind=edit*`. |
| `APPS_SCRIPT_AVAILABILITY_TOKEN` | same | Optional shared secret. Must match `AVAILABILITY_TOKEN` in Apps Script's Script Properties. |
| `ANTHROPIC_API_KEY` | `/api/chat`, `/api/edit/parse`, `/api/proposals/*` | Required for Claude-mode chat, edit parsing, and proposal synthesis. Heuristic fallback exists for chat but not edit. |
| `APOLLO_API_KEY` | (Apps Script side, in Script Properties) | People-match enrichment. Optional. |
| `EXA_API_KEY` | (Apps Script side) | Web-search bio enrichment. Optional. |
| `SLACK_BOT_TOKEN` | `/api/proposals/research` | Older proposal flow. |

`Script Properties` (Apps Script Project Settings, NOT Vercel env):

- `APOLLO_API_KEY`, `EXA_API_KEY`, `ANTHROPIC_API_KEY` — for Apollo + Exa +
  Claude Haiku bio enrichment that runs from inside the spreadsheet.
- `AVAILABILITY_TOKEN` — must match `APPS_SCRIPT_AVAILABILITY_TOKEN` in Vercel.

---

## 5. Core types (src/types/facilitator.ts)

```ts
type Focus = "Facilitation" | "Tech" | "Both";
type ExperienceLevel = "High" | "Medium" | "Low";
type Availability = "Available" | "On Assignment" | "Unavailable";
type Region = "Americas" | "Europe" | "Asia-Pacific" | "Middle East & Africa";
type TravelWillingness = "Yes" | "Domestic" | "No" | "";

interface AvailabilityWindow { start: string; end: string; } // YYYY-MM-DD

interface Facilitator {
  id: string;
  name: string;
  photoUrl: string;
  linkedinUrl: string;
  email?: string;
  website?: string;
  focus?: Focus;
  experienceLevel: ExperienceLevel;
  availability: Availability;
  region: Region;
  tier?: string;
  location: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  bio: string;
  languages: string[];           // "English" is stripped at read time
  industryExperience: string[];  // sheet + bio-keyword + KNOWN_COMPANIES union
  demoVideoUrl?: string;
  pastCompanies?: string[];      // labeled "Has worked with" in UI
  pastRoles?: string[];
  employmentStatus?: string;
  availableWindows?: AvailabilityWindow[];   // from Availability tab
  willingToTravel?: TravelWillingness;
  availabilityNotes?: string;
  availabilityUpdatedAt?: string;
  notes?: string;
  engagements: Engagement[];      // Eng N Name columns
  currentEngagement: string | null;
}

interface EngagementRecord {
  id: string;
  name: string;
  client: string;
  status: "Active" | "Upcoming" | "Completed" | "Cancelled" | "On Hold";
  startDate: string;
  endDate: string;
  location: string;
  type: string;
  facilitators: string[];   // joined from engagements sheet + cross-link
  valueUSD: string;
  notes: string;
}
```

---

## 6. Pages

### `/` — Home

- Three view toggle: **Cards** (default), **Map** (Leaflet), **Calendar**
  (6-month timeline showing everyone's availability windows; click row → open
  drawer).
- Filters: search (name / location / bio / country / industry / past
  companies / past roles), Availability, Region, Focus, Tier, Industry (auto-
  populated from data, sorted by frequency).
- "Available on:" date picker — filters cards to people whose self-served
  windows include that date.
- Header buttons:
  - **Share avail. form** — copies `/availability` URL to clipboard.
  - **Notes** — links to `/edit`.
  - **Ask** — links to `/chat`.
  - **Engagements** — links to `/engagements`.
  - **Refresh**.
- Auto-refreshes every 60s while visible + on tab focus.
- Sorts alphabetically with `localeCompare(undefined, { sensitivity: "base" })`
  so accented names sort correctly.
- "English" filtered from languages defensively (Joe intentionally removed
  it from the sheet).

### `/chat`

- Natural-language facilitator finder. Conversational layout.
- Sends `{ message, history: [{role, content}] }` to `/api/chat`. The API
  replays the last 8 turns so follow-ups have memory.
- Suggestion chips. Empty-state welcome card.
- Cap is 12 matches (was 6 — raised after operator feedback).
- Two paths in the API:
  - **Claude path** (when `ANTHROPIC_API_KEY` is set): forced tool call
    `return_matches` with compact dossier. Honors hard constraints
    (availability, region, language, industry). Includes `availableWindows`
    + `willingToTravel` in dossier so "who's free in October" works.
  - **Heuristic path**: keyword + region + focus + token-match scoring.

### `/engagements`

- Engagement cards grouped by status. Title is the **client/company name**
  (not the generic workshop title like "AI Workshop"). Sticky
  Location · Client subtitle.
- Facilitator chips on each card are buttons → open `EngagementDrawer`
  showing the full team as mini profile tiles.
- Click a tile → opens `FacilitatorDrawer` (full profile) on top.
- Auto-refreshes (60s + on focus).
- **Cross-linking**: `/api/engagements` reads facilitators too and back-
  links them — anyone whose `Eng N Name` columns fuzzy-match an engagement
  name OR client gets added to that engagement's team. The matcher is
  `lib/engagement-match.ts`: token-overlap with stop-words dropped, so
  "Tamkeen" ↔ "Tamkeen Bahrain" matches but "Google" ↔ "Goldman Sachs"
  doesn't. Names already in the Facilitators column win on dedupe.

### `/availability`

- Public, no-auth form. Branded with ArcticMind logo + footer.
- Fields:
  - First + last name (required)
  - Mode (radio): **Rest of year** / **Specific quarters** / **Block dates**.
    Label switches to **"Available for the entire year (2027)"** for
    future years.
  - Year picker (current + next year).
  - Quarter multi-select buttons. Past quarters in the current year render
    greyed-out with strikethrough + `disabled` (kept visible for visual
    balance).
  - Blocked date ranges (multi, add/remove).
  - Travel willingness (Yes / Domestic only / No).
  - Optional notes.
- Submits to `/api/availability/submit` → proxies to Apps Script web app.
- Privacy line: *"Your response is shared only with the ArcticMind
  facilitation team."*

### `/edit`

- Notes-to-sheet chatbot. Apologetically titled "Notes".
- Free-text input. Suggestion chips include multi-step examples.
- Flow: user types a note → `/api/edit/parse` calls Claude with a fixed
  tool set → returns `steps: [{action, preview}]` → UI shows a preview
  card listing all steps → user clicks **Confirm all N** → batch POST to
  `/api/edit/apply` → Apps Script applies each edit, returns per-step
  results → UI shows green check / red alert per step.
- Five action types supported (and the model is told to refuse with
  `needs_clarification` if a note doesn't fit any of them):
  1. `add_engagement` — append to Engagements tab.
  2. `add_facilitator_to_engagement` — append a name to the Facilitators
     column of an existing row (fuzzy match on engagement name OR client).
  3. `update_engagement_status` — change the Status cell.
  4. `add_facilitator_note` — append timestamped note to the Notes cell of
     a facilitator's row.
  5. `update_facilitator_field` — restricted set: Location, Focus, Tier,
     Availability, Industry Experience, Languages, Email, LinkedIn URL.
- Multi-step parsing: Claude may emit multiple tool calls per note. *"Add
  Ryan, Charis, and Allie to Tamkeen and mark Amazon completed"* → 4
  actions, all applied in one batch round-trip.

### `/proposals`

- Older proposal-generator flow. Three-step wizard: input → team picker →
  preview. Pulls Slack context via `/api/proposals/research` (heuristic or
  agentic via Anthropic), recommends team via `/api/proposals/recommend`,
  and generates the full proposal via `/api/proposals/generate`.
- Still functional but predates the chat/edit/availability work. Not
  linked from the home header — accessed by direct URL.

---

## 7. API routes

### `GET /api/facilitators`

Reads `GOOGLE_SHEET_CSV_URL` (Speaking Directory tab), runs `enrich()`:

- Photo URL: spreadsheet → LinkedIn `og:image` → DiceBear initials.
- Coords: spreadsheet → fallback `resolveCoords()` (free geocoder).
- Bio: spreadsheet → LinkedIn `og:description` (cleaned) → template
  fallback in `lib/bio-enrich.ts`.
- `industryExperience`: merges sheet column with bio-parsed industries
  (keyword regex + `KNOWN_COMPANIES` company → industries mapping in
  `lib/industry-parser.ts`).
- `pastCompanies`: merges sheet column with bio-detected companies (same
  KNOWN_COMPANIES dictionary).
- `languages`: strips "English" entries (Joe took it out intentionally).
- `region`: overrides sheet's stale Region values with
  `regionFromCoords(lat, lng)` so the home filter and map pin can never
  disagree.
- `availableWindows`, `willingToTravel`, `availabilityNotes`,
  `availabilityUpdatedAt`: pulled from Availability tab via
  `data/availability.ts`. Latest submission per name wins.

Falls back to `data/dummy-facilitators.ts` when no env var or fetch fails.

### `GET /api/engagements`

Fetches engagements + facilitators. Calls `crossLink()` to back-link any
facilitator whose `Eng N Name` fuzzy-matches an engagement's name or
client. Falls back to `dummy-engagements.ts` when no env or empty sheet.
Sets `X-Engagements-Source` header (`sheet`, `seed`,
`seed-fallback-empty-sheet`, or `seed-fallback-error`).

### `POST /api/chat`

Body: `{ message: string, history?: [{role, content}] }`. Returns
`{ answer, matches, usedClaude, total }`. Loads the pool from
`/api/facilitators`-style logic, dispatches to Claude or heuristic based
on `ANTHROPIC_API_KEY`. Claude path uses forced tool-call
`return_matches` with cap of 12.

### `POST /api/availability/submit`

Body: `SubmitPayload` (firstName/lastName/mode/year/quarter/quarters/
blockedRanges/willingToTravel/notes). Validates. POSTs
`{ kind: "availability"|<implicit>, ...normalized, token }` to
`APPS_SCRIPT_AVAILABILITY_URL`. Apps Script appends a row to the
Availability tab.

### `POST /api/edit/parse`

Body: `{ message: string }`. Returns
`{ steps: [{action, preview}], needsClarification?: string }`. Claude
emits one tool call per edit; `needs_clarification` short-circuits the
whole batch.

### `POST /api/edit/apply`

Body: `{ actions: EditAction[] }` (legacy `{ action }` still accepted).
Validates each kind, POSTs `{ kind: "edit_batch", edits, token }` to
the Apps Script web app. Returns `{ result: { ok, results: [...] } }`.

---

## 8. Apps Script (`apps-script/SpeakingDirectoryEnrichment.gs`)

Single file. Bound to the Pool Data workbook. Adds an **Enrichment** menu
on open with:

- Enrich Empty Bios / Enrich Selected Row / Re-Enrich Bad Bios / Re-Enrich
  ALL Bios
- Fix All Bad Data (one-click) — runs Apollo Location + Apollo employment
  history + coords + region + industries + English strip in sequence.
- Fill Missing Locations (Apollo)
- Fill Missing Lat / Lng (free geocoder, cached)
- Fill Region from Lat/Lng
- Fill Industries from Bio (uses the same expanded keyword set as the app
  + KNOWN_COMPANIES dictionary)
- Fill Past Companies & Roles (Apollo)
- Strip 'English' from Languages
- Set up Availability tab — creates the schema once.
- Install / repair auto-run (30-min trigger that enriches blank-bio rows
  in batches of 30 to avoid Apps Script 6-min execution limit).
- Remove auto-run

### Web-app endpoints (`doPost`, `doGet`)

Dispatched by `payload.kind`:

- `availability` (or absent): appends a row to the Availability tab.
  Multi-select quarters stored as `"2; 3"`.
- `edit`: single structured edit, dispatches to `applyEdit_`.
- `edit_batch`: array of edits, loops `applyEdit_` and returns
  `{ ok: allOk, results: [{ok, message}] }` for per-step UI feedback.

Token check: if `AVAILABILITY_TOKEN` is set in Script Properties, every
incoming POST must include a matching `token` field.

### `applyEdit_(edit)` dispatcher

Handles each of the five action kinds. Uses **fuzzy substring matching**
(case-insensitive) on names — engagement matches name OR client.
Facilitator field updates restricted to a safe enum. Notes appended with
a `(YYYY-MM-DD)` prefix. Adding a facilitator to an engagement is deduped
case-insensitively against existing Facilitators column entries.

### Bio enrichment pipeline (`enrichSpeakingDirRow_`)

1. Canonicalize name (Title-case all-lower or all-upper).
2. Geocode location into Lat/Lng if blank.
3. Set Region from Lat/Lng (overrides stale sheet values).
4. Call `enrichPerson_`:
   - Apollo people-match (LinkedIn URL → email → name).
   - Exa search for a real source page.
   - `synthesizeWithClaude_` — Claude Haiku 4.5 composes a 2-3 sentence
     bio using ONLY the inputs. Strict grounding rules. New: Apollo
     `employment_history` is passed as `APOLLO PAST EMPLOYERS` so notable
     past employers (Warner Music, Microsoft, etc.) make it into the bio.
   - Falls back to a deterministic Apollo-headline + Exa-snippet path if
     Haiku returns `NONE` or is unavailable.
5. `stripSubPhDDegrees_` removes Bachelor's / Master's / MBA / certificate
   mentions. Only PhD / MD / JD survive. Recovers trailing work clauses
   (*"…and brings cross-industry experience…"*) when a degree sentence is
   dropped.
6. `bioQualityIssues_` runs as a guard. Rejects bios with emoji,
   first-person, forum chrome, pipe-heavy LinkedIn headlines,
   foreign-language fragments, ALL-CAPS runs, headline-only stubs,
   markdown headers, or missing the subject's name.
7. Write bio + source-URL cell note. Re-derive industries from final bio.

---

## 9. Spreadsheet column expectations

### Speaking Directory tab

Columns the parser looks at (case-sensitive, with aliases — see
`src/data/sheets.ts`'s `getCol` calls). Critical ones:

| Column | Aliases | Notes |
|---|---|---|
| Name | — | Required |
| LinkedIn URL | LinkedIn / LinkedIn Url / LI URL | |
| Email | — | Duplicate "Email" columns OK; papaparse keeps one |
| Focus | — | Facilitation / Tech / Both |
| Availability | Status | Available / On Assignment / Unavailable (also tolerates 🟢 emoji prefixes, "no", "not available", etc.) |
| Tier | — | "Top"/"Yes" → High, "Low" → Low, blank → Medium |
| Location | — | "City, Country" |
| Lat / Lng | Latitude / Longitude | Numeric |
| Bio | Description / About | Free text |
| Demo Recording | Recording / Demo Video / Video / Loom | URL |
| Industry Experience | Industries / Industry | Semicolon-separated. Merged with bio-detected industries. |
| Past Companies | Companies / Past Employers / Employers / Worked At | Semicolon-separated. Merged with bio-detected. Label in UI: "Has worked with" |
| Past Roles | Roles / Titles / Past Titles / Previous Roles | |
| Photo URL | Photo / Image URL | |
| Languages | Language | Semicolon-separated. "English" stripped. |
| Current Engagement | Current / Active Engagement | |
| Eng N Name / Eng N Status / Eng N Date | for N=1..10 | Per-row engagement history |
| Engagement History | | Legacy fallback: `name|status|date;...` |
| Region | | Overridden by `regionFromCoords` if lat/lng present |
| Additional Skills | Skills | Folded into bio for searchability |
| Notes | Internal Notes | |
| Employment status | Employment Status / Employment | |

### Engagements tab

Either:
- The "Ongoing Engagements" / "Engagement History" schema with one
  `Engagement` column (which doubles as client), `Status`, `Focus`,
  `City`, `Country`. The parser defaults `client = name` when no Client
  column.
- Or the richer schema with `Engagement / Engagement Name`, `Client`,
  `Status`, `Start Date`, `End Date`, `Location`, `Type`, `Facilitators`,
  `Speaker` / `Speakers`, `Value`, `Notes`.

### Availability tab (created by `setupAvailabilitySheet`)

```
Submitted At | Name | Mode | Year | Quarter | Blocked Ranges | Willing To Travel | Notes
```

`Mode` is one of `rest_of_year` / `quarter` / `blocked`. `Quarter` may
contain a single value or a `2; 3` list for multi-select. `Blocked Ranges`
is `YYYY-MM-DD:YYYY-MM-DD; YYYY-MM-DD:YYYY-MM-DD`. Read side normalizes
all three modes into a unified `AvailabilityWindow[]` per facilitator
(latest submission wins).

---

## 10. Setup checklist (for a fresh deploy or a new operator)

1. **Pool Data workbook** in Google Drive. Tabs: Speaking Directory,
   Engagements (or the Ongoing/History pair), Master (optional — Joe's
   snapshot), Summary.
2. **Publish each tab to web** (File → Share → Publish to web → CSV per
   tab). Copy the URLs.
3. **Vercel env vars** (Settings → Environment Variables):
   - `GOOGLE_SHEET_CSV_URL` = Speaking Directory CSV
   - `GOOGLE_ENGAGEMENTS_CSV_URL` = Engagements CSV
   - `ANTHROPIC_API_KEY`
4. **Apps Script**: Extensions → Apps Script → paste
   `apps-script/SpeakingDirectoryEnrichment.gs` → save.
5. In Apps Script: **Project Settings → Script Properties**:
   - `APOLLO_API_KEY`, `EXA_API_KEY`, `ANTHROPIC_API_KEY` (Haiku for bios)
   - Optional `AVAILABILITY_TOKEN` (any random string)
6. **Run once**: Extensions → Enrichment → **Set up Availability tab**.
7. **Deploy as Web App**: Deploy → New deployment → Web app.
   - Execute as: Me. Who has access: Anyone.
   - Copy the `/exec` URL.
8. **Vercel** add:
   - `APPS_SCRIPT_AVAILABILITY_URL` = that `/exec` URL
   - `APPS_SCRIPT_AVAILABILITY_TOKEN` = the same value as
     `AVAILABILITY_TOKEN` (if set)
   - `GOOGLE_AVAILABILITY_CSV_URL` = published CSV of the Availability
     tab (publish that tab too after step 6)
9. **Trigger Vercel redeploy** for env vars to take effect.
10. Run **Enrichment → Fix All Bad Data (one-click)** to backfill
    Location, coords, Region, Industries, English-strip, plus Apollo
    employment history → Past Companies / Past Roles.
11. (Optional) **Install / repair auto-run** to enrich new rows every 30
    minutes.

After each subsequent Apps Script edit: **Deploy → Manage deployments →
New version → Deploy** to push the new code to the existing `/exec` URL.

---

## 11. Known sharp edges

- **Local git hangs** on the author's machine because `~/.gitconfig`
  declares `git-lfs` as a required filter but `git-lfs` isn't installed.
  Workaround: `brew install git-lfs` or remove the `[filter "lfs"]`
  block. Until then, pushes have been done via `gh api` (see push
  scripts in commit history) — works, but every push is one batch of
  blob uploads + tree + commit + ref update.
- **`next dev` / `next build` also hang** on the same machine for an
  unrelated reason (node-on-system idles at 0% CPU). All verification
  happens on the Vercel deploy. A fresh terminal usually clears it.
- **Apollo `employment_history`** isn't guaranteed — many people aren't
  in Apollo. When it's empty, Past Companies stays whatever the sheet
  had. Bio composition tolerates this gracefully.
- **Apps Script web apps** return HTTP 200 even on internal errors. The
  proxy at `/api/availability/submit` and `/api/edit/apply` parses the
  JSON body for the real status.
- **Multi-step edits are best-effort.** Each step succeeds or fails
  independently; partial successes are reported per-step in the UI but
  don't auto-rollback.
- **Fuzzy matching** is token-overlap, not Levenshtein. Typos
  ("Ryan McMnaus") won't match. Same name in multiple rows → first
  hit wins.
- **English stripping** runs on every read. If you want to add a row
  with English as a non-default language, that row's English chip won't
  appear. Workaround: rename to "English (native)" or similar.
- **Calendar view** only shows facilitators with at least one
  declared availability window for the picked 6-month range. Anyone
  who hasn't filled out the self-serve form doesn't appear.
- **Two "Email" columns** in the live Speaking Directory tab. Papaparse
  silently merges to one. Rename one to "Backup Email" if both should
  be preserved.

---

## 12. Major features built in this session (chronological)

1. Chatbot (`/chat`) — natural-language facilitator search, Claude
   tool-call or heuristic fallback. Memory + 12-cap added later.
2. Industry parser — keyword regex + `KNOWN_COMPANIES` dictionary,
   bio-detected industries merged with sheet column. Mirrored into
   Apps Script.
3. Demo Recording column wired through the data pipeline. Shown on
   home card, map popup, chat result, engagements drawer, proposal
   picker.
4. Region from lat/lng — overrides stale sheet values; bounding-box
   classifier in both app and Apps Script.
5. Clickable engagement facilitators + EngagementDrawer with full team
   profile tiles. Sticky "Location · Client" subtitle. Title now uses
   client name.
6. FacilitatorDrawer slide-over — full profile, availability,
   industries, past companies/roles, languages, engagement history.
7. Cross-link facilitators' Eng N Name rows back to engagement cards
   via `engagementNamesMatch` token-overlap fuzzy matcher.
8. Alphabetical sort everywhere.
9. Apps Script: bio QC (reject emoji / forum chrome / first-person /
   hallucinations), sub-PhD degree stripper, Apollo location + past
   employment fetcher, "Fix All Bad Data" one-click cleanup.
10. Availability self-service:
    - `/availability` public form (logo, branded, footer).
    - Multi-select quarter picker with past quarters greyed out.
    - "Available for the entire year" label switch for future years.
    - Apps Script `doPost` handler writes to Availability tab.
    - `/api/facilitators` joins availability into facilitator records.
    - CalendarView timeline as third home-page view.
    - "Available on:" date picker filter on home.
    - Chat dossier includes `availableWindows + willingToTravel`.
    - "Share avail. form" copy-link button in header.
11. Notes-to-sheet chatbot (`/edit`) — five action types, multi-step
    parsing, per-step result feedback. Apps Script `edit_batch` dispatch.
12. Bio enrichment: APOLLO PAST EMPLOYERS surfaced to Haiku so notable
    past companies (Warner Music etc.) appear in the bio text.

---

## 13. Where to push next

- **Add `remove_facilitator_from_engagement`** action — currently no
  way to undo an "add" via the chatbot.
- **Add `add_facilitator`** action — only `add_engagement` exists.
- **Better wrong-person detection** in Apollo / Exa. The Cynthia
  Castillo therapist match was caught by Haiku but only after manual
  re-enrichment.
- **Levenshtein-based fuzzy match** for facilitator names so typos
  like "Ryan McMnaus" still resolve.
- **Per-step Confirm toggles** on the edit chatbot so you can skip one
  bad step in a multi-step note without re-typing the whole thing.
- **Conflict / overlap detection** between facilitator availability
  windows and engagement dates — flag "X is on Tamkeen 2026-07-15 but
  declared unavailable" in the engagements view.
- **Public read-only profile pages** so a facilitator can see what's
  recorded about them (would need lightweight auth, e.g. magic-link
  via email).
