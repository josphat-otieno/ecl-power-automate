#!/usr/bin/env node

/**
 * simulate-calendar-dispatcher.js
 * 
 * Simulates Flow 01 (ECL-MS-01) logic:
 * Filters Outlook calendar events based on Teams online meeting properties,
 * checks against an existing SharePoint queue register for idempotency,
 * and generates the exact SharePoint "Create item" payloads.
 */

const fs = require('fs');
const path = require('path');

function filterEligibleEvents(events, targetOrganizerEmail) {
  const normalizedTarget = (targetOrganizerEmail || '').toLowerCase().trim();

  return events.filter(event => {
    // 1. Must not be cancelled
    if (event.isCancelled) return false;

    // 2. Must be online meeting
    if (!event.isOnlineMeeting) return false;

    // 3. Must be Teams
    const provider = (event.onlineMeetingProvider || '').toLowerCase();
    if (provider !== 'teamsforbusiness' && provider !== 'teams') return false;

    // 4. Must have a valid join URL
    const joinUrl = event.onlineMeeting?.joinUrl || event.onlineMeetingUrl;
    if (!joinUrl || typeof joinUrl !== 'string' || !joinUrl.startsWith('https://')) return false;

    // 5. Must match organizer email if target provided
    if (normalizedTarget) {
      const organizerEmail = (event.organizer?.emailAddress?.address || '').toLowerCase().trim();
      if (organizerEmail !== normalizedTarget) return false;
    }

    return true;
  });
}

function processCalendarDispatch(calendarEvents, existingQueueItems = [], options = {}) {
  const targetOrganizer = options.targetOrganizerEmail || 'organiser@elewa.co.ke';
  const promptVersion = options.promptVersion || 'meeting-summary-v1';

  const existingEventIds = new Set(
    existingQueueItems.map(item => item.EventId || item.id || item.eventId)
  );

  const eligibleEvents = filterEligibleEvents(calendarEvents, targetOrganizer);
  const toQueue = [];
  const skippedDuplicates = [];

  for (const event of eligibleEvents) {
    const eventId = event.id;
    if (existingEventIds.has(eventId)) {
      skippedDuplicates.push({
        id: eventId,
        subject: event.subject,
        reason: 'Already exists in SharePoint processing queue'
      });
    } else {
      const payload = {
        Title: event.subject || 'Untitled Meeting',
        EventId: eventId,
        SourceType: 'TeamsTranscript',
        JoinUrl: event.onlineMeeting?.joinUrl || event.onlineMeetingUrl,
        OrganizerEmail: event.organizer?.emailAddress?.address || targetOrganizer,
        MeetingStart: event.start?.dateTime || event.start,
        MeetingEnd: event.end?.dateTime || event.end,
        Status: 'Queued',
        AttemptCount: 0,
        ApprovalStarted: 'No',
        PromptVersion: promptVersion
      };
      toQueue.push(payload);
    }
  }

  return {
    totalEvaluated: calendarEvents.length,
    eligibleCount: eligibleEvents.length,
    queuedItems: toQueue,
    skippedDuplicates
  };
}

// CLI Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const eventsFile = args[0];
  const queueFile = args[1];

  if (!eventsFile) {
    console.error('Usage: node scripts/simulate-calendar-dispatcher.js <calendar-events.json> [existing-queue.json]');
    process.exit(1);
  }

  if (!fs.existsSync(eventsFile)) {
    console.error(`File not found: ${eventsFile}`);
    process.exit(1);
  }

  try {
    const rawEvents = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    const events = Array.isArray(rawEvents) ? rawEvents : (rawEvents.value || []);
    
    let existingItems = [];
    if (queueFile && fs.existsSync(queueFile)) {
      const rawQueue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      existingItems = Array.isArray(rawQueue) ? rawQueue : (rawQueue.value || []);
    }

    const result = processCalendarDispatch(events, existingItems);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Simulation failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { filterEligibleEvents, processCalendarDispatch };
