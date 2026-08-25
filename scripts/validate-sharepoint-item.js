#!/usr/bin/env node

/**
 * validate-sharepoint-item.js
 * 
 * Validates a JavaScript/JSON object against the SharePoint MeetingSummaryRuns schema,
 * checking for required fields, valid choice values, date formats, and prohibited secrets.
 */

const fs = require('fs');
const path = require('path');

const VALID_STATUSES = [
  'Queued',
  'ResolvingMeeting',
  'WaitingForTranscript',
  'TranscriptReady',
  'Summarising',
  'PendingApproval',
  'Approved',
  'RevisionRequested',
  'Rejected',
  'TranscriptUnavailable',
  'Failed'
];

const VALID_SOURCE_TYPES = ['TeamsTranscript', 'ManualUpload', 'DirectAudio'];
const VALID_APPROVAL_OUTCOMES = ['Approve', 'Request changes', 'Reject', null, undefined];
const VALID_APPROVAL_STARTED = ['No', 'Yes', true, false];

function validateSharePointItem(item) {
  const errors = [];
  const warnings = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item payload must be an object'], warnings: [] };
  }

  // 1. Check Required Fields for a Created Item
  if (!item.Title || typeof item.Title !== 'string') {
    errors.push('Missing or invalid required field: "Title" (string)');
  }
  if (!item.EventId || typeof item.EventId !== 'string') {
    errors.push('Missing or invalid required field: "EventId" (string)');
  }
  if (!item.SourceType || !VALID_SOURCE_TYPES.includes(item.SourceType)) {
    errors.push(`Invalid "SourceType": "${item.SourceType}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
  }
  if (!item.JoinUrl || typeof item.JoinUrl !== 'string' || !item.JoinUrl.startsWith('https://')) {
    errors.push('Missing or invalid required field: "JoinUrl" (must be valid HTTPS URL)');
  }
  if (!item.OrganizerEmail || typeof item.OrganizerEmail !== 'string' || !item.OrganizerEmail.includes('@')) {
    errors.push('Missing or invalid required field: "OrganizerEmail" (must be valid email string)');
  }
  if (!item.OrganizerUserId || typeof item.OrganizerUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.OrganizerUserId)) {
    errors.push('Missing or invalid required field: "OrganizerUserId" (must be a Microsoft Entra user object ID)');
  }

  // 2. Check Choice Constraints
  if (item.Status && !VALID_STATUSES.includes(item.Status)) {
    errors.push(`Invalid "Status": "${item.Status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (item.ApprovalStarted !== undefined && !VALID_APPROVAL_STARTED.includes(item.ApprovalStarted)) {
    errors.push(`Invalid "ApprovalStarted": "${item.ApprovalStarted}". Must be "No" or "Yes"`);
  }

  if (item.ApprovalOutcome !== undefined && !VALID_APPROVAL_OUTCOMES.includes(item.ApprovalOutcome)) {
    errors.push(`Invalid "ApprovalOutcome": "${item.ApprovalOutcome}". Must be one of: ${VALID_APPROVAL_OUTCOMES.filter(Boolean).join(', ')}`);
  }

  // 3. Check JSON schema for SummaryJson if present
  if (item.SummaryJson) {
    try {
      const parsed = typeof item.SummaryJson === 'string' ? JSON.parse(item.SummaryJson) : item.SummaryJson;
      if (!parsed.recap || !Array.isArray(parsed.decisions) || !Array.isArray(parsed.action_items)) {
        warnings.push('"SummaryJson" is present but missing standard top-level summary keys (recap, decisions, action_items)');
      }
    } catch (e) {
      errors.push(`"SummaryJson" contains invalid JSON: ${e.message}`);
    }
  }

  // 4. Security Check: Ensure No Secrets Leaked
  const itemStr = JSON.stringify(item);
  if (/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/i.test(itemStr) || /\b[A-Za-z0-9+/=]{40,}\b/.test(itemStr)) {
    errors.push('CRITICAL SECURITY VIOLATION: Item contains raw tokens, bearer tokens, or client secrets!');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// CLI Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args[0];

  if (!filePath) {
    console.error('Usage: node scripts/validate-sharepoint-item.js <item.json>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const items = Array.isArray(data) ? data : [data];

    let allValid = true;
    items.forEach((item, idx) => {
      const result = validateSharePointItem(item);
      console.log(`\n--- Validating Item ${idx + 1} (${item.Title || 'Untitled'}) ---`);
      if (result.valid) {
        console.log('✅ Status: VALID');
      } else {
        console.log('❌ Status: INVALID');
        result.errors.forEach(err => console.error(`  - ERROR: ${err}`));
        allValid = false;
      }
      result.warnings.forEach(w => console.warn(`  - WARNING: ${w}`));
    });

    process.exit(allValid ? 0 : 1);
  } catch (err) {
    console.error(`Validation failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { validateSharePointItem };
