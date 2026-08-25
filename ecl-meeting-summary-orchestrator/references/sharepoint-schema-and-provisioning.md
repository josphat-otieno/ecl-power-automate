# SharePoint schema and provisioning

Purpose
- Define the complete data contract, column schemas, state transition rules, indexing requirements, and provisioning steps for the two SharePoint components supporting the ECL Meeting Summary automation:
  1. **`MeetingSummaryRuns`** (Processing Work Queue, Deduplication Register, and Audit Trail List)
  2. **`Meeting Summaries`** (Published Document Library)

---

## 1. `MeetingSummaryRuns` List Specification

### Purpose
Acts as the central work coordinator across Flows 01–05, storing run status, Graph meeting IDs, generated JSON summaries, approval outcomes, and audit logs.

### Complete Column Definitions

| Column Internal Name | Display Name | Field Type | Required | Choices / Format / Default | Description |
|---|---|---|---|---|---|
| `Title` | Title | Single line of text | Yes | Default SharePoint field | Meeting subject / title. |
| `EventId` | Event ID | Single line of text | Yes | Unique (Indexed) | Outlook calendar event ID (used for idempotency in Flow 01). |
| `SourceType` | Source Type | Choice | Yes | `TeamsTranscript`, `ManualUpload`, `DirectAudio` (Default: `TeamsTranscript`) | Origin of the meeting audio/transcript. |
| `JoinUrl` | Join URL | Multiple lines (Plain text) | Yes | Plain text | Full Microsoft Teams meeting join URL. |
| `OrganizerEmail` | Organizer Email | Single line of text | Yes | Email format | Email address of the meeting organizer. |
| `OrganizerUserId` | Organizer Entra User ID | Single line of text | Yes | GUID | Organizer user object ID used by the application-authenticated Graph path. Never use the app registration object ID here. |
| `MeetingStart` | Meeting Start | Date and Time | Yes | ISO 8601 (Date & Time) | Scheduled meeting start time (UTC). |
| `MeetingEnd` | Meeting End | Date and Time | Yes | ISO 8601 (Date & Time) | Scheduled meeting end time (UTC). |
| `MeetingId` | Meeting ID | Single line of text | No | String | Microsoft Graph online meeting ID resolved by Flow 02. |
| `TranscriptId` | Transcript ID | Single line of text | No | String | Microsoft Graph transcript ID retrieved by Flow 02. |
| `Status` | Status | Choice | Yes | See Status Values below (Indexed) | Current processing stage of the meeting. |
| `AttemptCount` | Attempt Count | Number | Yes | Integer (Default: `0`) | Number of retry attempts for transcript retrieval. |
| `SummaryJson` | Summary JSON | Multiple lines (Plain text) | No | JSON string | Structured JSON output produced by Flow 03. |
| `ApprovalStarted` | Approval Started | Choice or Yes/No | Yes | `No`, `Yes` (Default: `No`) | Guard flag to prevent duplicate approval requests in Flow 04. |
| `ApprovalOutcome` | Approval Outcome | Choice or Single line | No | `Approve`, `Request changes`, `Reject` | Final human decision recorded by Flow 04. |
| `ApprovalComments` | Approval Comments | Multiple lines (Plain text) | No | Text | Approver comments or feedback. |
| `ApprovedBy` | Approved By | Single line of text | No | Email / Name | Responder display name / email. |
| `ApprovedOn` | Approved On | Date and Time | No | ISO 8601 (Date & Time) | Timestamp when approval was submitted. |
| `SummaryFileUrl` | Summary File URL | Single line of text | No | URL / Path | Relative or absolute URL to published document in SharePoint. |
| `PromptVersion` | Prompt Version | Single line of text | Yes | String (e.g. `meeting-summary-v1`) | Version of prompt used to generate summary. |
| `ErrorCode` | Error Code | Single line of text | No | String (e.g. `TRANSCRIPT_NOT_READY`) | Sanitized error classification if flow failed. |
| `ErrorDetails` | Error Details | Multiple lines (Plain text) | No | Text | Sanitized diagnostic details (no secrets or raw PII). |
| `ProcessedOn` | Processed On | Date and Time | No | ISO 8601 (Date & Time) | Timestamp when the item reached a terminal state. |

---

## 2. State Machine Lifecycle Matrix

The `Status` column governs flow triggers and handoffs across the pipeline:

```text
[Flow 01]
   └─► Queued
          │
[Flow 02] ├─► ResolvingMeeting ──► TranscriptReady
          │         │                      │
          │         └─► (Retries) ─► TranscriptUnavailable (Terminal)
          │
[Flow 03] └─► Summarising ───────► PendingApproval
                                           │
[Flow 04] ┌────────────────────────────────┴──────────────────────────────┐
          ▼                                ▼                              ▼
       Approved                    RevisionRequested                   Rejected
      (Terminal)                       (Actionable)                   (Terminal)
          │
[Flow 05] └─► (Optional Odoo Write)
```

### Complete Status Value Reference

| Status Value | Stage / Flow | Description |
|---|---|---|
| `Queued` | Flow 01 (Dispatcher) | Initial state created by calendar query. Ready for Flow 02. |
| `ResolvingMeeting` | Flow 02 (Transcript) | Graph meeting ID lookup in progress. |
| `WaitingForTranscript` | Flow 02 (Transcript) | Waiting for delayed Teams transcript generation (retry loop). |
| `TranscriptReady` | Flow 02 (Transcript) | VTT retrieved, cleaned, and verified. Ready for Flow 03. |
| `Summarising` | Flow 03 (Summarisation) | LLM chunking, prompting, and schema merging in progress. |
| `PendingApproval` | Flow 03 $\rightarrow$ Flow 04 | Valid `SummaryJson` stored; waiting for Flow 04 approval trigger. |
| `Approved` | Flow 04 (Approval) | Human approved. Summary published to SharePoint document library. |
| `RevisionRequested` | Flow 04 (Approval) | Approver requested edits. `ApprovalComments` populated. |
| `Rejected` | Flow 04 (Approval) | Approver rejected summary. No document published. |
| `TranscriptUnavailable`| Flow 02 (Error) | Transcript not ready after max configured retry attempts. |
| `Failed` | Any Flow | Unrecoverable error occurred; `ErrorCode` and `ErrorDetails` populated. |

---

## 3. `Meeting Summaries` Document Library Specification

### Storage Pattern
Published meeting summary documents (HTML, Markdown, or PDF) are stored in monthly subfolders to maintain clean partitioning:

```text
/Meeting Summaries/
  └── YYYY-MM/
        └── YYYY-MM-DD_Meeting_Title_Summary.html
```

### Document Library Columns

| Column Name | Internal Name | Type | Description |
|---|---|---|---|
| `MeetingTitle` | `MeetingTitle` | Single line of text | Title of the meeting. |
| `EventDate` | `EventDate` | Date and Time | Date the meeting occurred. |
| `OrganizerEmail` | `OrganizerEmail` | Single line of text | Meeting organizer. |
| `MeetingId` | `MeetingId` | Single line of text | Microsoft Graph online meeting ID. |
| `ApprovedBy` | `ApprovedBy` | Single line of text | Approver identity. |
| `ApprovedOn` | `ApprovedOn` | Date and Time | Approval timestamp. |

---

## 4. Performance & Indexing Guidelines

In the SharePoint List Settings (`MeetingSummaryRuns` $\rightarrow$ **Indexed columns**):
1. **Index `EventId`:** Crucial for fast OData filtering (`EventId eq '...'`) in Flow 01 to prevent performance degradation as list size grows past 5,000 items.
2. **Index `Status`:** Speeds up view filtering and Flow 04 trigger conditions.
3. **Index `MeetingStart`:** Optimizes date range queries and archiving views.

---

## 5. Security & Data Protection Guardrails

- **No Secrets:** Never store API keys, client secrets, bearer tokens, or raw authentication credentials in SharePoint columns.
- **Sanitized Error Details:** Ensure `ErrorDetails` strips bearer tokens, passwords, and sensitive client PII before storing.
- **Access Control:** Grant read/write access to the Power Automate service principal / connection identity and least-privilege view access to team reviewers.
