#!/usr/bin/env node

/**
 * run-pipeline-test.js
 * 
 * End-to-end local pipeline test runner for the ECL Meeting Summary automation.
 * 
 * Simulates the full Flows 01-04 sequence using synthetic fixtures:
 *   Stage 1: Calendar Dispatch   (simulate-calendar-dispatcher.js logic)
 *   Stage 2: Queue Item Schema   (validate-sharepoint-item.js logic)
 *   Stage 3: VTT Cleaning        (clean-vtt.js logic)
 *   Stage 4: Summary Validation  (llm-validation-guidance.md schema)
 *   Stage 5: HTML Generation     (generate-html-summary.js logic)
 */

const fs = require('fs');
const path = require('path');

const { filterEligibleEvents, processCalendarDispatch } = require('./simulate-calendar-dispatcher');
const { validateSharePointItem } = require('./validate-sharepoint-item');
const { generateHtmlSummary } = require('./generate-html-summary');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test-fixtures');
const OUTPUT_DIR = path.join(ROOT, 'test-fixtures');

// ─── Colour helpers ──────────────────────────────────────────────────────────
const green  = s => `\x1b[32m${s}\x1b[0m`;
const red    = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;

// ─── Stage runner ─────────────────────────────────────────────────────────────
const results = [];
function stage(name, fn) {
  process.stdout.write(`\n  ${bold(`Stage: ${name}`)}\n`);
  try {
    const detail = fn();
    results.push({ name, passed: true, detail });
    console.log(`  ${green('✅ PASS')}${detail ? ': ' + detail : ''}`);
  } catch (err) {
    results.push({ name, passed: false, detail: err.message });
    console.log(`  ${red('❌ FAIL')}: ${err.message}`);
  }
}

// ─── VTT cleaning (inline, mirrors clean-vtt.js logic) ───────────────────────
function isMetadataLine(line) {
  const s = line.trim();
  return /^WEBVTT/i.test(s) || /^NOTE\b/i.test(s) || /^(Kind|Language)\s*:/i.test(s);
}
function isTimestamp(line) {
  return /-->|^\d{2}:\d{2}:\d{2}\.\d{3}/.test(line.trim());
}
function redactSecrets(text) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, '***REDACTED***')
    .replace(/\b[A-Za-z0-9+/=]{40,}\b/g, '***REDACTED***')
    .replace(/\b[0-9a-fA-F]{20,}\b/g, '***REDACTED***');
}
function cleanVtt(raw) {
  const lines = raw.split(/\r?\n/);
  const utterances = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\uFEFF/g, '');
    if (isMetadataLine(line) || isTimestamp(line)) continue;
    if (!line.trim()) {
      if (current) { utterances.push(current); current = null; }
      continue;
    }
    const vMatch = line.match(/^<v\s+([^>]+)>\s*(.*)$/);
    if (vMatch) {
      if (current) utterances.push(current);
      current = { speaker: vMatch[1].trim(), text: vMatch[2].trim() };
      continue;
    }
    const colonMatch = line.match(/^\s*([^:]{1,80}):\s*(.*)$/);
    if (colonMatch && !/^\d+$/.test(colonMatch[1])) {
      if (current) utterances.push(current);
      current = { speaker: colonMatch[1].trim(), text: colonMatch[2].trim() };
      continue;
    }
    if (current) {
      current.text += ' ' + line.trim();
    } else {
      current = { speaker: null, text: line.trim() };
    }
  }
  if (current) utterances.push(current);
  return utterances.map(u => redactSecrets((u.speaker ? `${u.speaker}: ` : '') + u.text));
}

// ─── LLM summary schema validation ───────────────────────────────────────────
function validateSummaryJson(summary) {
  const errors = [];
  if (typeof summary.recap !== 'string' || !summary.recap.trim()) {
    errors.push('"recap" must be a non-empty string');
  }
  if (!Array.isArray(summary.decisions)) errors.push('"decisions" must be an array');
  if (!Array.isArray(summary.action_items)) errors.push('"action_items" must be an array');
  if (!Array.isArray(summary.open_questions)) errors.push('"open_questions" must be an array');
  if (!Array.isArray(summary.warnings)) errors.push('"warnings" must be an array');

  (summary.decisions || []).forEach((d, i) => {
    if (!d.evidence) errors.push(`decisions[${i}] missing "evidence" citation`);
  });
  (summary.action_items || []).forEach((a, i) => {
    if (!a.evidence) errors.push(`action_items[${i}] missing "evidence" citation`);
    if (a.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(a.due_date)) {
      errors.push(`action_items[${i}].due_date must be YYYY-MM-DD or null`);
    }
  });
  (summary.open_questions || []).forEach((q, i) => {
    if (!q.evidence) errors.push(`open_questions[${i}] missing "evidence" citation`);
  });

  return errors;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
console.log(bold('\n═══════════════════════════════════════════════════'));
console.log(bold('  ECL Meeting Summary — End-to-End Pipeline Test'));
console.log(bold('═══════════════════════════════════════════════════'));

// ── Synthetic calendar events fixture ────────────────────────────────────────
const CALENDAR_EVENTS = [
  {
    id: 'ECL-TEST-EVENT-001',
    subject: 'ECL Sprint Planning — 21 August 2026',
    isCancelled: false,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' },
    organizer: { emailAddress: { address: 'josephat@elewa.co.ke' } },
    start: { dateTime: '2026-08-21T08:00:00Z' },
    end: { dateTime: '2026-08-21T09:00:00Z' }
  }
];

let queueItem = null;
let cleanedLines = [];
let summaryData = null;

// ─────────────────────────────────────────────────────────────────────────────
stage('1 — Calendar Dispatch: Filter & Queue', () => {
  const result = processCalendarDispatch(CALENDAR_EVENTS, [], { targetOrganizerEmail: 'josephat@elewa.co.ke' });
  if (result.queuedItems.length === 0) throw new Error('No eligible meetings dispatched');
  queueItem = result.queuedItems[0];
  return `${result.eligibleCount} eligible, ${result.queuedItems.length} queued → "${queueItem.Title}"`;
});

stage('2 — SharePoint Schema: Validate Queue Item', () => {
  if (!queueItem) throw new Error('No queue item from Stage 1');
  const result = validateSharePointItem(queueItem);
  if (!result.valid) throw new Error(result.errors.join('; '));
  return 'All required fields present, choices valid, no secrets detected';
});

stage('3 — VTT Cleaning: Strip Metadata & Redact Tokens', () => {
  const vttPath = path.join(FIXTURES, 'pipeline-transcript.vtt');
  if (!fs.existsSync(vttPath)) throw new Error(`Fixture not found: ${vttPath}`);
  const raw = fs.readFileSync(vttPath, 'utf8');
  cleanedLines = cleanVtt(raw);
  if (cleanedLines.length === 0) throw new Error('No utterances produced from VTT');
  const hasRedacted = cleanedLines.some(l => l.includes('***REDACTED***'));
  const hasSpeakers = cleanedLines.some(l => l.includes(':'));
  if (!hasSpeakers) throw new Error('Speaker labels missing from cleaned output');
  return `${cleanedLines.length} utterances, speaker labels preserved${hasRedacted ? ', secrets redacted' : ''}`;
});

stage('4 — Summary Schema: Validate SummaryJson', () => {
  const summaryPath = path.join(FIXTURES, 'pipeline-summary.json');
  if (!fs.existsSync(summaryPath)) throw new Error(`Fixture not found: ${summaryPath}`);
  const parsed = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  summaryData = parsed;
  const errors = validateSummaryJson(parsed.summary || parsed);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const s = parsed.summary || parsed;
  return `recap present, ${s.decisions.length} decisions, ${s.action_items.length} action items, ${s.open_questions.length} open questions, ${s.warnings.length} warnings`;
});

stage('5 — HTML Generation: Produce Approval Document', () => {
  if (!summaryData) throw new Error('No summary data from Stage 4');
  const s = summaryData.summary || summaryData;
  const meta = summaryData.metadata || {};
  const html = generateHtmlSummary(s, meta);
  if (!html || html.length < 500) throw new Error('Generated HTML is unexpectedly short');
  const outPath = path.join(OUTPUT_DIR, 'pipeline-output.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return `HTML written to test-fixtures/pipeline-output.html (${html.length} bytes)`;
});

// ─── Final report ─────────────────────────────────────────────────────────────
const passed = results.filter(r => r.passed).length;
const total  = results.length;

console.log(bold('\n═══════════════════════════════════════════════════'));
if (passed === total) {
  console.log(bold(green(`  ✅ ALL ${total} STAGES PASSED — Pipeline dry-run complete`)));
} else {
  const failed = total - passed;
  console.log(bold(red(`  ❌ ${failed} of ${total} stages FAILED`)));
  results.filter(r => !r.passed).forEach(r => {
    console.log(red(`     • ${r.name}: ${r.detail}`));
  });
}
console.log(bold('═══════════════════════════════════════════════════\n'));
process.exit(passed === total ? 0 : 1);
