# ECL-MS-01 Teams-led multi-organizer dispatch plan

## Objective

Replace the current Outlook-calendar dispatcher with a scheduled Teams-transcript dispatcher.

Flow 01 will discover newly available Microsoft Teams transcripts for every approved organizer, enrich them with online-meeting metadata, and queue each meeting exactly once. The flow will contain no calendar ID, organizer email, or organizer Entra object ID literals.

This plan can be built locally while the Graph connection is pending, but the scheduled flow must remain off until the transcript API, tenant policy, and organizer access tests pass.

## Why the exported Flow 01 must change

The `1.0.0.5` export discovers meetings through one person's Outlook calendar. Its calendar ID, organizer email, and organizer Entra ID are hard-coded.

That design reflected the earlier proof-of-concept approach. It is not the correct production architecture because:

- it is tied to one mailbox;
- it needs calendar permissions even though the business event is transcript availability;
- it queues meetings that may never produce a transcript; and
- it delays the real availability check until Flow 02.

Microsoft Graph v1.0 now provides `getAllTranscripts` for scheduled online meetings organized by a specified user, including time-window and delta synchronization. Flow 01 should use that Teams artifact feed as its source.

## Supported meeting scope

Initial production scope:

- scheduled Microsoft Teams meetings;
- transcription enabled and successfully generated;
- organizer is present and enabled in the approved organizer registry; and
- transcript API access is enabled by the tenant administrator.

Not included in the initial scope:

- Teams channel meetings, because `getAllTranscripts` does not currently support them;
- ad-hoc calls, which use a separate `adhocCalls/getAllTranscripts` endpoint;
- meetings without transcripts; and
- recordings without transcripts.

Ad-hoc call support can be added later as a separate source type without changing the scheduled-meeting path.

## Target architecture

```text
Recurrence trigger
    -> Read enabled organizers from MeetingSummaryOrganizers
    -> For each organizer, sequentially
        -> Gateway: get newly available Teams transcripts
        -> Group transcript artifacts by meeting ID
        -> Gateway: get online-meeting metadata
        -> Build OrganizerUserId + MeetingId dispatch key
        -> Create one MeetingSummaryRuns item when absent
        -> Save the next delta/checkpoint state
        -> Record organizer-level dispatch health
```

Flow 01 will use only:

- SharePoint for organizer configuration, checkpoints, and queue records; and
- the certificate-authenticated Graph gateway for Teams meeting and transcript operations.

The Office 365 Outlook connection is removed from Flow 01.

## SharePoint organizer registry

Create `MeetingSummaryOrganizers` with these columns:

| Column | Type | Required | Purpose |
|---|---|---:|---|
| `Title` | Text | Yes | Organizer display name |
| `OrganizerEmail` | Text | Yes | Normalized primary email/UPN |
| `OrganizerEntraUserId` | Text | Yes | Microsoft Entra object ID |
| `Enabled` | Yes/No | Yes | Controls transcript discovery |
| `SourceScope` | Choice | Yes | Initially `ScheduledTeamsMeetings` |
| `DeltaTokenReference` | Note | No | Opaque checkpoint returned by the gateway, protected from general editing |
| `LastSuccessfulSyncOn` | DateTime | No | Last completed synchronization |
| `LastDispatchStatus` | Choice | No | `Succeeded`, `NoTranscripts`, `AccessDenied`, or `Failed` |
| `LastErrorCode` | Text | No | Sanitized organizer-level code |

Rules:

- Enforce unique values on `OrganizerEntraUserId`.
- Restrict list editing to designated administrators and the automation identity.
- Adding a registry row does not grant Graph access. The organizer must also be included in the Teams transcript application-access policy.
- Do not store access tokens, certificates, transcript content, meeting join URLs, or full Graph responses in this list.

## Queue deduplication and schema changes

Add `DispatchKey` to `MeetingSummaryRuns` as a required, indexed text column with unique values enabled.

For scheduled Teams meetings:

```text
DispatchKey = toLower(concat(OrganizerEntraUserId, ':', MeetingId))
```

Use the meeting ID rather than transcript ID because one meeting can expose more than one transcript artifact. The desired business result is one summary per meeting.

Make `EventID` optional or store the Teams meeting ID there for backward compatibility until the schema is renamed. Add a separate `MeetingId` value immediately when the queue item is created.

`JoinUrl` may continue to be populated from online-meeting metadata, but it is no longer used to discover or resolve the meeting.

## Graph gateway operations

### 1. Discover transcripts

Add a read-only gateway route:

```text
GET /api/users/{organizerUserId}/transcripts/discover
    ?startDateTime=<UTC timestamp>
    &endDateTime=<UTC timestamp>
```

It calls Microsoft Graph v1.0:

```text
GET /users/{organizerUserId}/onlineMeetings/getAllTranscripts(
  meetingOrganizerUserId='{organizerUserId}',
  startDateTime=<UTC timestamp>,
  endDateTime=<UTC timestamp>
)
```

The gateway returns only:

- transcript ID;
- meeting ID;
- created date/time;
- end date/time;
- organizer identity; and
- an opaque next/delta checkpoint reference when supplied by Graph.

It follows pagination safely and honors Graph's delta-link rules. It never returns transcript content in this discovery response.

### 2. Read meeting metadata

Add or expose:

```text
GET /api/users/{organizerUserId}/onlineMeetings/{meetingId}
```

Return only:

- meeting ID;
- subject;
- start and end date/time;
- organizer identity;
- join URL; and
- meeting type.

### 3. Existing transcript-content operation

Retain the existing route:

```text
GET /api/users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content
```

Flow 02 uses it after Flow 01 has queued the meeting and transcript identifiers.

## Gateway validation and safety

- Validate organizer IDs as Entra object IDs.
- Validate UTC time ranges and enforce a maximum initial lookback.
- Use v1.0 endpoints only for the production implementation.
- Group discovery results by meeting ID.
- Never log or return access tokens, certificates, transcript bodies, full Graph error bodies, or attendee data.
- Return stable sanitized errors plus Graph request/correlation IDs.
- Treat `GraphAccessToTranscriptsDisabled` as a non-retryable administrative failure.
- Use bounded retry only for throttling and transient Graph/server errors.

## Permissions and tenant policy

Required application permission for organizer transcript discovery:

```text
OnlineMeetingTranscript.Read.All
```

The tenant administrator must enable Graph transcript API access and authorize the application for the approved organizer users through the applicable Teams application-access policy.

Acceptance requires:

1. one approved organizer returns transcript metadata;
2. one unapproved organizer is denied;
3. transcript content can be retrieved only for an approved organizer; and
4. no Outlook `Calendars.Read` permission is introduced for Flow 01.

## Flow 01 trigger and checkpoint model

After manual Development acceptance, use:

```text
Recurrence: every 15 minutes
Time zone: UTC
Trigger concurrency: 1
Organizer loop concurrency: 1 initially
```

For the first organizer synchronization, use a bounded lookback such as 24 hours. After the first successful synchronization, use the returned delta/checkpoint state where supported.

Checkpoint rules:

- Save a new checkpoint only after every discovered page has been processed successfully.
- Never advance the checkpoint after a partial failure.
- When Graph invalidates a token, run a bounded recovery lookback and rely on `DispatchKey` for idempotency.
- Treat delta tokens as opaque; never alter or append filters to them.

## Flow 01 processing phases

### Phase 1: load enabled organizers

1. Read enabled `MeetingSummaryOrganizers` entries.
2. Validate organizer ID and normalized email.
3. Initialize a run correlation ID.
4. Process organizers sequentially.
5. Isolate configuration or access failure to the affected organizer.

### Phase 2: discover new transcript artifacts

1. Call the gateway discovery operation with the organizer ID and checkpoint/window.
2. Enable secure inputs and outputs.
3. Group returned transcript records by meeting ID.
4. For each meeting, select the latest transcript ID by `createdDateTime` for the initial implementation.
5. Preserve the grouped transcript IDs for a later enhancement if meetings with multiple non-overlapping transcript parts must be combined.

### Phase 3: enrich with Teams meeting metadata

For each distinct meeting ID:

1. Get online-meeting metadata from the gateway.
2. Require the returned organizer ID to match the registry organizer ID.
3. Require `meetingType = scheduled` for the initial source scope.
4. Use the returned subject, dates, and join URL for the queue record.
5. If metadata retrieval fails, do not advance the organizer checkpoint; record a sanitized error so the meeting can be retried.

### Phase 4: queue once

1. Build `DispatchKey` from organizer ID and meeting ID.
2. Query `MeetingSummaryRuns` by `DispatchKey`.
3. Create a queue item only when it does not exist.
4. Treat a SharePoint unique-key conflict as an idempotent skip.

Queue mappings:

| Queue field | Source |
|---|---|
| `DispatchKey` | Organizer ID + meeting ID |
| `Title` | Online-meeting subject or `Untitled Teams meeting` |
| `EventID` | Meeting ID during backward-compatible transition |
| `MeetingId` | Teams online-meeting ID |
| `TranscriptId` | Latest discovered transcript ID |
| `SourceType` | `TeamsTranscript` |
| `JoinURL` | Online-meeting join URL when returned |
| `OrganizerEmail` | Organizer registry |
| `OrganizerUserId` | Organizer registry |
| `MeetingStart` | Online-meeting start |
| `MeetingEnd` | Online-meeting end |
| `Status` | `Queued` |
| `AttemptCount` | `0` |
| `PromptVersion` | `ecl_PromptVersion` |

### Phase 5: finalize organizer synchronization

Only after all pages and meetings succeed:

- save the new checkpoint;
- set `LastSuccessfulSyncOn = utcNow()`;
- set `LastDispatchStatus` to `Succeeded` or `NoTranscripts`; and
- clear `LastErrorCode`.

One organizer's failure must not stop subsequent organizers.

## Consequence for Flow 02

Flow 02 no longer needs to resolve a join URL or poll until a transcript exists for the normal scheduled path. Flow 01 has already discovered the transcript and stored `MeetingId` and `TranscriptId`.

Flow 02 should:

1. trigger on a `Queued` item;
2. validate organizer, meeting, and transcript IDs;
3. retrieve transcript content directly;
4. clean the WebVTT content;
5. invoke Flow 03 while cleaned text remains in memory; and
6. preserve a fallback retry only for short-lived content availability or throttling errors.

This simplifies the pipeline and eliminates unnecessary calendar and meeting-resolution calls.

## Error codes

| Code | Meaning |
|---|---|
| `DISPATCH_ORGANIZER_CONFIG_INVALID` | Organizer registry entry is invalid |
| `DISPATCH_TRANSCRIPT_ACCESS_DISABLED` | Tenant administrator disabled transcript API access |
| `DISPATCH_ORGANIZER_ACCESS_DENIED` | Organizer is outside the approved application policy |
| `DISPATCH_TRANSCRIPT_DISCOVERY_FAILED` | Teams transcript discovery failed |
| `DISPATCH_MEETING_METADATA_FAILED` | Online-meeting enrichment failed |
| `DISPATCH_QUEUE_READ_FAILED` | Duplicate check failed |
| `DISPATCH_QUEUE_WRITE_FAILED` | Queue creation failed |
| `DISPATCH_CHECKPOINT_FAILED` | Checkpoint could not be saved safely |
| `DISPATCH_FAILED` | Unexpected run-level failure |

Diagnostics may contain only phase, organizer registry item ID, correlation ID, and Graph/connector request ID. Do not persist transcript content, join URLs, tokens, certificates, or full responses in error details.

## Work that can proceed while Graph is pending

1. Provision `MeetingSummaryOrganizers`.
2. Add unique `DispatchKey` to `MeetingSummaryRuns`.
3. Remove real defaults from the two obsolete organizer environment variables.
4. Extend the gateway and its tests locally for transcript discovery and meeting metadata.
5. Update the custom connector contract locally.
6. Build Flow 01 as draft/off using synthetic discovery responses.
7. Revise the Flow 02 contract to accept pre-resolved meeting and transcript IDs.
8. Prepare organizer onboarding, access-policy, and offboarding procedures.

## Acceptance tests

1. Approved organizer returns scheduled-meeting transcript metadata.
2. Unapproved organizer is denied.
3. Two organizers' transcripts create correctly attributed queue records.
4. Multiple transcript artifacts for one meeting produce one queue item.
5. Replaying the same window or checkpoint produces no duplicate item.
6. A failed organizer does not block another organizer.
7. A disabled tenant transcript policy produces a non-retryable sanitized failure.
8. Meeting metadata is populated without reading Outlook calendars.
9. Flow 02 retrieves VTT directly from stored organizer, meeting, and transcript IDs.
10. No calendar permission, event body, attendee data, transcript body, or credential leaks into configuration or diagnostics.

## Packaging

1. Start from the latest Development export, currently `1.0.0.5` unless superseded.
2. Preserve Flow 01 component ID `{560c2da9-37a1-f111-b8dc-000d3ab04ac1}`.
3. Package the SharePoint schema, organizer registry, updated gateway connector, Flow 01, and revised Flow 02 contract as coordinated staged changes.
4. Do not overwrite the active unpublished Flow 03 revision.
5. Import Flow 01 as off/draft.
6. Enable it only after approved/denied organizer, two-organizer, and duplicate tests pass.
7. Re-export the successful Development solution as the next authoritative baseline.

## Definition of done

- Flow 01 reads Teams transcript availability through Microsoft Graph, not Outlook calendars.
- No calendar ID, organizer email, or organizer object ID is hard-coded.
- Any number of approved organizers can be enabled without cloning the flow.
- Only scheduled Teams meetings with available transcripts are queued.
- Each organizer/meeting pair is queued once.
- Flow 02 receives pre-resolved meeting and transcript IDs.
- A non-approved organizer is denied and one organizer failure does not block others.
- Channel meetings and ad-hoc calls are explicitly excluded or implemented as separately tested source types.
- The successful Development export becomes the next baseline.
