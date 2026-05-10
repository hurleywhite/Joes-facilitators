/**
 * Speaking Directory enrichment for Facilitator Pool Data.
 *
 * Lives in YOUR Pool Data spreadsheet. Three independent enrichments run
 * per row, in priority order:
 *   1. Lat/Lng       — geocoded from Location via Google Maps (free, cached).
 *   2. Region        — derived from Lat/Lng via bounding boxes. Overrides
 *                      stale "Region" column values that disagree with the
 *                      pin (e.g. "Lumpur, Malaysia" tagged as "Americas").
 *   3. Photo URL     — pulled from Apollo (only if cell is blank).
 *   4. Bio           — composed by Claude Haiku 4.5 from Apollo + Exa.
 *                      Strict source-grounded prompt + post-write QC that
 *                      rejects forum chrome, wrong-person matches,
 *                      LinkedIn-headline-only "bios", first-person
 *                      passthrough, emoji, foreign-language fragments,
 *                      and lowercase names. Falls back to deterministic
 *                      Apollo-headline-only when sources are too thin.
 *   5. Industry Exp. — keyword-derived from the cleaned bio + Apollo
 *                      headline/title/org. Same dictionary as the app so
 *                      the column matches what /chat sees.
 *
 * API keys live in Project Settings → Script Properties:
 *     APOLLO_API_KEY    = ...
 *     EXA_API_KEY       = ...
 *     ANTHROPIC_API_KEY = ...   (optional — drops bio quality if missing)
 *
 * Menu:
 *   - Enrich Empty Bios            — full pass, only blank/junk rows
 *   - Enrich Selected Row          — same, just the row your cursor is on
 *   - Re-Enrich Bad Bios           — finds existing bios that fail QC and
 *                                    overwrites them
 *   - Re-Enrich ALL Bios           — wipe + re-run on every row
 *   - Fill Missing Lat / Lng       — geocoding only
 *   - Fill Region from Lat/Lng     — region only (no API keys needed)
 *   - Fill Industries from Bio     — re-parse industries from current bios
 *   - Install / repair auto-run    — schedule every 30 minutes
 *   - Remove auto-run
 */

const SPEAKING_DIRECTORY_SHEET = 'Speaking Directory';
const AVAILABILITY_SHEET = 'Availability';
const AVAILABILITY_HEADERS = [
  'Submitted At',
  'Name',
  'Mode',
  'Year',
  'Quarter',
  'Blocked Ranges',
  'Willing To Travel',
  'Notes',
];

const APOLLO_PEOPLE_MATCH = 'https://api.apollo.io/api/v1/people/match';
const EXA_SEARCH          = 'https://api.exa.ai/search';
const ANTHROPIC_MESSAGES  = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL     = 'claude-haiku-4-5';

/* ============================================================ */
/* MENU                                                         */
/* ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Enrichment')
    .addItem('Enrich Empty Bios',              'enrichEmptyBios')
    .addItem('Enrich Selected Row',            'enrichSelectedRow')
    .addItem('Re-Enrich Bad Bios (auto-detect)', 'reEnrichBadBios')
    .addItem('Re-Enrich ALL Bios (overwrite)', 'reEnrichAllBios')
    .addSeparator()
    .addItem('Fix All Bad Data (one-click)',   'fixAllBadData')
    .addItem('Fill Missing Locations (Apollo)', 'fillMissingLocations')
    .addItem('Fill Past Companies & Roles (Apollo)', 'fillPastEmploymentFromApollo')
    .addItem('Fill Missing Lat / Lng',         'fillMissingCoords')
    .addItem('Fill Region from Lat/Lng',       'fillRegionFromCoords')
    .addItem('Fill Industries from Bio',       'fillIndustriesFromBio')
    .addItem("Strip 'English' from Languages", 'stripEnglishFromLanguages')
    .addSeparator()
    .addItem('Set up Availability tab',         'setupAvailabilitySheet')
    .addSeparator()
    .addItem('Install / repair auto-run',      'installEnrichmentTrigger')
    .addItem('Remove auto-run',                'uninstallEnrichmentTrigger')
    .addToUi();
}

/* ============================================================ */
/* PUBLIC ENTRY POINTS                                          */
/* ============================================================ */

function enrichEmptyBios() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APOLLO_API_KEY') && !props.getProperty('EXA_API_KEY')) {
    SpreadsheetApp.getUi().alert(
      'Set APOLLO_API_KEY and/or EXA_API_KEY in Project Settings → Script ' +
      'Properties first, then re-run this.'
    );
    return;
  }
  const stats = runEnrichmentPass_(/* maxRows */ 0, /* mode */ 'empty');
  showEnrichmentSummary_('Enrichment done.', stats);
}

function enrichSelectedRow() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SPEAKING_DIRECTORY_SHEET) {
    SpreadsheetApp.getUi().alert(
      'Switch to the "' + SPEAKING_DIRECTORY_SHEET + '" sheet first.'
    );
    return;
  }
  const row = ss.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Pick a data row (not the header).');
    return;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APOLLO_API_KEY') && !props.getProperty('EXA_API_KEY')) {
    SpreadsheetApp.getUi().alert(
      'Set APOLLO_API_KEY and/or EXA_API_KEY in Project Settings → ' +
      'Script Properties first.'
    );
    return;
  }
  const wrote = enrichSpeakingDirRow_(sheet, colOf, row, /* force */ true);
  SpreadsheetApp.getUi().alert(
    wrote ? 'Bio written to row ' + row + '.'
          : 'No usable signal for row ' + row + '. See Apps Script → Executions for details.'
  );
}

function reEnrichBadBios() {
  const ui = SpreadsheetApp.getUi();
  const ans = ui.alert(
    'Re-enrich bad bios?',
    'Scans every existing Bio. Rows whose bio fails the quality check ' +
    '(forum chrome, emoji, first-person, etc.) are wiped and re-enriched ' +
    'with Apollo + Exa + Claude. Good bios are left alone. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (ans !== ui.Button.YES) return;
  const stats = runEnrichmentPass_(/* maxRows */ 0, /* mode */ 'bad');
  showEnrichmentSummary_('Bad-bio re-enrichment done.', stats);
}

function reEnrichAllBios() {
  const ui = SpreadsheetApp.getUi();
  const ans = ui.alert(
    'Re-enrich ALL bios?',
    'Overwrites every existing Bio in Speaking Directory. ~$0.006 per row ' +
    'on Claude Haiku. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (ans !== ui.Button.YES) return;

  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Bio']) throw new Error('"Bio" column not found.');
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const bioRange = sheet.getRange(2, colOf['Bio'], lastRow - 1, 1);
    bioRange.clearContent();
    bioRange.clearNote();
  }
  const stats = runEnrichmentPass_(/* maxRows */ 0, /* mode */ 'empty');
  showEnrichmentSummary_('Full re-enrichment done.', stats);
}

/* ============================================================ */
/* ONE-CLICK DATA HEALTH FIX                                    */
/* ============================================================ */

/**
 * Runs every cleanup pass on the sheet in one go and reports a summary.
 * No bio re-enrichment (that costs API credits and is gated behind its
 * own button) — just the deterministic data-health fixes:
 *   1. Fill blank Lat/Lng from Location (free, cached geocoder).
 *   2. Set / correct Region from Lat/Lng (catches "Lumpur, Malaysia"
 *      tagged as "Americas" and similar pin/region mismatches).
 *   3. Re-derive Industry Experience from each existing Bio (idempotent
 *      merge — sheet-provided industries are preserved, new ones added).
 *   4. Strip "English" from Languages — Joe removed it from the sheet on
 *      purpose; this catches any rows where Apollo or a manual edit put
 *      it back.
 *
 * Safe to run repeatedly. Skips rows whose values are already correct,
 * so a second run does nothing if the first run already fixed everything.
 */
function fixAllBadData() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  const lastRow = sheet.getLastRow();

  const stats = {
    locationsFilled: 0,
    employersFilled: 0,
    rolesFilled: 0,
    coordsFilled: 0,
    regionsSet: 0,
    regionsFixed: 0,
    industriesUpdated: 0,
    englishStripped: 0,
  };

  for (let r = 2; r <= lastRow; r++) {
    const name = colOf['Name']
      ? String(sheet.getRange(r, colOf['Name']).getValue() || '').trim() : '';
    if (!name) continue;

    // 0a) Fill missing Location from Apollo. Has to run BEFORE the
    //     coords step — geocoder needs a Location to work with.
    if (fillLocationForRow_(sheet, colOf, r) === 'set') {
      stats.locationsFilled++;
    }
    // 0b) Pull past employers + past roles from Apollo's employment_history.
    //     Replaces the bio-derived "past companies" guesses, which often
    //     conflated clients with employers.
    const empResult = fillPastEmploymentForRow_(sheet, colOf, r);
    if (empResult.companies === 'set') stats.employersFilled++;
    if (empResult.roles === 'set') stats.rolesFilled++;

    // 1) Fill missing lat/lng
    if (colOf['Location'] && colOf['Lat'] && colOf['Lng']) {
      const location = String(sheet.getRange(r, colOf['Location']).getValue() || '').trim();
      if (location && fillCoordsForRow_(sheet, colOf, r, location)) stats.coordsFilled++;
    }

    // 2) Fix region from coords (overrides stale sheet values)
    const result = fillRegionForRow_(sheet, colOf, r);
    if (result === 'set')        stats.regionsSet++;
    else if (result === 'fixed') stats.regionsFixed++;

    // 3) Re-derive industries from existing bio
    if (colOf['Industry Experience'] && colOf['Bio']) {
      const bio = String(sheet.getRange(r, colOf['Bio']).getValue() || '').trim();
      if (bio && fillIndustriesForRow_(sheet, colOf, r, bio, '')) stats.industriesUpdated++;
    }

    // 4) Strip "English" from Languages
    if (colOf['Languages'] || colOf['Language']) {
      const langCol = colOf['Languages'] || colOf['Language'];
      const cell = sheet.getRange(r, langCol);
      const raw = String(cell.getValue() || '');
      const langs = raw.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
      const filtered = langs.filter(l => l.toLowerCase() !== 'english');
      if (filtered.length !== langs.length) {
        cell.setValue(filtered.join('; '));
        stats.englishStripped++;
      }
    }

    Utilities.sleep(50);
  }

  SpreadsheetApp.getUi().alert(
    'Data fix complete.\n' +
    '  Locations filled:      ' + stats.locationsFilled + '\n' +
    '  Past Employers filled: ' + stats.employersFilled + '\n' +
    '  Past Roles filled:     ' + stats.rolesFilled + '\n' +
    '  Lat/Lng filled:        ' + stats.coordsFilled + '\n' +
    '  Regions newly set:     ' + stats.regionsSet + '\n' +
    '  Regions corrected:     ' + stats.regionsFixed + '\n' +
    '  Industries updated:    ' + stats.industriesUpdated + '\n' +
    '  "English" stripped:    ' + stats.englishStripped
  );
}

/**
 * One-time cleanup — removes "English" entries from the Languages
 * column on every row. Surfaced as its own menu item so it can be run
 * standalone without triggering the rest of the data-health pass.
 */
function stripEnglishFromLanguages() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  const langCol = colOf['Languages'] || colOf['Language'];
  if (!langCol) {
    SpreadsheetApp.getUi().alert('"Languages" column not found.');
    return;
  }
  const lastRow = sheet.getLastRow();
  let changed = 0;
  for (let r = 2; r <= lastRow; r++) {
    const cell = sheet.getRange(r, langCol);
    const raw = String(cell.getValue() || '');
    if (!raw) continue;
    const langs = raw.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
    const filtered = langs.filter(l => l.toLowerCase() !== 'english');
    if (filtered.length !== langs.length) {
      cell.setValue(filtered.join('; '));
      changed++;
    }
  }
  SpreadsheetApp.getUi().alert(
    "'English' stripped from " + changed + ' row' + (changed === 1 ? '' : 's') + '.'
  );
}

/* ============================================================ */
/* AUTO-RUN TRIGGER                                             */
/* ============================================================ */

function installEnrichmentTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enrichEmptyBiosScheduled') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enrichEmptyBiosScheduled').timeBased().everyMinutes(30).create();
  SpreadsheetApp.getUi().alert(
    'Auto-enrichment is now running every 30 minutes.\n\n' +
    'Any new row with a Name but no Bio gets enriched automatically. ' +
    'Existing rows with usable bios are skipped.'
  );
}

function uninstallEnrichmentTrigger() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enrichEmptyBiosScheduled') { ScriptApp.deleteTrigger(t); n++; }
  });
  SpreadsheetApp.getUi().alert('Removed ' + n + ' auto-run trigger(s).');
}

function enrichEmptyBiosScheduled() {
  try {
    const stats = runEnrichmentPass_(/* maxRows */ 30, /* mode */ 'empty');
    console.log('Scheduled enrichment: ' + JSON.stringify(stats));
  } catch (err) {
    console.log('Scheduled enrichment failed: ' + err);
  }
}

/* ============================================================ */
/* CORE ENRICHMENT LOOP                                         */
/* ============================================================ */

/**
 * @param maxRows  cap rows touched this pass (0 = no cap)
 * @param mode     'empty' = skip rows that already have a usable bio
 *                 'bad'   = also process rows whose bio fails QC
 */
function runEnrichmentPass_(maxRows, mode) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Bio'])  throw new Error('"Bio" column not found in Speaking Directory.');
  if (!colOf['Name']) throw new Error('"Name" column not found in Speaking Directory.');

  const lastRow = sheet.getLastRow();
  const stats = { enriched: 0, skippedHadBio: 0, skippedBadButLeft: 0, replaced: 0, skippedNoSignal: 0, errors: 0 };

  for (let r = 2; r <= lastRow; r++) {
    if (maxRows && stats.enriched + stats.replaced + stats.skippedNoSignal >= maxRows) break;
    const name = String(sheet.getRange(r, colOf['Name']).getValue() || '').trim();
    if (!name) continue;
    const existing = String(sheet.getRange(r, colOf['Bio']).getValue() || '').trim();

    if (existing) {
      if (mode === 'empty') {
        stats.skippedHadBio++;
        // Industries / region can still be filled even when bio is left alone.
        backfillNonBioColumns_(sheet, colOf, r, existing);
        continue;
      }
      if (mode === 'bad') {
        const issues = bioQualityIssues_(existing, name);
        if (issues.length === 0) {
          stats.skippedHadBio++;
          backfillNonBioColumns_(sheet, colOf, r, existing);
          continue;
        }
        // Wipe it so enrichSpeakingDirRow_ treats this row as empty.
        sheet.getRange(r, colOf['Bio']).clearContent();
        sheet.getRange(r, colOf['Bio']).clearNote();
        console.log('Row ' + r + ' (' + name + '): wiping bad bio — ' + issues.join(', '));
      }
    }

    try {
      const wrote = enrichSpeakingDirRow_(sheet, colOf, r, /* force */ false);
      if (wrote) {
        if (existing) stats.replaced++;
        else stats.enriched++;
      } else {
        stats.skippedNoSignal++;
        // If we wiped a bad bio and got nothing back, that row is now empty.
        // Better than leaving the junk — but leave a note for the operator.
        if (mode === 'bad' && existing) {
          sheet.getRange(r, colOf['Bio']).setNote(
            'Previous bio failed QC and re-enrichment found no clean source. ' +
            'Manual entry needed.'
          );
        }
      }
    } catch (err) {
      stats.errors++;
      console.log('runEnrichmentPass_ row ' + r + ' failed: ' + err);
    }
    Utilities.sleep(400);
  }
  return stats;
}

function showEnrichmentSummary_(title, stats) {
  SpreadsheetApp.getUi().alert(
    title + '\n' +
    '  Filled bio:        ' + stats.enriched + '\n' +
    (stats.replaced ? '  Replaced bad bio:  ' + stats.replaced + '\n' : '') +
    '  Already had bio:   ' + stats.skippedHadBio + '\n' +
    '  No usable signal:  ' + stats.skippedNoSignal + '\n' +
    (stats.errors ? '  Errors:            ' + stats.errors + ' (Apps Script → Executions)' : '')
  );
}

/* ============================================================ */
/* PER-ROW ENRICHMENT                                           */
/* ============================================================ */

function enrichSpeakingDirRow_(sheet, colOf, row, force) {
  const rawName  = String(sheet.getRange(row, colOf['Name']).getValue() || '').trim();
  const name     = canonicalName_(rawName);
  if (name && name !== rawName) sheet.getRange(row, colOf['Name']).setValue(name);
  const linkedIn = colOf['LinkedIn URL']
    ? String(sheet.getRange(row, colOf['LinkedIn URL']).getValue() || '').trim() : '';
  const email    = colOf['Email']
    ? String(sheet.getRange(row, colOf['Email']).getValue() || '').trim() : '';
  const location = colOf['Location']
    ? String(sheet.getRange(row, colOf['Location']).getValue() || '').trim() : '';
  if (!name) return false;

  // Always-on: pull location from Apollo if blank, then geocode, then
  // derive region. This chain lets a row added with just a name +
  // LinkedIn URL fully self-populate location/coords/region without
  // a separate menu run.
  fillLocationForRow_(sheet, colOf, row);
  // Re-read in case fillLocationForRow_ just wrote it.
  const filledLocation = colOf['Location']
    ? String(sheet.getRange(row, colOf['Location']).getValue() || '').trim()
    : location;
  fillCoordsForRow_(sheet, colOf, row, filledLocation);
  fillRegionForRow_(sheet, colOf, row);

  const data = enrichPerson_(name, linkedIn, email, location);
  if (!data || !data.bio) return false;

  // Final QC — never write a bio that fails the same checks we use to
  // detect bad existing rows. Rejects emoji, first-person, forum chrome,
  // foreign-language fragments, headline-only "bios", etc.
  const issues = bioQualityIssues_(data.bio, name);
  if (issues.length > 0) {
    console.log('Row ' + row + ' (' + name + '): rejecting bio (' + issues.join(', ') + ') — ' + data.bio.slice(0, 120));
    return false;
  }

  const bioCell = sheet.getRange(row, colOf['Bio']);
  bioCell.setValue(data.bio);
  if (data.bioSource) bioCell.setNote('Source: ' + data.bioSource); else bioCell.clearNote();

  if (data.photoUrl && colOf['Photo URL']) {
    const photoCell = sheet.getRange(row, colOf['Photo URL']);
    if (!String(photoCell.getValue() || '').trim()) photoCell.setValue(data.photoUrl);
  }

  // Industries from final bio + structured signals.
  fillIndustriesForRow_(sheet, colOf, row, data.bio, data.apolloHeadline);

  return true;
}

function backfillNonBioColumns_(sheet, colOf, row, existingBio) {
  const location = colOf['Location']
    ? String(sheet.getRange(row, colOf['Location']).getValue() || '').trim() : '';
  fillCoordsForRow_(sheet, colOf, row, location);
  fillRegionForRow_(sheet, colOf, row);
  fillIndustriesForRow_(sheet, colOf, row, existingBio, '');
}

/* ============================================================ */
/* BIO QUALITY CHECK                                            */
/* ============================================================ */

/**
 * Returns a list of issues with this bio, empty array if it's good.
 * Callers use the list both as a boolean (good/bad) and to log WHY a
 * bio was rejected so we can debug failures from Apps Script logs.
 *
 * Issues we reject (each one is enough to disqualify a bio):
 *   - emoji or LinkedIn-style icons
 *   - first-person ("I", "I'm", "my", "we")
 *   - forum/community chrome ("commented on the post", "Forum",
 *     "Wish List", "Login", "Followers", "Topics", "comments on",
 *     "did not receive any badges", "miro community")
 *   - LinkedIn-headline-only ("title | title | title" with no real prose)
 *   - foreign-language fragments (Dutch / German / French interview
 *     headers we've actually seen come through)
 *   - too short — less than 90 characters of prose
 *   - missing the subject's name AND surname
 *   - all-caps "headline yelling" surviving the cleaner
 */
function bioQualityIssues_(bio, name) {
  const issues = [];
  if (!bio) { issues.push('empty'); return issues; }
  const t = bio.trim();
  // Length floor: under 60 chars is almost always a stub like "International Tax." —
  // not enough for the card. Above 60 we let it through and let the
  // single-sentence/length pair check below decide.
  if (t.length < 60) issues.push('too short (<60 chars)');

  // Emoji / pictograph
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}‍️]/u.test(t)) {
    issues.push('contains emoji');
  }

  // First person leakage
  if (/(?:^|[^A-Za-z])(I|I'm|I've|My|We|We're|We've|Our)\b/.test(t)) {
    issues.push('first-person');
  }

  // Forum / community chrome
  const chromeRe = /\b(commented on the post|forum|wish list|login|sign\s?in|followers|following|topics|reply|new here|did not receive|miro community|skip to|toggle|cookie|let'?s connect|message me|DM me|connect with me|view 6 photos|approach treatment|psychotherapeut|interop|info-?tainment|known for his unique)\b/i;
  if (chromeRe.test(t)) issues.push('forum/marketing chrome');

  // Pipe-heavy LinkedIn-headline pattern (3+ pipes)
  if ((t.match(/\|/g) || []).length >= 3) issues.push('headline-only (pipes)');

  // Multiple emoji-ish bullet markers (✨ ⚡ 🚀 etc) we've seen survive
  if (/[⚡✨💡💖💼🌟⭐🚀🌍🤍❤️💜]/.test(t)) issues.push('decorative symbols');

  // Foreign language fragments
  if (/\b(weet wat|hij wil|interview\/|Mensen Interview|Vierdejaars|Foto:|## Meet)\b/i.test(t)) {
    issues.push('foreign-language/structured chrome');
  }

  // ALL-CAPS 3+ word run (headline yelling)
  if (/\b[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\b/.test(t)) issues.push('ALL-CAPS run');

  // Markdown header escape
  if (/(^|\s)#{2,}\s/.test(t)) issues.push('markdown header');

  // Missing the subject's name (split on whitespace, expect first token to appear)
  if (name) {
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 3 && t.toLowerCase().indexOf(first.toLowerCase()) === -1) {
      issues.push('does not mention person');
    }
  }

  // Stub-bio detection: reject only when we have BOTH a single substantive
  // sentence AND no real prose backing it. A clean single-sentence bio like
  // "Tara Former is an AI Model Trainer and Generative AI Engineer." is fine
  // when that's all the public signal we can find — better than leaving
  // the cell blank. We only ding it when the bio is also short overall
  // (<120 chars) which is a reliable proxy for "headline only, nothing else".
  const sentences = t.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  if (sentences.length < 2 && t.length < 120) issues.push('headline-only stub');

  return issues;
}

/* ============================================================ */
/* PERSON ENRICHMENT (Apollo + Exa + Haiku)                     */
/* ============================================================ */

function enrichPerson_(name, linkedInUrl, email, location) {
  const apollo = lookupApollo_(name, linkedInUrl, email);
  const exa    = lookupExa_(name, linkedInUrl, apollo);

  let bio = '';
  let bioSource = (exa && exa.url) ? exa.url : '';

  const haiku = synthesizeWithClaude_(name, location, apollo, exa);
  if (haiku && haiku.status === 'ok' && haiku.text) {
    bio = haiku.text;
  } else {
    // Haiku said NONE OR Haiku is unavailable — use the deterministic
    // pipeline. Headline → optional clean Exa snippet → optional location.
    // The 'none' case now ALSO tries the Exa snippet because the snippet
    // already passes looksLikeProse_ (which filters forum/chrome). If
    // Haiku just rejected the page, looksLikeProse_ catches the same
    // patterns at the snippet level — so it's safe.
    bio = headlineFallback_(name, apollo);
    if (exa && exa.snippet && looksLikeProse_(exa.snippet)) {
      bio = (bio ? bio + ' ' : '') + exa.snippet;
    }
    if (location && bio && bio.toLowerCase().indexOf(location.toLowerCase()) === -1) {
      bio += ' Based in ' + location + '.';
    }
    if (haiku && haiku.status === 'none') bioSource = '';
  }

  bio = stripSubPhDDegrees_(bio);
  bio = bio.replace(/\s+/g, ' ').trim();
  if (bio.length > 600) bio = bio.slice(0, 597).replace(/\s+\S*$/, '') + '...';
  if (!bio) return null;

  return {
    bio: bio,
    bioSource: bioSource,
    photoUrl: apollo ? trimOrEmpty_(apollo.photo_url) : '',
    apolloHeadline: apollo ? cleanHeadline_(trimOrEmpty_(apollo.headline) || trimOrEmpty_(apollo.title)) : ''
  };
}

function headlineFallback_(name, apollo) {
  if (!apollo) return '';
  const headline = cleanHeadline_(trimOrEmpty_(apollo.headline));
  const title    = cleanHeadline_(trimOrEmpty_(apollo.title));
  const orgName  = apollo.organization ? trimOrEmpty_(apollo.organization.name) : '';
  if (headline)              return name + ' — ' + headline + '.';
  if (title && orgName)      return name + ' is ' + indefiniteArticle_(title) + ' ' + title + ' at ' + orgName + '.';
  if (title)                 return name + ' is ' + indefiniteArticle_(title) + ' ' + title + '.';
  if (orgName)               return name + ' works at ' + orgName + '.';
  return '';
}

/* ============================================================ */
/* APOLLO                                                       */
/* ============================================================ */

function lookupApollo_(name, linkedInUrl, email) {
  const key = PropertiesService.getScriptProperties().getProperty('APOLLO_API_KEY');
  if (!key) return null;
  const parts = name.split(/\s+/);
  const first = parts[0] || '';
  const last  = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const payload = { reveal_personal_emails: false };
  if (linkedInUrl && linkedInUrl.toLowerCase().indexOf('linkedin.com/') !== -1) payload.linkedin_url = linkedInUrl;
  if (email && /@/.test(email)) payload.email = email;
  if (!payload.linkedin_url && !payload.email) {
    payload.first_name = first;
    payload.last_name  = last;
  }
  try {
    const resp = UrlFetchApp.fetch(APOLLO_PEOPLE_MATCH, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'accept': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      console.log('Apollo HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 250));
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    return json && json.person ? json.person : null;
  } catch (err) {
    console.log('Apollo error: ' + err);
    return null;
  }
}

/* ============================================================ */
/* CLAUDE HAIKU 4.5 — bio synthesis                             */
/* ============================================================ */

function synthesizeWithClaude_(name, location, apollo, exa) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { status: 'unavailable', text: '' };
  if (!apollo && (!exa || !exa.text)) return { status: 'unavailable', text: '' };

  const lines = [];
  lines.push('NAME: ' + name);
  lines.push('LOCATION: ' + (location || '(unknown)'));
  if (apollo) {
    if (apollo.headline)                                  lines.push('APOLLO HEADLINE: ' + apollo.headline);
    if (apollo.title)                                     lines.push('APOLLO TITLE: ' + apollo.title);
    if (apollo.organization && apollo.organization.name)  lines.push('APOLLO ORGANIZATION: ' + apollo.organization.name);
  }
  if (exa && exa.text) {
    lines.push('');
    lines.push('SOURCE PAGE (' + (exa.url || 'unknown') + '):');
    lines.push('"""');
    lines.push(exa.text);
    lines.push('"""');
  }
  const userMessage = lines.join('\n');

  // Strict prompt — concrete examples taken from the actual failure modes
  // observed in past runs (Cynthia therapist mismatch, Andy forum chrome,
  // Chuck emoji headline, Courtney first-person, Ibrahim Dutch fragments).
  const systemPrompt =
    'You write brief, factual third-person bios for a workshop facilitator directory. ' +
    'Use ONLY information from the user message. Never invent claims, numbers, or credentials.\n\n' +

    'GROUNDING RULE — every factual claim must trace to input text:\n' +
    '- Every job title, organization, book title, client name, credential, ' +
    'years-of-experience number, and "since YYYY" date you write MUST appear ' +
    'verbatim in either APOLLO HEADLINE/TITLE/ORGANIZATION or in the SOURCE PAGE text.\n' +
    "- Do NOT infer client lists. If the source doesn't say 'clients including X, Y, Z', do not write that.\n" +
    "- Do NOT infer book authorship. If 'author of [book]' is not in the source, do not write it.\n" +
    "- Do NOT infer 'over N years of experience' unless that exact number is in the source.\n" +
    "- Do NOT extrapolate. 'Senior Designer at X' does NOT license 'led design teams at X'. Stick to what is stated.\n" +
    '- When in doubt, write LESS, not more. A short two-sentence bio grounded in real text beats a longer one with one fabricated clause.\n\n' +

    'CRITICAL — when to refuse with NONE:\n' +
    '- The SOURCE PAGE is about a DIFFERENT person with the same name (e.g. ' +
    'a therapist named Cynthia Castillo when the facilitator is also named ' +
    'Cynthia Castillo, or a tubist named Jim Andrus when the facilitator is ' +
    'a recruiter). Look for occupation/context mismatch with APOLLO TITLE/ORGANIZATION.\n' +
    "- The SOURCE PAGE is community/forum chrome ('commented on the post', " +
    "'Miro Community Forum', 'New Here', 'Topics 0 Reply 1', 'View 6 Photos').\n" +
    "- The SOURCE PAGE is in a non-English language (Dutch, German, French " +
    "interview headers like 'Mensen Interview', 'Vierdejaars', 'weet hij wil').\n" +
    '- The combined inputs yield fewer than two solid factual sentences about ' +
    'this specific facilitator.\n' +
    '- The only signal is a LinkedIn-style headline of pipe-separated job titles ' +
    "with no real prose context (e.g. 'CIO | CTO | Strategist | Leader').\n" +
    'In any of these cases, respond with exactly: NONE\n\n' +

    'OUTPUT RULES (when you DO write a bio):\n' +
    '- 2 to 3 complete sentences. 150–400 characters total.\n' +
    "- Start with the person's full name in proper Title Case (capitalize 'jill kiemele' as 'Jill Kiemele').\n" +
    '- Strict third-person. NEVER use I, I\'m, I\'ve, my, we, our, us.\n' +
    "- Plain prose. NO emoji, NO ✨🚀💡💼 marketing icons, NO ALL-CAPS, NO markdown headers (##), NO pipes (|).\n" +
    '- If APOLLO HEADLINE is in ALL CAPS, render it in normal Title Case.\n' +
    "- If a sentence in SOURCE PAGE is in first person ('I love designing...'), rewrite it in third person using the name.\n" +
    '- Lead with their current role and area of focus. You may add one concrete WORK credential, client, or organization ONLY if it appears verbatim in the inputs. Otherwise stop after the role/focus sentence.\n' +
    '- WORK EXPERIENCE ONLY. Do NOT mention any academic degree below a PhD: ' +
    "no Bachelor's, no Master's, no MA, no MS, no MBA, no BA, no BSc, no double major, no certificates, no diplomas, no 'graduated from X', no 'earned a degree at X', no 'student of X'. Skip these entirely. " +
    'You MAY mention a PhD or doctorate (e.g. "holds a PhD in Economics") if directly relevant. ' +
    'A current faculty/professor role is a JOB and is fine to include — it is not a degree.\n' +
    '- Do not append "Based in [location]" — the directory shows location separately.\n' +
    "- If you cannot satisfy these rules, respond with exactly: NONE. NONE alone, no explanation.";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(ANTHROPIC_MESSAGES, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'accept': 'application/json'
        },
        payload: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        }),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code === 429 || (code >= 500 && code < 600)) {
        if (attempt === 0) { Utilities.sleep(1500); continue; }
        console.log('Anthropic HTTP ' + code + ' after retry: ' + resp.getContentText().slice(0, 250));
        return { status: 'unavailable', text: '' };
      }
      if (code !== 200) {
        console.log('Anthropic HTTP ' + code + ': ' + resp.getContentText().slice(0, 250));
        return { status: 'unavailable', text: '' };
      }
      const json = JSON.parse(resp.getContentText());
      if (!json || !json.content) return { status: 'unavailable', text: '' };
      let text = json.content
        .filter(b => b && b.type === 'text')
        .map(b => b.text || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) return { status: 'unavailable', text: '' };
      if (/^\s*none\b/i.test(text)) return { status: 'none', text: '' };
      return { status: 'ok', text: text };
    } catch (err) {
      if (attempt === 0) { Utilities.sleep(1500); continue; }
      console.log('Anthropic error after retry: ' + err);
      return { status: 'unavailable', text: '' };
    }
  }
  return { status: 'unavailable', text: '' };
}

/* ============================================================ */
/* EXA                                                          */
/* ============================================================ */

function lookupExa_(name, linkedInUrl, apollo) {
  const key = PropertiesService.getScriptProperties().getProperty('EXA_API_KEY');
  if (!key) return null;
  const orgName = apollo && apollo.organization ? trimOrEmpty_(apollo.organization.name) : '';
  const queryParts = ['"' + name + '"'];
  if (orgName) queryParts.push('"' + orgName + '"');
  queryParts.push('facilitator OR coach OR workshop biography');

  try {
    const resp = UrlFetchApp.fetch(EXA_SEARCH, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'accept': 'application/json' },
      payload: JSON.stringify({
        query: queryParts.join(' '),
        type: 'auto',
        numResults: 4,
        contents: { text: { maxCharacters: 1500 } }
      }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      console.log('Exa HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 250));
      return null;
    }
    const json = JSON.parse(resp.getContentText());
    if (!json || !json.results || !json.results.length) return null;
    const first = name.split(/\s+/)[0];
    for (let i = 0; i < json.results.length; i++) {
      const r = json.results[i];
      const cleaned = cleanProseText_(r.text || '');
      if (!cleaned) continue;
      const tl = cleaned.toLowerCase();
      if (tl.indexOf(name.toLowerCase()) === -1 && tl.indexOf(first.toLowerCase()) === -1) continue;
      const snippet = pickBioSentences_(cleaned, name, 2);
      return { url: r.url, text: cleaned.slice(0, 1500), snippet: snippet };
    }
    return null;
  } catch (err) {
    console.log('Exa error: ' + err);
    return null;
  }
}

function pickBioSentences_(text, name, maxCount) {
  const first = name.split(/\s+/)[0];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out = [];
  for (let i = 0; i < sentences.length && out.length < maxCount; i++) {
    let s = sentences[i].trim();
    if (s.length < 40 || s.length > 280) continue;
    if (/^(home|about|menu|contact|skip to|sign in|log in|cookie)/i.test(s)) continue;
    const mentionsPerson  = s.indexOf(name) !== -1 || s.indexOf(first) !== -1;
    const looksFirstPerson = /\b(I|I'm|I've|my|My)\b/.test(s);
    if (!mentionsPerson && !looksFirstPerson) continue;
    if (looksFirstPerson) {
      s = s
        .replace(/\bI am\b/g, name + ' is')
        .replace(/\bI'm\b/g, name + ' is')
        .replace(/\bI've been\b/g, name + ' has been')
        .replace(/\bI've\b/g, name + ' has')
        .replace(/\bI have\b/g, name + ' has')
        .replace(/\bI work\b/g, name + ' works')
        .replace(/\bI lead\b/g, name + ' leads')
        .replace(/\bI help\b/g, name + ' helps')
        .replace(/\bI bring\b/g, name + ' brings')
        .replace(/\bMy\b/g, name + "'s")
        .replace(/\bmy\b/g, first + "'s");
    }
    out.push(s);
  }
  return out.join(' ');
}

/* ============================================================ */
/* GEOCODING + REGION                                           */
/* ============================================================ */

/* ============================================================ */
/* LOCATION FROM APOLLO                                         */
/* ============================================================ */

/**
 * For every row where Location is blank but a LinkedIn URL or email
 * is present, ask Apollo for the person and fill in "City, Country"
 * (or "City, State" for US rows). Apollo's people-match endpoint
 * already returns city/state/country fields — we just weren't using
 * them. Once Location lands the geocoder + region pipeline take
 * over and fill lat/lng + region without further prompting.
 *
 * Conservative — never overwrites an existing Location value, even
 * if Apollo's looks more complete. Joe's manual entries win.
 */
function fillMissingLocations() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APOLLO_API_KEY')) {
    SpreadsheetApp.getUi().alert(
      'APOLLO_API_KEY missing. Add it in Project Settings → Script ' +
      'Properties first.'
    );
    return;
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Location']) throw new Error('"Location" column not found.');
  if (!colOf['Name']) throw new Error('"Name" column not found.');

  const lastRow = sheet.getLastRow();
  let filled = 0, skippedHadLocation = 0, skippedNoSignal = 0;
  for (let r = 2; r <= lastRow; r++) {
    const result = fillLocationForRow_(sheet, colOf, r);
    if (result === 'set') filled++;
    else if (result === 'skipped-had') skippedHadLocation++;
    else if (result === 'no-signal') skippedNoSignal++;
    Utilities.sleep(400);  // gentle pacing on Apollo
  }
  SpreadsheetApp.getUi().alert(
    'Locations filled.\n' +
    '  Newly set:        ' + filled + '\n' +
    '  Already had:      ' + skippedHadLocation + '\n' +
    '  No usable signal: ' + skippedNoSignal
  );
}

/**
 * Returns 'set' | 'skipped-had' | 'no-signal' | 'no-name'.
 * Skipped-had means Location was already populated. No-signal means
 * Apollo didn't return city/state/country for this person.
 */
function fillLocationForRow_(sheet, colOf, row) {
  if (!colOf['Location'] || !colOf['Name']) return 'no-name';
  const name = String(sheet.getRange(row, colOf['Name']).getValue() || '').trim();
  if (!name) return 'no-name';

  const cell = sheet.getRange(row, colOf['Location']);
  const existing = String(cell.getValue() || '').trim();
  if (existing) return 'skipped-had';

  const linkedIn = colOf['LinkedIn URL']
    ? String(sheet.getRange(row, colOf['LinkedIn URL']).getValue() || '').trim() : '';
  const email    = colOf['Email']
    ? String(sheet.getRange(row, colOf['Email']).getValue() || '').trim() : '';

  const apollo = lookupApollo_(name, linkedIn, email);
  if (!apollo) return 'no-signal';

  const city    = trimOrEmpty_(apollo.city);
  const state   = trimOrEmpty_(apollo.state);
  const country = trimOrEmpty_(apollo.country);
  const formatted = trimOrEmpty_(apollo.present_raw_address);

  let location = '';
  if (city && state && (country === 'United States' || country === 'USA' || !country)) {
    location = city + ', ' + state;
  } else if (city && country) {
    location = city + ', ' + country;
  } else if (city) {
    location = city;
  } else if (formatted) {
    location = formatted;
  } else if (country) {
    location = country;
  }
  if (!location) return 'no-signal';

  cell.setValue(location);
  return 'set';
}

/* ============================================================ */
/* PAST EMPLOYMENT FROM APOLLO                                  */
/* ============================================================ */

/**
 * Apollo's people-match endpoint returns an `employment_history`
 * array — every past role with organization_name, title, start/end
 * dates, and a `current` flag. Pulling that into the sheet gives
 * REAL employer data instead of relying on bio prose where the only
 * companies mentioned are usually clients ('worked with Nike, IKEA,
 * Chanel') rather than employers.
 *
 * Writes:
 *   - Past Companies = past employers, current excluded, deduped
 *   - Past Roles     = past titles, current excluded, deduped
 *
 * Conservative — only writes if the cell is currently blank, so
 * Joe's manual entries always win.
 */
function fillPastEmploymentFromApollo() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APOLLO_API_KEY')) {
    SpreadsheetApp.getUi().alert(
      'APOLLO_API_KEY missing. Add it in Project Settings → Script Properties first.'
    );
    return;
  }
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Past Companies'] && !colOf['Past Roles']) {
    SpreadsheetApp.getUi().alert(
      'Neither "Past Companies" nor "Past Roles" column found. Add at least one to the Speaking Directory tab.'
    );
    return;
  }
  const lastRow = sheet.getLastRow();
  let companiesFilled = 0, rolesFilled = 0, noSignal = 0, hadValue = 0;
  for (let r = 2; r <= lastRow; r++) {
    const result = fillPastEmploymentForRow_(sheet, colOf, r);
    if (result.companies === 'set') companiesFilled++;
    if (result.roles === 'set') rolesFilled++;
    if (result.companies === 'skipped-had' || result.roles === 'skipped-had') hadValue++;
    if (result.companies === 'no-signal' && result.roles === 'no-signal') noSignal++;
    Utilities.sleep(400);
  }
  SpreadsheetApp.getUi().alert(
    'Apollo employment fill complete.\n' +
    '  Past Companies filled: ' + companiesFilled + '\n' +
    '  Past Roles filled:     ' + rolesFilled + '\n' +
    '  Already had values:    ' + hadValue + '\n' +
    '  No signal from Apollo: ' + noSignal
  );
}

function fillPastEmploymentForRow_(sheet, colOf, row) {
  const result = { companies: 'skip', roles: 'skip' };
  if (!colOf['Name']) return result;
  const name = String(sheet.getRange(row, colOf['Name']).getValue() || '').trim();
  if (!name) return result;

  const linkedIn = colOf['LinkedIn URL']
    ? String(sheet.getRange(row, colOf['LinkedIn URL']).getValue() || '').trim() : '';
  const email    = colOf['Email']
    ? String(sheet.getRange(row, colOf['Email']).getValue() || '').trim() : '';

  // Companies cell
  if (colOf['Past Companies']) {
    const cell = sheet.getRange(row, colOf['Past Companies']);
    const existing = String(cell.getValue() || '').trim();
    if (existing) {
      result.companies = 'skipped-had';
    } else {
      const apollo = lookupApollo_(name, linkedIn, email);
      const list = extractPastEmployers_(apollo);
      if (list.length > 0) {
        cell.setValue(list.join('; '));
        result.companies = 'set';
      } else {
        result.companies = 'no-signal';
      }
    }
  }

  // Roles cell — needs its own Apollo call only if companies cell was
  // skipped (had-existing). Otherwise reuse the same lookup via cache
  // since lookupApollo_ already memoizes on name+linkedin+email per
  // execution? No, it doesn't. So we look up once and use for both.
  if (colOf['Past Roles']) {
    const cell = sheet.getRange(row, colOf['Past Roles']);
    const existing = String(cell.getValue() || '').trim();
    if (existing) {
      result.roles = 'skipped-had';
    } else {
      // If we already looked up Apollo for companies, no extra request
      // — Apollo people-match has no caching here, but the second call
      // just costs a duplicate lookup. Cheap acceptable cost.
      const apollo = lookupApollo_(name, linkedIn, email);
      const list = extractPastRoles_(apollo);
      if (list.length > 0) {
        cell.setValue(list.join('; '));
        result.roles = 'set';
      } else {
        result.roles = 'no-signal';
      }
    }
  }

  return result;
}

function extractPastEmployers_(apollo) {
  if (!apollo || !apollo.employment_history) return [];
  const out = [];
  const seen = {};
  // employment_history is most-recent-first per Apollo's contract.
  // Skip the entry flagged `current` since the current employer is
  // already represented in apollo.organization. Skip dupes.
  for (let i = 0; i < apollo.employment_history.length; i++) {
    const e = apollo.employment_history[i];
    if (!e || e.current) continue;
    const org = trimOrEmpty_(e.organization_name);
    if (!org) continue;
    const k = org.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(org);
    if (out.length >= 8) break; // sane cap, oldest dropped
  }
  return out;
}

function extractPastRoles_(apollo) {
  if (!apollo || !apollo.employment_history) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < apollo.employment_history.length; i++) {
    const e = apollo.employment_history[i];
    if (!e || e.current) continue;
    const title = cleanHeadline_(trimOrEmpty_(e.title));
    if (!title) continue;
    const k = title.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(title);
    if (out.length >= 8) break;
  }
  return out;
}

function fillMissingCoords() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Location']) throw new Error('"Location" column not found.');
  if (!colOf['Lat'] || !colOf['Lng']) throw new Error('"Lat" / "Lng" columns not found.');
  const lastRow = sheet.getLastRow();
  let filled = 0, hadCoords = 0, noLoc = 0, missed = 0;
  for (let r = 2; r <= lastRow; r++) {
    const location = String(sheet.getRange(r, colOf['Location']).getValue() || '').trim();
    if (!location) { noLoc++; continue; }
    const hasLat = String(sheet.getRange(r, colOf['Lat']).getValue() || '').trim() !== '';
    const hasLng = String(sheet.getRange(r, colOf['Lng']).getValue() || '').trim() !== '';
    if (hasLat && hasLng) { hadCoords++; continue; }
    if (fillCoordsForRow_(sheet, colOf, r, location)) filled++; else missed++;
    Utilities.sleep(150);
  }
  SpreadsheetApp.getUi().alert(
    'Geocoding done.\n' +
    '  Filled coords:        ' + filled + '\n' +
    '  Already had coords:   ' + hadCoords + '\n' +
    '  No location set:      ' + noLoc + '\n' +
    (missed ? '  Could not geocode:    ' + missed : '')
  );
}

function fillCoordsForRow_(sheet, colOf, row, location) {
  if (!location || !colOf['Lat'] || !colOf['Lng']) return false;
  const hasLat = String(sheet.getRange(row, colOf['Lat']).getValue() || '').trim() !== '';
  const hasLng = String(sheet.getRange(row, colOf['Lng']).getValue() || '').trim() !== '';
  if (hasLat && hasLng) return false;
  const coords = geocode_(location);
  if (!coords) return false;
  sheet.getRange(row, colOf['Lat']).setValue(coords.lat);
  sheet.getRange(row, colOf['Lng']).setValue(coords.lng);
  return true;
}

function geocode_(location) {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'geo:' + location.toLowerCase();
    const cached = cache.get(key);
    if (cached) return JSON.parse(cached);
    const result = Maps.newGeocoder().geocode(location);
    if (result && result.results && result.results.length > 0) {
      const loc = result.results[0].geometry.location;
      const out = { lat: loc.lat, lng: loc.lng };
      cache.put(key, JSON.stringify(out), 21600);
      return out;
    }
  } catch (err) {
    console.log('Geocode error for "' + location + '": ' + err);
  }
  return null;
}

/* -- region from coords -- */

function fillRegionFromCoords() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Region']) throw new Error('"Region" column not found.');
  const lastRow = sheet.getLastRow();
  let filled = 0, fixed = 0, ok = 0, skipped = 0;
  for (let r = 2; r <= lastRow; r++) {
    const before = String(sheet.getRange(r, colOf['Region']).getValue() || '').trim();
    const result = fillRegionForRow_(sheet, colOf, r);
    if (result === 'set')        filled++;
    else if (result === 'fixed') fixed++;
    else if (result === 'ok')    ok++;
    else                         skipped++;
  }
  SpreadsheetApp.getUi().alert(
    'Region update done.\n' +
    '  Newly filled:   ' + filled + '\n' +
    '  Corrected:      ' + fixed + '\n' +
    '  Already correct: ' + ok + '\n' +
    '  No coords:      ' + skipped
  );
}

/**
 * Returns 'set' (was empty, wrote), 'fixed' (overwrote a wrong value),
 * 'ok' (already matches coords), or 'skipped' (no usable coords).
 */
function fillRegionForRow_(sheet, colOf, row) {
  if (!colOf['Region'] || !colOf['Lat'] || !colOf['Lng']) return 'skipped';
  const lat = parseFloat(sheet.getRange(row, colOf['Lat']).getValue());
  const lng = parseFloat(sheet.getRange(row, colOf['Lng']).getValue());
  const region = regionFromCoords_(lat, lng);
  if (!region) return 'skipped';
  const cell = sheet.getRange(row, colOf['Region']);
  const existing = String(cell.getValue() || '').trim();
  if (!existing) { cell.setValue(region); return 'set'; }
  if (existing === region) return 'ok';
  cell.setValue(region);
  return 'fixed';
}

/**
 * Bounding-box region classifier. Mirrors src/lib/region-from-coords.ts in
 * the app exactly, so the sheet's "Region" column matches what the app
 * derives from the same lat/lng.
 */
function regionFromCoords_(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (lng <= -30 && lat >= -56 && lat <= 73) return 'Americas';
  if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 65) return 'Middle East & Africa';
  if (lat >= 36 && lat <= 72 && lng >= -25 && lng <= 60) return 'Europe';
  if (lng > 60 || lat < -10) return 'Asia-Pacific';
  return null;
}

/* ============================================================ */
/* INDUSTRY PARSER                                              */
/* ============================================================ */

/**
 * Industry keyword dictionary. Mirrors src/lib/industry-parser.ts in the
 * app — bio-mentions of named companies + generic industry keywords are
 * BOTH unioned, so a person whose bio says "Senior Innovation Specialist
 * at Amazon Web Services" gets the Cloud + Technology tags even though
 * the bio never literally writes "cloud architecture".
 *
 * Keep this list in sync with the app's parser — both sources of truth
 * should agree on what fires what.
 */
const INDUSTRY_PATTERNS_ = [
  ['Healthcare',                [/\bhealth\s*care\b/i, /\bhealthcare\b/i, /\bmedical\b/i, /\bbiotech\b/i, /\bhospitals?\b/i, /\bclinical\b/i, /\bpatient(s)?\b/i, /\blife\s+sciences?\b/i, /\bdigital\s+health\b/i, /\bhealth[\s-]tech\b/i]],
  ['Pharma',                    [/\bpharma(ceutical)?s?\b/i, /\bdrug\s+(discovery|development)\b/i, /\btherapeutics?\b/i]],
  ['Financial Services',        [/\bfintech\b/i, /\bbanking\b/i, /\bbank(s)?\b/i, /\bfinancial\s+services\b/i, /\bcapital\s+markets\b/i, /\bwealth\s+management\b/i, /\binvestment\s+banking\b/i, /\btrading\b/i, /\bcredit\b/i, /\bpayments?\b/i, /\bhedge\s+funds?\b/i, /\basset\s+management\b/i, /\bprivate\s+equity\b/i]],
  ['Insurance',                 [/\binsurance\b/i, /\binsurer(s)?\b/i, /\bre[\s-]?insurance\b/i]],
  ['Technology',                [/\btech\s+industry\b/i, /\btech\s+(companies|company|sector|firms?)\b/i, /\bsoftware\s+(industry|companies|company)\b/i, /\bsilicon\s+valley\b/i, /\btech\s+startups?\b/i]],
  ['SaaS',                      [/\bsaas\b/i, /\bsoftware[\s-]as[\s-]a[\s-]service\b/i, /\bb2b\s+software\b/i]],
  ['Retail',                    [/\bretail\b/i, /\bretailer(s)?\b/i, /\bd2c\b/i]],
  ['E-commerce',                [/\be[\s-]?commerce\b/i, /\bonline\s+retail\b/i, /\bdtc\b/i, /\bmarketplaces?\b/i]],
  ['Consumer Goods',            [/\bconsumer\s+goods\b/i, /\bcpg\b/i, /\bfmcg\b/i, /\bbeverages?\b/i]],
  ['Manufacturing',             [/\bmanufactur(ing|ers?)\b/i, /\bindustrial\b/i, /\bfactor(y|ies)\b/i, /\bsupply\s+chain\b/i]],
  ['Automotive',                [/\bautomotive\b/i, /\bauto\s+industry\b/i, /\bvehicle(s)?\b/i, /\bcar\s+(industry|companies)\b/i, /\bmobility\s+(sector|companies)\b/i]],
  ['Energy',                    [/\benergy\s+(sector|industry|companies|company)\b/i, /\boil\s*(\&|and)\s*gas\b/i, /\brenewable(s)?\b/i, /\butilit(y|ies)\b/i, /\bclean\s+energy\b/i]],
  ['Education',                 [/\beducation\b/i, /\bedtech\b/i, /\buniversit(y|ies)\b/i, /\bschools?\b/i, /\bfaculty\b/i, /\bprofessor\b/i, /\bteach(er|ing)\b/i, /\bcurriculum\b/i]],
  ['Government',                [/\bgovernment\b/i, /\bpublic\s+sector\b/i, /\bcivic\b/i, /\bpolicy\b/i, /\bgovt\b/i, /\bdepartment\s+of\s+(defense|state|education|energy|treasury)\b/i, /\bmilitary\b/i, /\bair\s+force\b/i, /\bfederal\s+agency\b/i]],
  ['Media',                     [/\bmedia\b/i, /\bpublishing\b/i, /\bentertainment\b/i, /\bbroadcast/i, /\bpodcast/i, /\bstreaming\b/i]],
  ['Marketing',                 [/\bmarketing\b/i, /\badvertising\b/i, /\bbrand(ing)?\b/i, /\bagenc(y|ies)\b/i]],
  ['Legal',                     [/\blegal\b/i, /\blaw\s+firms?\b/i, /\battorneys?\b/i, /\bcompliance\b/i]],
  ['Real Estate',               [/\breal\s+estate\b/i, /\bpropert(y|ies)\b/i, /\bproptech\b/i]],
  ['Telecom',                   [/\btelecom(munications)?\b/i, /\bmobile\s+operators?\b/i]],
  ['Logistics',                 [/\blogistics\b/i, /\bsupply\s+chain\b/i, /\bshipping\b/i, /\bfreight\b/i, /\bwarehous/i]],
  ['Travel & Hospitality',      [/\btravel\b/i, /\bhospitality\b/i, /\bairlines?\b/i, /\bhotels?\b/i, /\bcruise/i]],
  ['Non-profit',                [/\bnon[\s-]?profit(s)?\b/i, /\bngo(s)?\b/i, /\bcharit(y|ies)\b/i, /\bnonprofit/i, /\bfoundation\b/i]],
  ['Enterprise / Fortune 500',  [/\bfortune\s*500\b/i, /\bfortune\s*100\b/i, /\bfortune\s*400\b/i, /\bf500\b/i, /\benterprise\s+companies\b/i, /\blarge\s+enterprises?\b/i, /\bfortune-?(?:100|500)\b/i]],
  ['Startups',                  [/\bstartup(s)?\b/i, /\bventure\s+backed\b/i, /\bvc[\s-]backed\b/i, /\bearly[\s-]stage\b/i, /\bfounder\b/i, /\bco[\s-]?founder\b/i]],
  ['Cloud',                     [/\bcloud\s+(architecture|computing|infrastructure|providers?|platforms?)\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i, /\bgoogle\s+cloud\b/i]]
];

/**
 * Curated company → industries map. Same shape as the app's
 * KNOWN_COMPANIES — kept in sync intentionally so a bio mention of
 * "Pfizer" produces Pharma whether the app or the script reads it.
 */
const KNOWN_COMPANIES_ = {
  // Tech / Cloud
  'Google': ['Technology', 'Cloud'],
  'Microsoft': ['Technology', 'Cloud'],
  'Microsoft Azure': ['Cloud'],
  'Azure': ['Cloud'],
  'Amazon': ['Technology', 'E-commerce', 'Cloud'],
  'Amazon Web Services': ['Cloud'],
  'AWS': ['Cloud'],
  'Apple': ['Technology'],
  'Meta': ['Technology'],
  'Facebook': ['Technology'],
  'Netflix': ['Media', 'Technology'],
  'Spotify': ['Media', 'Technology'],
  'IBM': ['Technology'],
  'Intel': ['Technology'],
  'NVIDIA': ['Technology'],
  'Cisco': ['Technology'],
  'Oracle': ['Technology', 'SaaS'],
  'Salesforce': ['SaaS', 'Technology'],
  'HubSpot': ['SaaS', 'Marketing'],
  'Adobe': ['SaaS'],
  'SAP': ['SaaS'],
  'Pandora': ['Media'],
  'SiriusXM': ['Media'],
  'Slack': ['SaaS'],
  'Mural': ['SaaS'],
  'Atlassian': ['SaaS'],
  'Cadence': ['Technology'],
  'Propellernet': ['Marketing'],
  'Howspace': ['SaaS'],
  // Financial Services
  'Visa': ['Financial Services'],
  'Mastercard': ['Financial Services'],
  'American Express': ['Financial Services'],
  'Amex': ['Financial Services'],
  'JPMorgan': ['Financial Services'],
  'Goldman Sachs': ['Financial Services'],
  'Morgan Stanley': ['Financial Services'],
  'BlackRock': ['Financial Services'],
  'Bank of America': ['Financial Services'],
  'Capital One': ['Financial Services'],
  'Wells Fargo': ['Financial Services'],
  'Citibank': ['Financial Services'],
  'Citigroup': ['Financial Services'],
  'HSBC': ['Financial Services'],
  'BBVA': ['Financial Services'],
  'BNP Paribas': ['Financial Services'],
  'Arval': ['Financial Services'],
  'Lloyds Banking Group': ['Financial Services'],
  'Lloyds Bank': ['Financial Services'],
  'LendingClub': ['Financial Services'],
  'Lending Club': ['Financial Services'],
  'Stripe': ['Financial Services', 'Technology'],
  'PayPal': ['Financial Services'],
  'Ameriprise': ['Financial Services'],
  'Ameriprise Financial': ['Financial Services'],
  'DE Shaw': ['Financial Services'],
  'Tamkeen': ['Financial Services', 'Government'],
  // Insurance
  'Zurich Insurance': ['Insurance'],
  'Zurich Insurances': ['Insurance'],
  'MetLife': ['Insurance'],
  'Allianz': ['Insurance'],
  'AXA': ['Insurance'],
  'Liberty Mutual': ['Insurance'],
  'AIG': ['Insurance'],
  // Pharma / Healthcare
  'Pfizer': ['Pharma'],
  'Merck': ['Pharma'],
  'AbbVie': ['Pharma'],
  'Novartis': ['Pharma'],
  'AstraZeneca': ['Pharma'],
  'GlaxoSmithKline': ['Pharma'],
  'GSK': ['Pharma'],
  'Roche': ['Pharma'],
  'Sanofi': ['Pharma'],
  'Eli Lilly': ['Pharma'],
  'Johnson & Johnson': ['Pharma', 'Healthcare'],
  'Bayer': ['Pharma'],
  'Bristol-Myers': ['Pharma'],
  'Bristol-Myers Squibb': ['Pharma'],
  'Allina Health': ['Healthcare'],
  'UnitedHealth': ['Healthcare'],
  'Anthem': ['Healthcare'],
  'Cigna': ['Healthcare'],
  'Walgreens': ['Healthcare', 'Retail'],
  'CVS': ['Healthcare', 'Retail'],
  // Retail / CPG
  'Walmart': ['Retail'],
  'Target': ['Retail'],
  'Costco': ['Retail'],
  'Best Buy': ['Retail'],
  'Etsy': ['E-commerce', 'Retail'],
  'Nike': ['Retail', 'Consumer Goods'],
  'Adidas': ['Retail', 'Consumer Goods'],
  'Under Armour': ['Retail', 'Consumer Goods'],
  'Chanel': ['Retail', 'Consumer Goods'],
  'IKEA': ['Retail', 'Consumer Goods'],
  'Nestlé': ['Consumer Goods'],
  'Nestle': ['Consumer Goods'],
  'P&G': ['Consumer Goods'],
  'Procter & Gamble': ['Consumer Goods'],
  'Unilever': ['Consumer Goods'],
  'Coca-Cola': ['Consumer Goods'],
  'PepsiCo': ['Consumer Goods'],
  'Pepsi': ['Consumer Goods'],
  // Consulting / Pro Services
  'McKinsey': ['Enterprise / Fortune 500'],
  'BCG': ['Enterprise / Fortune 500'],
  'Boston Consulting Group': ['Enterprise / Fortune 500'],
  'Bain': ['Enterprise / Fortune 500'],
  'Deloitte': ['Enterprise / Fortune 500'],
  'Deloitte Greenhouse': ['Enterprise / Fortune 500'],
  'Accenture': ['Enterprise / Fortune 500', 'Technology'],
  'KPMG': ['Enterprise / Fortune 500'],
  'PwC': ['Enterprise / Fortune 500'],
  'EY': ['Enterprise / Fortune 500'],
  'Ernst & Young': ['Enterprise / Fortune 500'],
  'Heidrick & Struggles': ['Enterprise / Fortune 500'],
  'businessfourzero': ['Enterprise / Fortune 500'],
  'IDEO': ['Education'],
  'Cap Gemini': ['Enterprise / Fortune 500', 'Technology'],
  'Capgemini': ['Enterprise / Fortune 500', 'Technology'],
  'Kearney': ['Enterprise / Fortune 500'],
  'Point B': ['Enterprise / Fortune 500'],
  'BanyanGlobal': ['Financial Services'],
  'The Oxford Group': ['Education'],
  // Automotive
  'Tesla': ['Automotive'],
  'Ford': ['Automotive'],
  'GM': ['Automotive'],
  'General Motors': ['Automotive'],
  'Toyota': ['Automotive'],
  'BMW': ['Automotive'],
  'Honda': ['Automotive'],
  'Nissan': ['Automotive'],
  // Travel / Hospitality
  'Marriott': ['Travel & Hospitality'],
  'Hilton': ['Travel & Hospitality'],
  'Airbnb': ['Travel & Hospitality'],
  'Delta': ['Travel & Hospitality'],
  'United Airlines': ['Travel & Hospitality'],
  'American Airlines': ['Travel & Hospitality'],
  // Energy
  'Shell': ['Energy'],
  'BP': ['Energy'],
  'ExxonMobil': ['Energy'],
  'Chevron': ['Energy'],
  'Saudi Aramco': ['Energy'],
  // Education / Academic
  'Harvard': ['Education'],
  'Harvard Kennedy School': ['Education'],
  'Harvard Business School': ['Education'],
  'MIT': ['Education'],
  'MIT xPRO': ['Education'],
  'Stanford': ['Education'],
  'Berkeley': ['Education'],
  'Berkeley SkyDeck': ['Education', 'Startups'],
  'Northwestern Kellogg': ['Education'],
  'Northwestern': ['Education'],
  'Imperial College': ['Education'],
  'Imperial College Business School': ['Education'],
  'Kellogg': ['Education'],
  'James Madison University': ['Education'],
  // Non-profit / Government
  'Rockefeller Foundation': ['Non-profit'],
  'Robin Hood Foundation': ['Non-profit'],
  'Bill & Melinda Gates Foundation': ['Non-profit'],
  'AARP': ['Non-profit'],
  'United Nations': ['Non-profit', 'Government'],
  'NASA': ['Government'],
  'Department of Defense': ['Government'],
  'Department of State': ['Government'],
  'US Air Force': ['Government'],
  'Air Force': ['Government'],
  'Veterans Affairs': ['Government'],
  'NYC Department of Education': ['Government', 'Education'],
  // Media
  'Disney': ['Media'],
  'NBC': ['Media'],
  'BBC': ['Media'],
  'Kantar': ['Marketing'],
  'Ogilvy': ['Marketing'],
  'TED': ['Media', 'Non-profit'],
  'Tough Mudder': ['Media', 'Travel & Hospitality'],
  // Telecom
  'AT&T': ['Telecom'],
  'Verizon': ['Telecom'],
  'T-Mobile': ['Telecom'],
};

// Compile a single regex matching ANY known company name. Sorted longest-
// first so "Amazon Web Services" beats "Amazon". Special chars escaped so
// "P&G" / "AT&T" don't break the regex.
const _companyOrder_ = Object.keys(KNOWN_COMPANIES_).sort(function (a, b) {
  return b.length - a.length;
});
const _companyMatcher_ = (function () {
  const escaped = _companyOrder_.map(function (s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp('\\b(?:' + escaped.join('|') + ')(?=\\b|[^A-Za-z0-9])', 'gi');
})();

/**
 * Parse industries from any free text. Combines:
 *   - INDUSTRY_PATTERNS_ keyword regex hits ("fintech", "fortune 500", etc.)
 *   - KNOWN_COMPANIES_ name mentions (Visa → Financial Services, AWS → Cloud)
 */
function parseIndustriesFromText_(text) {
  if (!text) return [];
  const found = {};

  // Generic keyword pass.
  for (let i = 0; i < INDUSTRY_PATTERNS_.length; i++) {
    const [name, regs] = INDUSTRY_PATTERNS_[i];
    for (let j = 0; j < regs.length; j++) {
      if (regs[j].test(text)) { found[name] = true; break; }
    }
  }

  // Company-mention pass — every named employer/client implies a set of
  // industries. This is what catches AWS-mention → Cloud and Pfizer-mention
  // → Pharma even when the bio doesn't use those exact industry words.
  _companyMatcher_.lastIndex = 0;
  let m;
  while ((m = _companyMatcher_.exec(text)) !== null) {
    const matched = m[0];
    let canonical = null;
    for (let i = 0; i < _companyOrder_.length; i++) {
      if (_companyOrder_[i].toLowerCase() === matched.toLowerCase()) {
        canonical = _companyOrder_[i]; break;
      }
    }
    if (!canonical) continue;
    const inds = KNOWN_COMPANIES_[canonical] || [];
    for (let k = 0; k < inds.length; k++) found[inds[k]] = true;
  }

  return Object.keys(found);
}

function fillIndustriesFromBio() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) throw new Error('"' + SPEAKING_DIRECTORY_SHEET + '" sheet not found.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Industry Experience']) throw new Error('"Industry Experience" column not found.');
  if (!colOf['Bio']) throw new Error('"Bio" column not found.');
  const lastRow = sheet.getLastRow();
  let updated = 0, ok = 0;
  for (let r = 2; r <= lastRow; r++) {
    const bio = String(sheet.getRange(r, colOf['Bio']).getValue() || '').trim();
    if (!bio) continue;
    if (fillIndustriesForRow_(sheet, colOf, r, bio, '')) updated++; else ok++;
  }
  SpreadsheetApp.getUi().alert(
    'Industries filled.\n' +
    '  Updated rows:   ' + updated + '\n' +
    '  Already current: ' + ok
  );
}

/**
 * Merges existing industries (preserved) with newly-detected ones from the
 * bio + apolloHeadline. Returns true if the cell value changed.
 */
function fillIndustriesForRow_(sheet, colOf, row, bio, apolloHeadline) {
  if (!colOf['Industry Experience']) return false;
  const cell = sheet.getRange(row, colOf['Industry Experience']);
  const existingRaw = String(cell.getValue() || '').trim();
  const existing = existingRaw ? existingRaw.split(/\s*[;,|]\s*/).filter(Boolean) : [];
  const existingLower = {};
  existing.forEach(e => { existingLower[e.toLowerCase()] = true; });

  const detected = parseIndustriesFromText_([bio, apolloHeadline].filter(Boolean).join(' '));
  const merged = existing.slice();
  for (let i = 0; i < detected.length; i++) {
    if (!existingLower[detected[i].toLowerCase()]) merged.push(detected[i]);
  }
  if (merged.length === existing.length) return false;
  cell.setValue(merged.join('; '));
  return true;
}

/* ============================================================ */
/* SMALL UTILS                                                  */
/* ============================================================ */

function trimOrEmpty_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function indefiniteArticle_(word) {
  if (!word) return 'a';
  return ['a','e','i','o','u'].indexOf(word[0].toLowerCase()) !== -1 ? 'an' : 'a';
}

/**
 * Build a {header → 1-indexed column} map. First occurrence wins so
 * duplicate headers (e.g. two "Email" columns in the live sheet) don't
 * silently swap which value the script reads.
 */
function headerMap_(headers) {
  const colOf = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h && colOf[h] === undefined) colOf[h] = i + 1;
  }
  return colOf;
}

/**
 * Normalize a name for display:
 *   - "jill kiemele"  → "Jill Kiemele"
 *   - "JOHN SMITH"    → "John Smith"
 *   - "Hannah Feldberg-Dubin" stays as-is
 *   - "Anja Novković" stays as-is (Unicode safe)
 * Already-mixed-case names are left alone — we only touch all-lower or
 * all-upper inputs.
 */
function canonicalName_(name) {
  if (!name) return name;
  const t = name.trim();
  const allLower = t === t.toLowerCase() && /[a-z]/.test(t);
  const allUpper = t === t.toUpperCase() && /[A-Z]/.test(t);
  if (!allLower && !allUpper) return t;
  return t.toLowerCase().replace(/(^|\s|-|')([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function cleanProseText_(s) {
  if (!s) return '';
  return String(s)
    .replace(/\|\s*[-:]{2,}\s*\|/g, ' ')
    .replace(/(\s*\|\s*){3,}/g, ' ')
    .replace(/^[\s>*\-+]+/gm, '')
    .replace(/^\s*={3,}\s*$/gm, '')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function smartTitleCase_(s) {
  if (!s) return s;
  return s.replace(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})+)\b/g, (m) =>
    m.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
  );
}

function cleanHeadline_(s) {
  if (!s) return s;
  return smartTitleCase_(
    String(s)
      .replace(/[*_`~]+/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}‍️]/gu, '')
      .replace(/\s*\|\s*/g, ' — ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Remove mentions of Bachelor's / Master's / MBA / MS / MA / certificate /
 * "graduated from X" / "studied at X" — anything below a PhD. PhD,
 * doctorate, DPhil, MD, JD references are kept (terminal degrees).
 *
 * Two-phase strategy:
 *   1. Drop entire sentences whose primary content is an academic
 *      credential below PhD ("She holds a Bachelor's in X from Y").
 *   2. Within surviving sentences, surgically excise inline credential
 *      clauses (", along with a certificate in X", "and earned an MBA
 *      from Y, ...").
 *
 * This runs after Haiku composes the bio, so even when the model
 * ignores the prompt rule and slips a degree in, it gets stripped.
 */
function stripSubPhDDegrees_(bio) {
  if (!bio) return bio;

  // Tokens that signal a sub-PhD academic credential. The order matters —
  // multi-word phrases first so "Master's degree" doesn't match the
  // shorter "Master's".
  const subPhdRe =
    /(?:double major|undergraduate degree|graduate degree|bachelor['’]?s?(?:\s+degree)?|master['’]?s?(?:\s+degree)?|\bMBA\b|\bEMBA\b|\bMA\b|\bMS\b|\bMPA\b|\bMPH\b|\bMFA\b|\bMEng\b|\bMArch\b|\bMEd\b|\bLLM\b|\bM\.?Sc\b|\bM\.?A\b|\bM\.?S\b|\bBA\b|\bBS\b|\bBSc\b|\bB\.?A\b|\bB\.?S\b|\bB\.?Sc\b|\bcertificate(?:s)?\s+in\b|\bdiploma\b|\bcoursework\b)/i;

  // We never want to strip a sentence that mentions a PhD/doctorate —
  // those are kept verbatim. (We also keep MD/JD as terminal degrees.)
  const phdRe = /\b(PhD|Ph\.D\.?|D\.Phil\.?|DPhil|doctorate|doctoral|MD\b|J\.?D\.?)\b/i;

  // Phrase-level excision patterns we apply to every sentence:
  // ", along with a certificate in X" / ", along with an MBA from Y"
  // " and earned an MBA from Y"
  // " holds a Bachelor's in X from Y" (when there's no PhD)
  // "graduated from X University with a [degree]"
  // "studied [field] at X"
  const inlineExcisions = [
    /,\s*along with (?:a|an|her|his|their)\s+(?:double major|certificate|diploma|bachelor['’]?s?|master['’]?s?|MBA|MA|MS|BA|BS)[^,.;]*?(?=[,.;]|$)/gi,
    /\s+and\s+(?:earned|holds|completed|received|obtained)\s+(?:a|an|her|his|their)\s+(?:bachelor['’]?s?|master['’]?s?|MBA|EMBA|MA|MS|MPA|MPH|MFA|MEng|MArch|MEd|LLM|BA|BS|BSc|certificate|diploma|double major)[^,.;]*?(?=[,.;]|$)/gi,
    /\s+(?:She|He|They)\s+(?:holds|earned|completed|received|obtained|graduated\s+with)\s+(?:a|an)\s+(?:bachelor['’]?s?|master['’]?s?|MBA|EMBA|MA|MS|MPA|MPH|MFA|MEng|MArch|MEd|LLM|BA|BS|BSc|certificate|diploma|double major)[^.]*?\./gi,
    /\s+(?:graduated|graduating)\s+from\s+[^.]*?(?:university|college|school|institute)[^.]*?\./gi,
    /\s+studied\s+(?:at|[A-Z][^.]*?)\s+(?:at\s+)?[A-Z][^.]*?\./gi
  ];

  // Phase 1 — drop whole sentences that are primarily about a sub-PhD
  // credential. Splitter keeps trailing punctuation.
  const sentences = bio.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [bio];
  const kept = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (subPhdRe.test(s) && !phdRe.test(s)) {
      // Whole-sentence drop — count how much of the sentence is degree
      // chatter. If most of it is the credential ("She holds a Bachelor's
      // ... brings cross-industry experience..."), excise the degree
      // clause and keep the rest.
      const trimmed = s.trim();
      // If the sentence STARTS with "She/He holds/earned + degree", drop the whole sentence.
      const subjMatch = trimmed.match(/^\s*(She|He|They)\s+(?:holds|earned|completed|received|obtained|graduated)\s+(?:a|an)\s+(?:bachelor['’]?s?|master['’]?s?|MBA|EMBA|MA|MS|MPA|MPH|MFA|MEng|MArch|MEd|LLM|BA|BS|BSc|certificate|diploma|double major)\b/i);
      if (subjMatch) {
        // Whole-sentence drop, but recover the trailing work clause if
        // there is one ("..., and brings cross-industry experience..."
        // → "She brings cross-industry experience..."). Reuse the same
        // subject pronoun so we don't have to guess gender.
        const subject = subjMatch[1];
        const tail = trimmed.match(/,\s*and\s+((?:brings|leads|advises|works|specializes|consults|teaches|previously\s+\w+)[^.!?]+[.!?]?)$/i);
        if (tail) {
          let recovered = tail[1].trim();
          if (!/[.!?]$/.test(recovered)) recovered += '.';
          kept.push(`${subject} ${recovered}`);
        }
        continue;
      }
      kept.push(s);
    } else {
      kept.push(s);
    }
  }
  let out = kept.join(' ');

  // Phase 2 — inline excisions within surviving sentences.
  for (let i = 0; i < inlineExcisions.length; i++) {
    out = out.replace(inlineExcisions[i], '');
  }

  // Tidy up double commas, spacing, dangling ", ." artifacts left by
  // excisions.
  out = out
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  return out;
}

/* ============================================================ */
/* AVAILABILITY WEB-APP HANDLER                                 */
/* ============================================================ */

/**
 * Web-app entry point — receives JSON POSTs from the public
 * /availability page (proxied through Vercel) and appends a row to the
 * Availability tab.
 *
 * To enable this:
 *   1. In Apps Script, click Deploy → New deployment → Web app
 *   2. "Execute as": Me. "Who has access": Anyone.
 *   3. Copy the resulting /exec URL into Vercel env as
 *      APPS_SCRIPT_AVAILABILITY_URL.
 *   4. (Optional) Set a shared secret in Project Settings → Script
 *      Properties as AVAILABILITY_TOKEN, and the same value in Vercel
 *      env as APPS_SCRIPT_AVAILABILITY_TOKEN. The proxy forwards it as
 *      `token` and this handler rejects requests that don't match.
 *
 * Run setupAvailabilitySheet() once from the editor to create the
 * Availability tab with the right headers, or just let doPost create it
 * on first submission.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ error: 'No payload' }, 400);
    }
    const payload = JSON.parse(e.postData.contents);

    // Optional shared-secret check
    const expected = PropertiesService.getScriptProperties().getProperty('AVAILABILITY_TOKEN');
    if (expected && payload.token !== expected) {
      return jsonResponse_({ error: 'Unauthorized' }, 401);
    }

    // Dispatch by kind. The default (no kind / kind=availability) keeps
    // the existing facilitator-form flow intact. kind=edit handles the
    // /edit chatbot's structured actions.
    if (payload.kind === 'edit') {
      return jsonResponse_(applyEdit_(payload.edit || {}), 200);
    }

    const sheet = ensureAvailabilitySheet_();
    const blocked = (payload.blockedRanges || [])
      .filter(r => r && r.start)
      .map(r => r.start + ':' + (r.end || r.start))
      .join('; ');

    // Quarter cell holds either a single number ("3") or a semicolon-
    // separated list ("2;3") so multi-select stays human-readable.
    let quarterCell = '';
    if (payload.mode === 'quarter') {
      if (Array.isArray(payload.quarters) && payload.quarters.length > 0) {
        quarterCell = payload.quarters
          .filter(q => q >= 1 && q <= 4)
          .sort(function (a, b) { return a - b; })
          .join('; ');
      } else if (payload.quarter) {
        quarterCell = String(payload.quarter);
      }
    }

    sheet.appendRow([
      payload.submittedAt || new Date().toISOString(),
      payload.name || '',
      payload.mode || '',
      payload.year || '',
      quarterCell,
      blocked,
      payload.willingToTravel || '',
      payload.notes || '',
    ]);
    return jsonResponse_({ ok: true }, 200);
  } catch (err) {
    return jsonResponse_({ error: String(err) }, 500);
  }
}

/** Browsers occasionally probe the URL with GET — return a small status. */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, hint: 'POST availability submissions here' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupAvailabilitySheet() {
  ensureAvailabilitySheet_();
  SpreadsheetApp.getUi().alert(
    '"Availability" tab is ready.\n\n' +
    'Now deploy this script as a Web App (Deploy → New deployment → Web app, ' +
    '"Anyone" access) and paste the /exec URL into Vercel as ' +
    'APPS_SCRIPT_AVAILABILITY_URL.'
  );
}

function ensureAvailabilitySheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(AVAILABILITY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AVAILABILITY_SHEET);
    sheet.appendRow(AVAILABILITY_HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(AVAILABILITY_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ============================================================ */
/* EDIT DISPATCHER                                              */
/* ============================================================ */

/**
 * Apply one structured edit from the /edit chatbot. Always returns
 * { ok, message } so the UI can show the result.
 *
 * Lookup is case-insensitive on names. For engagements we match on
 * either the Engagement column or the Client column. Fuzzy matching
 * is intentionally minimal — if the chatbot's engagement string
 * doesn't match anything, we return ok=false rather than picking the
 * wrong row.
 */
function applyEdit_(edit) {
  if (!edit || !edit.kind) return { ok: false, message: 'Missing edit.kind' };
  try {
    switch (edit.kind) {
      case 'add_engagement':
        return applyAddEngagement_(edit);
      case 'add_facilitator_to_engagement':
        return applyAddFacilitatorToEngagement_(edit);
      case 'update_engagement_status':
        return applyUpdateEngagementStatus_(edit);
      case 'add_facilitator_note':
        return applyAddFacilitatorNote_(edit);
      case 'update_facilitator_field':
        return applyUpdateFacilitatorField_(edit);
      default:
        return { ok: false, message: 'Unknown edit kind: ' + edit.kind };
    }
  } catch (err) {
    return { ok: false, message: 'Edit failed: ' + err };
  }
}

function getEngagementsSheet_() {
  // Live sheet the engagements page reads is whatever's pointed at by
  // GOOGLE_ENGAGEMENTS_CSV_URL. The script writes by sheet name, so
  // try a few common names.
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName('Ongoing Engagements')
    || ss.getSheetByName('Engagements')
    || ss.getSheetByName('Engagement History')
    || null;
}

function applyAddEngagement_(edit) {
  const sheet = getEngagementsSheet_();
  if (!sheet) return { ok: false, message: 'Engagements sheet not found.' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);

  // Build a row that fills any of the columns the live sheet has.
  const row = headers.map((h) => {
    if (!h) return '';
    const lh = String(h).toLowerCase().trim();
    if (lh === 'engagement' || lh === 'name' || lh === 'engagement name' || lh === 'workshop') return edit.name || '';
    if (lh === 'client' || lh === 'organization' || lh === 'org' || lh === 'company') return edit.client || edit.name || '';
    if (lh === 'status' || lh === 'stage') return edit.status || 'Upcoming';
    if (lh === 'location' || lh === 'where' || lh === 'venue') return edit.location || '';
    if (lh === 'city') {
      const parts = (edit.location || '').split(',').map(function (s) { return s.trim(); });
      return parts[0] || '';
    }
    if (lh === 'country') {
      const parts = (edit.location || '').split(',').map(function (s) { return s.trim(); });
      return parts.length > 1 ? parts[parts.length - 1] : '';
    }
    if (lh === 'start date' || lh === 'date' || lh === 'start' || lh === 'from') return edit.startDate || '';
    if (lh === 'end date' || lh === 'end' || lh === 'to' || lh === 'through') return edit.endDate || '';
    if (lh === 'type' || lh === 'engagement type' || lh === 'format' || lh === 'focus') return edit.type || '';
    if (lh === 'facilitators' || lh === 'facilitator' || lh === 'facilitator(s)' || lh === 'team' || lh === 'speaker' || lh === 'speakers') {
      return Array.isArray(edit.facilitators) ? edit.facilitators.join('; ') : '';
    }
    if (lh === 'notes' || lh === 'internal notes' || lh === 'notes/comments') return edit.notes || '';
    return '';
  });
  sheet.appendRow(row);
  return {
    ok: true,
    message:
      'Added engagement "' + (edit.name || '') + '"' +
      (edit.client && edit.client !== edit.name ? ' for ' + edit.client : '') + '.',
  };
}

function findEngagementRow_(sheet, query) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  const nameCol = colOf['Engagement'] || colOf['Engagement Name'] || colOf['Workshop'] || colOf['Name'] || 1;
  const clientCol = colOf['Client'] || colOf['Organization'] || colOf['Org'] || colOf['Company'] || nameCol;
  const lastRow = sheet.getLastRow();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  for (let r = 2; r <= lastRow; r++) {
    const name = String(sheet.getRange(r, nameCol).getValue() || '').toLowerCase().trim();
    const client = String(sheet.getRange(r, clientCol).getValue() || '').toLowerCase().trim();
    if (name === q || client === q || (name && q.indexOf(name) !== -1) || (client && q.indexOf(client) !== -1)) {
      return { row: r, headers: headers, colOf: colOf };
    }
  }
  return null;
}

function applyAddFacilitatorToEngagement_(edit) {
  const sheet = getEngagementsSheet_();
  if (!sheet) return { ok: false, message: 'Engagements sheet not found.' };
  const found = findEngagementRow_(sheet, edit.engagement);
  if (!found) {
    return { ok: false, message: 'No engagement matched "' + (edit.engagement || '') + '".' };
  }
  const facCol =
    found.colOf['Facilitators'] || found.colOf['Facilitator'] ||
    found.colOf['Facilitator(s)'] || found.colOf['Team'] ||
    found.colOf['Speaker'] || found.colOf['Speakers'];
  if (!facCol) return { ok: false, message: 'Engagements sheet has no Facilitators column.' };

  const cell = sheet.getRange(found.row, facCol);
  const existing = String(cell.getValue() || '').trim();
  const list = existing ? existing.split(/\s*[;,|]\s*/).filter(Boolean) : [];
  const target = String(edit.facilitator || '').trim();
  if (!target) return { ok: false, message: 'No facilitator name provided.' };
  if (list.some(function (n) { return n.toLowerCase() === target.toLowerCase(); })) {
    return { ok: true, message: target + ' is already on this engagement.' };
  }
  list.push(target);
  cell.setValue(list.join('; '));
  return { ok: true, message: 'Added ' + target + ' to "' + (edit.engagement || '') + '".' };
}

function applyUpdateEngagementStatus_(edit) {
  const sheet = getEngagementsSheet_();
  if (!sheet) return { ok: false, message: 'Engagements sheet not found.' };
  const found = findEngagementRow_(sheet, edit.engagement);
  if (!found) {
    return { ok: false, message: 'No engagement matched "' + (edit.engagement || '') + '".' };
  }
  const statusCol = found.colOf['Status'] || found.colOf['Stage'];
  if (!statusCol) return { ok: false, message: 'Engagements sheet has no Status column.' };
  sheet.getRange(found.row, statusCol).setValue(edit.status || '');
  return {
    ok: true,
    message: 'Set "' + (edit.engagement || '') + '" status to ' + (edit.status || '') + '.',
  };
}

function findFacilitatorRow_(query) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SPEAKING_DIRECTORY_SHEET);
  if (!sheet) return null;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colOf = headerMap_(headers);
  if (!colOf['Name']) return null;
  const lastRow = sheet.getLastRow();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  for (let r = 2; r <= lastRow; r++) {
    const name = String(sheet.getRange(r, colOf['Name']).getValue() || '').toLowerCase().trim();
    if (!name) continue;
    if (name === q || (q.indexOf(name) !== -1) || (name.indexOf(q) !== -1)) {
      return { sheet: sheet, row: r, colOf: colOf };
    }
  }
  return null;
}

function applyAddFacilitatorNote_(edit) {
  const found = findFacilitatorRow_(edit.facilitator);
  if (!found) return { ok: false, message: 'No facilitator matched "' + (edit.facilitator || '') + '".' };
  const noteCol = found.colOf['Notes'] || found.colOf['Internal Notes'];
  if (!noteCol) return { ok: false, message: 'Speaking Directory has no Notes column.' };
  const cell = found.sheet.getRange(found.row, noteCol);
  const existing = String(cell.getValue() || '').trim();
  const stamp = new Date().toISOString().slice(0, 10);
  const newNote = '[' + stamp + '] ' + (edit.note || '').trim();
  cell.setValue(existing ? existing + '\n' + newNote : newNote);
  return { ok: true, message: 'Note appended to ' + (edit.facilitator || '') + '.' };
}

function applyUpdateFacilitatorField_(edit) {
  const found = findFacilitatorRow_(edit.facilitator);
  if (!found) return { ok: false, message: 'No facilitator matched "' + (edit.facilitator || '') + '".' };
  const field = String(edit.field || '').trim();
  const col = found.colOf[field];
  if (!col) {
    return { ok: false, message: 'No "' + field + '" column in the Speaking Directory.' };
  }
  found.sheet.getRange(found.row, col).setValue(edit.value || '');
  return {
    ok: true,
    message: 'Set ' + (edit.facilitator || '') + "'s " + field + ' to "' + (edit.value || '') + '".',
  };
}

function jsonResponse_(obj, _code) {
  // Apps Script Web Apps don't expose HTTP status — they always return
  // 200 to the caller. The proxy handles error semantics on the JSON body.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function looksLikeProse_(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 60) return false;
  if ((t.match(/\|/g) || []).length > 2) return false;
  if (/-{3,}/.test(t)) return false;
  if (t.split(/[.!?]/).length < 2) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters / t.length < 0.55) return false;
  if (/\b(login|sign\s?in|sign\s?up|skip to|toggle|cookie|menu|home page|comments? on|posted on|reply|topic|follower|badge|new here|wish list|did not receive|miro community|info-?tainment|known for his unique)\b/i.test(t)) return false;
  if (/##+\s/.test(t)) return false;
  if (/\d+\s+years?,\s+\d+/.test(t)) return false;
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) return false;
  return true;
}
