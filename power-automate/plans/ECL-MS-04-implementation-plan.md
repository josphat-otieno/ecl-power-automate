# ECL-MS-04 automatic SharePoint publication plan

## Objective

Repurpose component `{9bd376e9-cfa0-f111-b8dc-000d3ab04ac1}` from `Approve and Publish Summary` to `Publish Meeting Summary`.

Flow 04 receives no human response and uses no Approvals connector. It automatically publishes each schema-valid summary to SharePoint exactly once, then marks the processing record `Published`.

Keeping publication separate from Flow 03 allows a failed SharePoint publication to be retried without repeating transcript retrieval or paid LLM summarisation.

## Revised lifecycle

```text
Flow 03: TranscriptReady -> Summarising -> ReadyToPublish
Flow 04: ReadyToPublish -> Publishing -> Published
                                      -> PublicationFailed
```

The existing approval-related statuses and fields may remain temporarily for backward compatibility, but new runs do not use `PendingApproval`, `ApprovalStarted`, `ApprovalOutcome`, `ApprovalComments`, `ApprovedBy`, or `ApprovedOn`.

## Current Flow 04 actions to remove

- Approvals connection reference and all approval actions.
- `ApprovalStarted` trigger condition and lock.
- `Run_Approval_Once` wrapper.
- `Approve`, `Request Changes`, and `Reject` branches.
- Approval-request notification content.
- Approval outcome and responder-field updates.

Retain and correct the useful summary parser, HTML construction, SharePoint file creation, metadata update, and optional completion email.

## Confirmed SharePoint destination

- Library: `Shared Documents`
- Folder: `Meeting Summaries`
- Target: `Shared Documents/Meeting Summaries/YYYY-MM`

Before implementation, record the actual library ID, server-relative folder path, and metadata internal names. The target metadata contract is:

- `MeetingTitle`;
- `EventDate`;
- `OrganizerEmail`;
- `MeetingId`;
- `GeneratedOn`; and
- `ProcessingItemId`.

Flow 04 creates or reuses monthly folders named `YYYY-MM` under the confirmed folder.

## Phase 1: trigger and idempotency

1. Trigger when a `MeetingSummaryRuns` item is created or modified.
2. Trigger only when `Status = ReadyToPublish`, `SummaryJson` is nonempty, and `SummaryFileUrl` is empty.
3. Set trigger concurrency to one for initial deployment.
4. Re-read the current item at run start; do not rely only on the trigger payload.
5. If it is no longer eligible, terminate as `Ignored` without creating a file.
6. Set `Status = Publishing` and clear earlier publication error fields.
7. Use the processing item ID as the stable publication key.

## Phase 2: validate and render

1. Parse `SummaryJson` using the exact Flow 03 schema.
2. Reject malformed or incomplete JSON with `SUMMARY_JSON_INVALID`.
3. Format recap, decisions, action items, open questions, and warnings as readable HTML.
4. HTML-escape every title, owner, date, evidence snippet, warning, and metadata value.
5. Render empty collections as clear messages rather than malformed tables.
6. Include meeting title, meeting date, organizer, generation date, and processing-item reference.
7. Do not include the raw transcript, prompts, secrets, or model response envelopes.

## Phase 3: create the SharePoint artifact

1. Ensure the configured `YYYY-MM` folder exists.
2. Generate a collision-resistant filename:
   `YYYY-MM-DD_<sanitized-title>_<processing-item-id>_Summary.html`.
3. Sanitize all SharePoint-invalid filename characters and enforce the supported filename length.
4. Create the file using fail-if-exists behavior.
5. If a retry finds the expected filename, verify its `ProcessingItemId` before treating it as the existing publication.
6. Update the defined document metadata fields.
7. Construct and verify the final web URL.
8. Update the processing item only after file creation and metadata update succeed:
   - `Status = Published`;
   - `SummaryFileUrl` = verified URL;
   - `ProcessedOn = utcNow()`;
   - `ErrorCode` and `ErrorDetails` = empty.

## Phase 4: completion notification

Sending email is optional and does not gate publication.

If enabled, send the organizer a short message containing the meeting title and verified SharePoint link. Email failure must not change `Published` back to `Failed`; record only a sanitized `PUBLICATION_NOTIFICATION_FAILED` warning if the list schema supports it.

## Phase 5: failure handling

Use Try/Catch/Finally scopes.

- Invalid summary: `Status = PublicationFailed`, `ErrorCode = SUMMARY_JSON_INVALID`.
- Folder/file failure: `Status = PublicationFailed`, `ErrorCode = SHAREPOINT_PUBLICATION_FAILED`.
- Metadata failure: retain the incomplete file and record its path for repair unless a separate cleanup policy is approved.
- Unexpected failure: `Status = PublicationFailed`, `ErrorCode = PUBLICATION_FLOW_FAILED`.
- `ErrorDetails` contains phase, processing item ID, and correlation ID only.

Never include `SummaryJson`, transcript text, secrets, access tokens, or full connector payloads in error fields.

## Retry strategy

To retry a failed publication:

1. Correct the destination, connection, schema, or metadata issue.
2. Set the item from `PublicationFailed` back to `ReadyToPublish`.
3. Do not rerun Flow 02 or Flow 03.
4. Confirm the stable filename prevents duplicate documents.

## Testing sequence

1. Valid synthetic `SummaryJson` produces one readable HTML file.
2. Repeated item modifications do not create a duplicate file.
3. Empty arrays render correctly.
4. Special characters in title and content are escaped safely.
5. File metadata matches the processing record.
6. Malformed JSON creates no file and ends as `PublicationFailed`.
7. A metadata failure never produces `Published`.
8. Retrying a failed item reuses or safely resolves the stable filename.
9. Notification failure leaves a successfully published item as `Published`.
10. End-to-end: Flow 03 sets `ReadyToPublish`; Flow 04 creates one file and sets `Published`.

## Packaging strategy

1. Use the newest successful live export after Flow 03 as the baseline.
2. Preserve component ID `{9bd376e9-cfa0-f111-b8dc-000d3ab04ac1}` and change its display name to `ECL-MS-04 - Publish Meeting Summary`.
3. Remove the Approvals connection from Flow 04 while leaving the solution-level reference only if another component still needs it.
4. Add the new SharePoint status values before enabling the flow.
5. Package Flow 04 as draft/off with its SharePoint connection and publication configuration.
6. Run synthetic acceptance before enabling the automatic trigger.
7. Re-export the successful version as the next baseline.

## Definition of done

- No approval request is created.
- Every valid `ReadyToPublish` item produces exactly one SharePoint document.
- The processing item reaches `Published` only after file and metadata success.
- Failed publications can be retried without rerunning the LLM.
- Generated HTML is readable, escaped, and metadata-complete.
- The verified SharePoint URL is stored in `SummaryFileUrl`.
- No transcript, secret, token, or sensitive connector payload is exposed.
