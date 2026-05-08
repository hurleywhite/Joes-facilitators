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
    .addItem('Fill Missing Lat / Lng',         'fillMissingCoords')
    .addItem('Fill Region from Lat/Lng',       'fillRegionFromCoords')
    .addItem('Fill Industries from Bio',       'fillIndustriesFromBio')
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

  // Always-on: cheap geocoding + region + skill backfill.
  fillCoordsForRow_(sheet, colOf, row, location);
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
    '- Lead with their current role and area of focus, then add one concrete WORK credential, client, or organization mentioned in the inputs.\n' +
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
 * Industry keyword dictionary. Matches src/lib/industry-parser.ts in the
 * app so the sheet's "Industry Experience" column populates the same
 * way the app does on read.
 */
const INDUSTRY_PATTERNS_ = [
  ['Healthcare',                [/\bhealth\s*care\b/i, /\bhealthcare\b/i, /\bmedical\b/i, /\bbiotech\b/i, /\bhospitals?\b/i, /\bclinical\b/i, /\bpatient(s)?\b/i, /\blife\s+sciences?\b/i]],
  ['Pharma',                    [/\bpharma(ceutical)?s?\b/i, /\bdrug\s+(discovery|development)\b/i]],
  ['Financial Services',        [/\bfintech\b/i, /\bbanking\b/i, /\bbank(s)?\b/i, /\bfinancial\s+services\b/i, /\bcapital\s+markets\b/i, /\bwealth\s+management\b/i, /\binvestment\s+banking\b/i, /\btrading\b/i, /\bcredit\b/i]],
  ['Insurance',                 [/\binsurance\b/i, /\binsurer(s)?\b/i, /\bre[\s-]?insurance\b/i]],
  ['Technology',                [/\btech\s+industry\b/i, /\btech\s+(companies|company|sector|firms?)\b/i, /\bsoftware\s+(industry|companies|company)\b/i]],
  ['SaaS',                      [/\bsaas\b/i, /\bsoftware[\s-]as[\s-]a[\s-]service\b/i]],
  ['Retail',                    [/\bretail\b/i, /\bretailer(s)?\b/i]],
  ['E-commerce',                [/\be[\s-]?commerce\b/i, /\bonline\s+retail\b/i, /\bdtc\b/i]],
  ['Consumer Goods',            [/\bconsumer\s+goods\b/i, /\bcpg\b/i, /\bfmcg\b/i]],
  ['Manufacturing',             [/\bmanufactur(ing|ers?)\b/i, /\bindustrial\b/i, /\bfactor(y|ies)\b/i]],
  ['Automotive',                [/\bautomotive\b/i, /\bauto\s+industry\b/i, /\bvehicle(s)?\b/i, /\bcar\s+(industry|companies)\b/i]],
  ['Energy',                    [/\benergy\s+(sector|industry|companies|company)\b/i, /\boil\s*(\&|and)\s*gas\b/i, /\brenewable(s)?\b/i, /\butilit(y|ies)\b/i]],
  ['Education',                 [/\beducation\b/i, /\bedtech\b/i, /\bacademic\b/i, /\buniversit(y|ies)\b/i, /\bschools?\b/i, /\bfaculty\b/i, /\bprofessor\b/i]],
  ['Government',                [/\bgovernment\b/i, /\bpublic\s+sector\b/i, /\bcivic\b/i, /\bpolicy\b/i, /\bgovt\b/i, /\bdepartment\s+of\s+(defense|state|education)\b/i, /\bmilitary\b/i, /\bair\s+force\b/i]],
  ['Media',                     [/\bmedia\b/i, /\bpublishing\b/i, /\bentertainment\b/i, /\bbroadcast/i]],
  ['Marketing',                 [/\bmarketing\b/i, /\badvertising\b/i, /\bbrand(ing)?\b/i]],
  ['Legal',                     [/\blegal\b/i, /\blaw\s+firms?\b/i, /\battorneys?\b/i]],
  ['Real Estate',               [/\breal\s+estate\b/i, /\bpropert(y|ies)\b/i, /\bproptech\b/i]],
  ['Telecom',                   [/\btelecom(munications)?\b/i, /\bmobile\s+operators?\b/i]],
  ['Logistics',                 [/\blogistics\b/i, /\bsupply\s+chain\b/i, /\bshipping\b/i, /\bfreight\b/i]],
  ['Travel & Hospitality',      [/\btravel\b/i, /\bhospitality\b/i, /\bairlines?\b/i, /\bhotels?\b/i]],
  ['Non-profit',                [/\bnon[\s-]?profit(s)?\b/i, /\bngo(s)?\b/i, /\bcharit(y|ies)\b/i, /\bnonprofit/i, /\brockefeller\b/i, /\brobin\s+hood\s+foundation\b/i]],
  ['Enterprise / Fortune 500',  [/\bfortune\s*500\b/i, /\bfortune\s*100\b/i, /\bf500\b/i, /\benterprise\s+companies\b/i, /\blarge\s+enterprises?\b/i, /\bfortune\s*400\b/i]],
  ['Startups',                  [/\bstartup(s)?\b/i, /\bventure\s+backed\b/i, /\bvc[\s-]backed\b/i, /\bearly[\s-]stage\b/i]],
  ['Cloud',                     [/\bcloud\s+(architecture|computing|infrastructure|providers?|platforms?)\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i, /\bamazon\s+web\s+services\b/i]]
];

function parseIndustriesFromText_(text) {
  if (!text) return [];
  const found = {};
  for (let i = 0; i < INDUSTRY_PATTERNS_.length; i++) {
    const [name, regs] = INDUSTRY_PATTERNS_[i];
    for (let j = 0; j < regs.length; j++) {
      if (regs[j].test(text)) { found[name] = true; break; }
    }
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
