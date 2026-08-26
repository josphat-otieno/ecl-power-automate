# ECL-MS-02 implementation plan

## Objective

Finish `ECL-MS-02 - Retrieve Teams Transcript` as a manual proof of concept first, then connect it to the SharePoint queue only after meeting resolution and transcript retrieval pass against one approved organizer-owned Teams meeting.

## Current baseline

- Source package: `baselines/ECLMeetingSummary_1_0_0_5.zip`
- SHA-256: `1bf098c5eca2cacd9ccf2b42be8ee256d19ceb2d75e4b08fb007b3d5470e21aa`
- Flow 01 now contains the observed Outlook filter, Teams URL extraction, exact SharePoint site/list binding, `EventID` duplicate check, and complete queue mappings.
- Flow 01 is active in the exported solution.
- The incomplete Flow 02 skeleton is also active; the targeted Flow 02 update must explicitly package it as draft/off.
- Runtime proof of one complete queue item and a duplicate-free second run remains the final Flow 01 acceptance evidence.

## Gate 1: accept Flow 01 queue output

Before connecting Flow 02 to Flow 01:

1. Confirm one eligible meeting creates one `MeetingSummaryRuns` item.
2. Confirm the item contains `EventID`, `JoinUrl`, `OrganizerEmail`, `OrganizerUserId`, `MeetingStart`, `MeetingEnd`, and `Status = Queued`.
3. Rerun Flow 01 and confirm no duplicate item is created.

Flow 02 may be built in manual POC mode while this gate is pending, but it must not use the SharePoint queue trigger yet.

## Gate 2: establish the Graph gateway boundary

1. Confirm the certificate-authenticated Graph gateway has an approved Development URL.
2. Import the `ECL Graph Transcript Gateway` custom connector from the repository OpenAPI contract.
3. Create and add its connection reference to the solution as `ecl_shared_graphgateway`.
4. Map the function-key connection without embedding the key in the flow or solution source.
5. Test `ResolveMeeting`, `ListTranscripts`, and `GetTranscriptContent` individually.

If the gateway is not deployed, stop at a locally validated Flow 02 package; do not substitute the delegated MCP authoring application for unattended transcript retrieval.

## Phase 1: rebuild the manual POC flow

Retain the current manual inputs:

- `JoinUrl`
- `TestRunId`

Add or source the approved organizer's Entra user object ID. Initialize:

- `AttemptCount = 0`
- `Transcripts = []`
- `MeetingId = ''`
- `TranscriptId = ''`
- `CleanTranscript = ''`

Set trigger concurrency to one and leave the flow off after import.

## Phase 2: resolve the Teams meeting

Inside `Scope - Try`:

1. Call `ResolveMeeting` with `OrganizerUserId` and the exact `JoinUrl`.
2. Enable secure inputs and outputs on the gateway action.
3. Require exactly one returned meeting.
4. Store its Graph meeting ID.
5. Fail cleanly for zero or multiple matches and retain only sanitized correlation/request IDs.

Acceptance: one known organizer-owned scheduled Teams meeting resolves to one Graph online-meeting ID.

## Phase 3: retry transcript discovery

Replace the current reversed condition/loop structure with:

1. An `Until` loop that stops when a transcript exists or maximum attempts is reached.
2. `ListTranscripts` as the first action inside the loop.
3. Store `body.value` in `Transcripts`.
4. Increment and persist `AttemptCount`.
5. Delay only when the collection is empty and attempts remain.
6. Use configured retry delay and maximum-attempt values; use fixed POC values only if environment-variable binding remains unavailable.

Acceptance: available transcripts exit immediately; unavailable transcripts retry predictably and terminate without an infinite loop.

## Phase 4: choose and retrieve the transcript

1. If `Transcripts` is empty after retries, terminate successfully as `TranscriptUnavailable` with `TRANSCRIPT_NOT_READY`.
2. Otherwise select the latest transcript by `createdDateTime`.
3. Call `GetTranscriptContent` with organizer, meeting, and transcript IDs.
4. Enable secure inputs and outputs.
5. Normalize the response: decode `$content` only when a base64 envelope is present; otherwise preserve the text body.

Acceptance: the flow obtains nonempty WebVTT content for the approved test meeting.

## Phase 5: clean WebVTT safely

Remove:

- `WEBVTT` header;
- timestamp lines;
- `NOTE` blocks;
- `Kind:` and `Language:` metadata; and
- blank lines.

Preserve speaker labels, utterance order, punctuation, and uncertainty. Do not store raw transcript content in ordinary run logs or SharePoint during the POC.

Acceptance: cleaned output matches the repository VTT-cleaning fixture semantics.

## Phase 6: add SharePoint queue integration

After the manual POC passes:

1. Add `ecl_shared_sharepointonline` to Flow 02.
2. Replace or supplement the manual trigger with `When an item is created or modified` for `MeetingSummaryRuns`.
3. Trigger only for `Status = Queued`.
4. Read `JoinUrl`, `OrganizerUserId`, and `AttemptCount` from the item.
5. Update statuses in order: `ResolvingMeeting`, `WaitingForTranscript`, then `TranscriptReady` or `TranscriptUnavailable`.
6. Store `MeetingId`, `TranscriptId`, attempt count, sanitized error information, and `ProcessedOn`.
7. Keep raw and cleaned transcript text out of SharePoint until the Flow 03 handoff contract is finalized.

## Phase 7: failure and finalization behavior

- `Scope - Catch` runs after failure or timeout and writes `Status = Failed`, `ErrorCode = TRANSCRIPT_FLOW_FAILED`, sanitized error details, and `ProcessedOn`.
- `Scope - Finally` runs after every Catch outcome and performs terminal-state consistency checks only.
- Secrets, function keys, access tokens, transcript bodies, and full connector responses must never be copied into error fields.

## Packaging strategy

1. Use the exported `1.0.0.5` solution as the source baseline.
2. Package Flow 02 as a targeted update so Flow 03's active unpublished state is not touched.
3. Increment the solution version for each import attempt.
4. Keep Flow 02 draft/off after import.
5. Re-export the successful live correction and use that export as the next repository baseline.

## End-to-end acceptance

- Manual POC resolves one scheduled organizer-owned Teams meeting.
- At least one transcript is listed after the retry window.
- WebVTT content is retrieved and normalized.
- Speaker-preserving cleaned text is produced.
- Queue mode processes one `Queued` item exactly once.
- Duplicate Flow 01 runs do not create duplicate queue records.
- Missing transcript ends as `TranscriptUnavailable`, not `Failed`.
- Unexpected errors end as `Failed` with sanitized diagnostics.
- Flow 03 remains untouched until Flow 02 passes.
