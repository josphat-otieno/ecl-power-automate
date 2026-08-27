# ECL-MS-04 — publish meeting summary to SharePoint

## Objective

Replace the legacy approval flow with an automatic, idempotent SharePoint publisher. Every schema-valid item in `ReadyToPublish` is rendered to a safe HTML summary, stored once in the configured SharePoint library, and marked `Published` only after content, metadata, and URL verification succeed.

Flow 04 creates no approval, sends no summary for review, retrieves no transcript, and calls no LLM.

## Required removal from the exported Flow 04

The `1.0.0.5` component `{9bd376e9-cfa0-f111-b8dc-000d3ab04ac1}` still contains obsolete approval behavior. Remove:

- the Approvals connection reference;
- the Outlook connection if it is used only for approval/publication email;
- `ApprovalStarted` trigger conditions and locking;
- `Start and wait for an approval`;
- `Approve`, `Request Changes`, and `Reject` branches;
- responder/comment handling; and
- all approval notification actions.

Retain only reusable schema parsing, HTML rendering, SharePoint file creation, and audit-update concepts after correcting their hard-coded values and idempotency gaps.

## Authoritative input contract

Flow 04 owns a `MeetingSummaryRuns` item only when:

| Field | Requirement |
|---|---|
| `ID` | Positive SharePoint item ID |
| `EventID` | Nonempty and unique |
| `MeetingID` | Nonempty |
| `OrganizerEntraUserID` | Nonempty |
| `Title` | Nonempty |
| `MeetingStart` | Valid date/time |
| `SummaryJson` | Nonempty and valid against the Flow 03 schema |
| `Status` | `ReadyToPublish` |
| `SummaryFileUrl` | Empty |

`OrganizerEmail` is optional publication metadata. It must not block publication when the current data model contains only the organizer's Entra ID.

## Shared lifecycle

```text
Flow 03: TranscriptReady -> Summarising -> ReadyToPublish
Flow 04: ReadyToPublish -> Publishing -> Published
                                   \-> PublicationFailed
```

`Published` is terminal. `PublicationFailed` is recoverable without rerunning Flow 02 or Flow 03.

## Configuration and connection boundary

Use environment-specific configuration for:

- `ecl_SharePointSiteUrl`;
- `ecl_ProcessingListName`;
- summary library ID or name;
- summary root folder;
- expected metadata internal names; and
- maximum rendered document size.

Flow 04 requires only the SharePoint connection unless a separately approved downstream Flow 05/Odoo handoff is enabled. Do not package live connection IDs, user-specific paths, credentials, or tenant URLs as action literals.

Before implementation, verify the actual library and folder in the target environment. The currently observed target is `Shared Documents/Meeting Summaries`, but the environment configuration is authoritative.

## Trigger, lock, and idempotency

1. Trigger when a `MeetingSummaryRuns` item is created or modified.
2. Apply a trigger condition for `Status = ReadyToPublish`, nonempty `SummaryJson`, and empty `SummaryFileUrl`.
3. Set trigger concurrency to one for the first production release.
4. Re-read the item and its ETag at run start.
5. Revalidate all eligibility fields from the current item, not the trigger payload.
6. If it is no longer eligible, terminate as `Ignored` without changing it.
7. Conditionally update the item from `ReadyToPublish` to `Publishing` using the current ETag.
8. Re-read and verify `Publishing` before creating a file.

Repeated SharePoint events may start runs, but only the run that acquires the status lock may publish.

## Exact summary validation

Parse `SummaryJson` against the same versioned schema used by Flow 03:

- `recap` string;
- `decisions[]` with `decision`, nullable `made_by`, and `evidence`;
- `action_items[]` with `task`, nullable `owner`, nullable `due_date`, and `evidence`;
- `open_questions[]` with `question`, nullable `owner`, and `evidence`; and
- `warnings[]` of strings.

Reject:

- missing or unexpected top-level keys;
- incorrect types;
- missing evidence fields;
- fields exceeding configured limits;
- an oversized JSON or rendered document; and
- unsupported prompt/schema versions.

Invalid input creates no file and ends as `PublicationFailed` with `SUMMARY_JSON_INVALID`.

## Safe HTML rendering

Build one self-contained UTF-8 HTML document.

1. HTML-escape title, dates, organizer metadata, recap, decisions, owners, due dates, evidence, questions, and warnings.
2. Escape `&`, `<`, `>`, double quotes, and single quotes in the correct order.
3. Treat all model text as untrusted content; never inject it into CSS, attributes, script, or raw HTML.
4. Do not include JavaScript, external resources, tracking pixels, or active content.
5. Render empty arrays as `None recorded` instead of empty or malformed tables.
6. Use accessible headings and table headers.
7. Include meeting title, meeting date, meeting ID, generation time, prompt version, and processing-item ID.
8. Do not include the raw transcript, prompts, credentials, or model response envelopes.

Test rendering with HTML/script payloads, Unicode, long values, null owners/dates, and empty arrays.

## Deterministic destination and filename

Create or reuse the monthly folder:

```text
{SummaryRootFolder}/YYYY-MM
```

Use the deterministic filename:

```text
YYYY-MM-DD_<sanitized-title>_<processing-item-id>_Summary.html
```

Requirements:

1. Replace all SharePoint-invalid characters.
2. Remove trailing spaces and periods.
3. Collapse repeated separators.
4. Use `Meeting` if sanitization leaves an empty title.
5. Truncate only the title segment so the item ID and suffix remain intact.
6. Enforce SharePoint filename and full-path limits after encoding.
7. Never use user input as an unvalidated folder path.

The processing-item ID makes publication stable even when titles collide.

## Idempotent file creation

1. Ensure the configured root and monthly folder exist; tolerate an already-existing folder.
2. Look up the deterministic file path before creation.
3. If no file exists, create it with fail-if-exists semantics.
4. If a retry encounters an existing file, read its list metadata.
5. Reuse it only when `ProcessingItemId`, `MeetingId`, and the expected path match the current run.
6. Treat any mismatch as `PUBLICATION_CONFLICT`; never overwrite an unrelated file.
7. After creation or safe reuse, update all required metadata.
8. Read the file/list item back and verify content length is nonzero and metadata matches.
9. Construct the user-facing URL from the verified SharePoint response, not by concatenating an unverified path.

## Metadata contract

Confirm internal names during deployment and populate:

- `MeetingTitle`;
- `EventDate`;
- `MeetingId`;
- `OrganizerEntraUserID` when the library supports it;
- `OrganizerEmail` only when available;
- `GeneratedOn`;
- `ProcessingItemId`; and
- `PromptVersion` when the library supports it.

Metadata failure means publication has not completed, even if the file body exists.

## Finalization

Only after file content, metadata, and URL verification succeed, update `MeetingSummaryRuns`:

- `Status = Published`;
- `SummaryFileUrl` = verified SharePoint URL;
- `ErrorCode` and `ErrorDetails` = empty;
- `ProcessedOn = utcNow()`.

No approval-related fields are read or written for new runs. A later Odoo integration may consume `Published` items, but its failure must not remove the SharePoint document or revert `Published`.

## Failure handling and repair

Use Try/Catch/Finally scopes with phase-specific errors:

| Condition | Error code |
|---|---|
| Invalid summary schema | `SUMMARY_JSON_INVALID` |
| Invalid destination configuration | `PUBLICATION_CONFIG_INVALID` |
| Folder or file creation failure | `SHAREPOINT_PUBLICATION_FAILED` |
| Existing file belongs to another run | `PUBLICATION_CONFLICT` |
| Metadata update/verification failure | `PUBLICATION_METADATA_FAILED` |
| URL verification failure | `PUBLICATION_URL_INVALID` |
| Unexpected failure | `PUBLICATION_FLOW_FAILED` |

On any handled publication failure:

- set `Status = PublicationFailed`;
- keep `SummaryJson` unchanged;
- keep `SummaryFileUrl` empty unless a verified safe URL exists;
- record phase plus correlation ID only in `ErrorDetails`; and
- retain a safe partial file path only if a dedicated field is approved.

Never place summary JSON, transcript content, credentials, access tokens, or full SharePoint responses in error fields.

## Retry procedure

1. Correct the configuration, permissions, library schema, or conflict.
2. Change `PublicationFailed` back to `ReadyToPublish`.
3. Leave `SummaryJson` unchanged.
4. Flow 04 acquires the lock again and checks the deterministic path.
5. It safely reuses a matching partial file or creates the missing file.
6. Flow 02 and Flow 03 are not rerun.

Do not implement unbounded automatic retries by repeatedly modifying the item.

## Test matrix

1. Valid synthetic summary creates one readable HTML file and reaches `Published`.
2. Repeated trigger events create no duplicate file.
3. Two items with the same title produce distinct filenames through item IDs.
4. Empty arrays and null owners/dates render correctly.
5. HTML/script payloads are displayed as text and cannot execute.
6. Malformed, oversized, or wrong-version JSON creates no file.
7. A metadata failure never reaches `Published`.
8. File creation followed by list-update failure is repaired by safe reuse.
9. A conflicting deterministic file is never overwritten.
10. Missing optional organizer email does not block publication.
11. `SummaryFileUrl` is verified and usable.
12. End-to-end: Flow 03 sets `ReadyToPublish`; Flow 04 publishes once without approval.

## Packaging and release

1. Start from the newest tested export containing Flow 03.
2. Preserve component ID `{9bd376e9-cfa0-f111-b8dc-000d3ab04ac1}`.
3. Rename the display name to `ECL-MS-04 - Publish Meeting Summary`.
4. Remove Approvals and approval-only Outlook references from the flow and solution when no other component uses them.
5. Replace hard-coded site, list, library, and folder values with environment/configuration bindings.
6. Package Flow 04 draft/off with only its required SharePoint connection.
7. Test synthetic valid, invalid, duplicate, and partial-file cases before enabling it.
8. Enable only after Flow 03 is producing the frozen schema.
9. Re-export the tested solution as the next baseline.

## Definition of done

- Flow 04 contains no approval action or approval connection.
- Every valid `ReadyToPublish` item produces exactly one SharePoint document.
- `Published` is written only after content, metadata, and URL verification.
- Publication failures can be repaired without rerunning transcript retrieval or the LLM.
- Generated HTML is escaped, accessible, and metadata-complete.
- Missing organizer email does not block the current requirement.
- No transcript, secret, token, or sensitive connector payload is exposed.
