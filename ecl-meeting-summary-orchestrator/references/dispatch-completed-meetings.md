# Dispatch completed meetings

Purpose
- Provide a step-by-step implementer guide and contract for Flow 01 (`ECL-MS-01 – Dispatch Completed Meetings`) to discover eligible Teams meetings from Outlook calendar, perform idempotency checks, and register unprocessed meetings into the `MeetingSummaryRuns` SharePoint queue.

---

## Architecture & Boundary Rules

- **Trigger Method:**
  - **POC / Initial Testing:** Manual trigger with `LookbackMinutes` input (or test meeting picker).
  - **Automated Pipeline:** Recurrence trigger every 15 minutes in `Africa/Nairobi` (or tenant local timezone).
- **Delegated Identity Constraint:**
  - In delegated mode, only process meetings where `OrganizerEmail` matches the authenticated connection identity (or configured target organizer).
  - Exclude external invites or meetings where the user is solely an attendee (as delegated Graph cannot access transcripts of meetings organized by others).
- **Idempotency Guarantee:**
  - Always query SharePoint (`MeetingSummaryRuns`) for an existing item with the same `EventId` before creating a queue item.
  - Never create duplicate queue entries for the same meeting instance.

---

## Lookback Window Expressions

To avoid missing meetings while ensuring Graph has sufficient time to generate VTT transcripts, configure the lookback window using Power Automate WDL expressions:

```powerautomate
// Window Start: 90 minutes ago (lookback depth)
WindowStart = addMinutes(utcNow(), -90)

// Window End: now minus the configured initial transcript delay (e.g. 15 minutes)
WindowEnd = addMinutes(utcNow(), -int(parameters('TranscriptInitialDelayMinutes')))
```

---

## Step-by-Step Implementer Guide

### 1. Trigger Setup
- **Connector:** Schedule
- **Action:** `Recurrence`
- **Interval:** `15`
- **Frequency:** `Minute`
- **Time zone:** `@parameters('TimeZone')` (default `Africa/Nairobi`)

### 2. Query Calendar View
- **Connector:** Office 365 Outlook
- **Action:** `Get calendar view of events (V3)`
- **Parameters:**
  - **Calendar ID:** `Calendar`
  - **Start time:** `@variables('WindowStart')` (ISO 8601 string)
  - **End time:** `@variables('WindowEnd')` (ISO 8601 string)
  - **Top Count:** `100`

### 3. Filter Eligible Teams Meetings
- **Action:** `Filter array`
- **From:** `@outputs('Get_calendar_view_of_events_(V3)')?['body/value']`
- **Eligibility Conditions (All must be true):**
  1. `isOnlineMeeting` is equal to `true`
  2. `onlineMeetingProvider` is equal to `teamsForBusiness`
  3. `onlineMeeting/joinUrl` is not equal to `null` (and not empty)
  4. `organizer/emailAddress/address` equals connection user email (case-insensitive)
  5. `isCancelled` is equal to `false`

### 4. Process Each Meeting (`Apply to each`)
For each item in the filtered array:

#### 4.1 Check Existing Queue Record
- **Connector:** SharePoint
- **Action:** `Get items`
- **List Name:** `@parameters('ProcessingListName')` (`MeetingSummaryRuns`)
- **Filter Query (OData):**
  ```text
  EventId eq '@{items('Apply_to_each')?['id']}'
  ```
- **Top Count:** `1`

#### 4.2 Condition: Is Already Queued?
- **Expression:** `length(outputs('Get_items')?['body/value'])` is equal to `0`

#### 4.3 Create Queue Item (If not already queued)
- **Connector:** SharePoint
- **Action:** `Create item`
- **List Name:** `@parameters('ProcessingListName')`
- **Field Mappings:**
  ```text
  Title              = @{items('Apply_to_each')?['subject']}
  EventId            = @{items('Apply_to_each')?['id']}
  SourceType         = TeamsTranscript
  JoinUrl            = @{items('Apply_to_each')?['onlineMeeting/joinUrl']}
  OrganizerEmail     = @{items('Apply_to_each')?['organizer/emailAddress/address']}
  MeetingStart       = @{items('Apply_to_each')?['start']}
  MeetingEnd         = @{items('Apply_to_each')?['end']}
  Status             = Queued
  AttemptCount       = 0
  ApprovalStarted    = No
  PromptVersion      = @parameters('PromptVersion')
  ```

---

## Edge Case Handling

| Scenario | Behavior |
|---|---|
| **Recurring Meeting Series** | Each occurrence has a unique instance `id` in `Get calendar view`. Deduplication by `EventId` allows each distinct meeting session to be queued once. |
| **Meeting Cancelled / Rescheduled** | Filter ignores items where `isCancelled = true`. If rescheduled, the new time window captures it. |
| **All-Day / Non-Teams Events** | Filtered out by `isOnlineMeeting == true` and `onlineMeetingProvider == 'teamsForBusiness'`. |
| **Multi-Tenant / Guest Meetings** | If organized by an external domain, filtered out by organizer check to prevent permission failures in Graph. |

---

## Testing and Acceptance Checklist

- [ ] Manual test run with test calendar event creates exactly one `MeetingSummaryRuns` item with `Status = Queued`.
- [ ] Subsequent run of Flow 01 with the same event in window detects the existing item and skips creation.
- [ ] Non-Teams events and cancelled events in the same time window are ignored.
- [ ] `MeetingStart`, `MeetingEnd`, and `JoinUrl` are correctly populated.
