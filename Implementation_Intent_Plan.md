# ECL Meeting Summary - Implementation Intent Plan

## Implementation intent

I intend to implement the project incrementally, starting with a narrow delegated proof of concept and only then expanding into the full Power Automate solution. The goal is to prove the highest-risk path first: a scheduled Teams meeting can be resolved through Microsoft Graph, its transcript can be retrieved and cleaned, and an approved LLM endpoint can return a reliable structured meeting summary.

This approach keeps the first build small, auditable, and safe. It avoids tenant-wide permissions, avoids automatic publishing before review, and gives clear evidence before adding scheduling, approval routing, SharePoint publication, and optional Odoo logging.

## Target outcome

The completed automation will:

- detect completed Teams meetings;
- queue each eligible meeting once in SharePoint;
- resolve the Microsoft Graph online meeting record;
- retrieve the generated transcript;
- clean the WebVTT transcript while preserving speaker attribution;
- send transcript chunks to the selected LLM endpoint;
- produce structured JSON with recap, decisions, action items, open questions, and warnings;
- route the draft summary to the organiser for approval;
- publish the approved summary to SharePoint; and
- optionally log the approved summary in Odoo.

## Guiding principles

- Start with delegated access for the organiser's own scheduled test meetings.
- Use the MCP only as a read-only validation aid for Graph identity, meeting lookup, and transcript retrieval.
- Build the production orchestration in Power Automate, not in a hosted agent or Copilot Studio.
- Store secrets in Azure Key Vault or another approved secret store.
- Use Azure OpenAI for client or citizen data unless governance explicitly approves another route.
- Require human approval before any summary is published or logged externally.
- Keep raw transcript retention minimal and avoid exposing secrets or transcript content in logs.

## Phase 1 - Confirm access and project boundaries

First, I will confirm the implementation environment and the least-privilege access needed for the proof of concept.

Actions:

- Confirm the Power Platform test environment.
- Confirm the Microsoft 365 organiser identity for the POC.
- Confirm the scheduled Teams test meeting and ensure transcription is enabled.
- Confirm the SharePoint site where processing records and summaries will live.
- Confirm the approved LLM endpoint, model deployment, and secret-store location.
- Confirm whether Odoo logging is out of scope for the first release.

Evidence required:

- The organiser identity is known.
- A scheduled test meeting exists.
- Transcript generation is enabled.
- The target SharePoint site and library names are known.
- The selected LLM route is approved for the data being processed.

## Phase 2 - Validate delegated Graph access with MCP

Before building the Power Automate connector, I will use the read-only MCP helper to validate the Graph path with delegated access.

MCP capabilities to use:

- `begin_delegated_sign_in`
- `complete_delegated_sign_in`
- `get_current_user`
- `resolve_meeting_by_join_url`
- `list_meeting_transcripts`
- `get_transcript_vtt`

Actions:

- Sign in using the organiser's delegated Microsoft identity.
- Verify the current user returned by Graph.
- Resolve one scheduled Teams meeting from its join URL.
- List transcripts for that meeting after the configured delay.
- Retrieve one transcript as WebVTT.
- Confirm that the returned content includes usable transcript text.

Acceptance criteria:

- Delegated sign-in succeeds.
- The Graph user matches the expected organiser.
- One scheduled meeting resolves from its join URL.
- At least one transcript is listed after the retry window.
- The transcript content can be retrieved as VTT.

This phase proves the Graph boundary before time is spent building the custom connector and flows.

## Phase 3 - Create the Power Platform foundation

Once the Graph path is validated, I will create the Power Platform foundation for the implementation.

Actions:

- Create a Power Platform solution named `ECL Meeting Summary`.
- Add connection references for Office 365 Outlook, SharePoint, Approvals, Azure Key Vault, HTTP, and the Microsoft Graph custom connector.
- Create environment variables for Graph, transcript retries, chunk size, LLM endpoint, Key Vault, prompt version, SharePoint site, processing list, and summary library.
- Create the SharePoint list `MeetingSummaryRuns`.
- Create the SharePoint document library `Meeting Summaries`.

Key SharePoint list purpose:

- Work queue.
- Duplicate-prevention register.
- Audit trail.
- Processing status tracker.

Core statuses:

- `Queued`
- `ResolvingMeeting`
- `WaitingForTranscript`
- `TranscriptReady`
- `Summarising`
- `PendingApproval`
- `Approved`
- `RevisionRequested`
- `Rejected`
- `TranscriptUnavailable`
- `Failed`

Acceptance criteria:

- The solution exists.
- Environment variables are configured.
- SharePoint processing and output locations exist.
- No secrets are stored directly in SharePoint or flow definitions.

## Phase 4 - Build the Microsoft Graph custom connector

I will then create the custom connector used by Power Automate to call Microsoft Graph.

Connector name:

```text
ECL Microsoft Graph Meetings
```

Base configuration:

```text
Scheme: HTTPS
Host: graph.microsoft.com
Base URL: /v1.0
Authentication: OAuth 2.0 with Microsoft Entra ID
```

Actions:

- `ResolveMeeting`: `GET /me/onlineMeetings`
- `ListTranscripts`: `GET /me/onlineMeetings/{meetingId}/transcripts`
- `GetTranscriptContent`: `GET /me/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content`

Acceptance criteria:

- The connector authenticates as the delegated organiser.
- The connector can resolve the same meeting proven through MCP.
- The connector can retrieve VTT transcript content.

## Phase 5 - Build the transcript retrieval flow

The first Power Automate flow I will build is the transcript retrieval slice, because it proves the main business value without scheduling or publication.

Flow:

```text
ECL-MS-02 - Retrieve Teams Transcript
```

Actions:

- Trigger from a manually created or queued SharePoint item.
- Update status to `ResolvingMeeting`.
- Resolve the meeting from the Teams join URL.
- Store the Graph meeting ID.
- Retry transcript lookup using configured delay and maximum attempts.
- Retrieve transcript content as WebVTT.
- Strip VTT headers, timestamps, metadata, and blank lines.
- Preserve speaker attribution and spoken content.
- Update the processing item with transcript metadata and status.

Acceptance criteria:

- One queued test meeting reaches `TranscriptReady`.
- Attempt count is updated during retries.
- Missing transcripts end cleanly as `TranscriptUnavailable`.
- Errors are captured with `ErrorCode`, `ErrorDetails`, and `ProcessedOn`.

## Phase 6 - Build the reusable summarisation flow

Next, I will build summarisation as a reusable child flow so it can later process other text sources, not just Teams transcripts.

Flow:

```text
ECL-MS-03 - Summarise Text
```

Inputs:

- Source type
- Source ID
- Title
- Event date
- Organiser email
- Participants
- Content text
- Speaker availability
- Prompt version

Actions:

- Retrieve the LLM secret from Key Vault with secure inputs and outputs enabled.
- Estimate token size from transcript length.
- Split long transcripts into chunks by speaker lines.
- Summarise each chunk using the same prompt and JSON schema.
- Run a final synthesis pass when multiple chunks exist.
- Validate that the final response is structured JSON.

Required output schema:

- `recap`
- `decisions`
- `action_items`
- `open_questions`
- `warnings`

Rules:

- Do not invent owners.
- Do not invent due dates.
- Use `null` when owner or due date is unknown.
- Include evidence for decisions and action items.
- Preserve uncertainty, unresolved questions, and contradictions.

Acceptance criteria:

- Short test content returns valid JSON.
- Long content is chunked and recombined correctly.
- The model response does not invent facts.
- LLM request and response details are protected from unsafe logging.

## Phase 7 - Connect transcript retrieval to summarisation

After both pieces work independently, I will connect Flow 02 to Flow 03.

Actions:

- Pass cleaned transcript text from Flow 02 to Flow 03.
- Store the returned `SummaryJson` in `MeetingSummaryRuns`.
- Set the processing item status to `PendingApproval`.
- Store chunk count and prompt version where useful for auditing.

Acceptance criteria:

- A scheduled test meeting produces structured summary JSON.
- The summary is visible for review in the processing record or run history.
- No summary is automatically published yet.

## Phase 8 - Add approval and SharePoint publication

Once the summary is reliable, I will add the human review gate and publication path.

Flow:

```text
ECL-MS-04 - Approve and Publish Summary
```

Actions:

- Trigger when a processing item reaches `PendingApproval` and approval has not started.
- Mark `ApprovalStarted = Yes`.
- Parse the summary JSON.
- Build readable approval text.
- Send approval to the meeting organiser.
- On approval, create an HTML summary file in `Meeting Summaries`.
- Update the processing record with approver, outcome, approval date, and SharePoint file URL.
- On request changes, set status to `RevisionRequested`.
- On rejection, set status to `Rejected`.

Acceptance criteria:

- Nothing is published before approval.
- Approved summaries are saved to SharePoint.
- Rejected summaries are not published.
- Revision requests require a new approval cycle before publication.

## Phase 9 - Add the scheduled dispatcher

After the manual end-to-end test works, I will add the scheduled dispatcher.

Flow:

```text
ECL-MS-01 - Dispatch Completed Meetings
```

Actions:

- Run every 15 minutes in the Africa/Nairobi time zone.
- Query Outlook calendar events in a safe completed-meeting window.
- Filter for eligible Teams meetings with join URLs.
- Confirm the organiser matches the delegated Graph connection user.
- Check SharePoint for an existing item with the same event ID.
- Create one new `Queued` processing item for each unprocessed meeting.

Acceptance criteria:

- A completed scheduled Teams meeting creates exactly one queued item.
- Duplicate events are not queued again.
- Only eligible Teams meetings are processed.

## Phase 10 - Harden, test, and prepare for release

Before production use, I will strengthen reliability, observability, and governance.

Actions:

- Add consistent `Scope - Try`, `Scope - Catch`, and `Scope - Finally` handling.
- Add retry policy for Graph, LLM, SharePoint, and optional Odoo transient failures.
- Avoid retrying permission failures, authentication failures, invalid input, or rejected approvals.
- Confirm secure inputs and outputs are enabled for Key Vault, transcript retrieval, LLM calls, and Odoo authentication.
- Test with multiple scheduled meetings and at least one longer transcript.
- Confirm duplicate prevention by `EventId`, and later by `MeetingId + TranscriptId`.
- Document run evidence and known limitations.

Acceptance criteria:

- The complete manual workflow succeeds.
- The scheduled workflow succeeds.
- Failure states are visible and actionable.
- Secrets are not exposed.
- Approval remains mandatory before publication.

## Phase 11 - Optional Odoo logging

Odoo should remain disabled until the main pipeline is stable.

Flow:

```text
ECL-MS-05 - Log Approved Summary in Odoo
```

Actions:

- Retrieve Odoo credentials from Key Vault.
- Authenticate with the Odoo service user.
- Post the approved summary as an internal note on the relevant CRM record.
- Return success or failure to the approval flow.

Acceptance criteria:

- Only approved summaries are sent to Odoo.
- Odoo failures do not erase the SharePoint summary.
- No production Odoo writes happen during the POC.

## Release path

The release path should be:

1. Delegated MCP validation.
2. Manual Power Automate proof of concept.
3. Manual end-to-end run with approval.
4. Scheduled dispatcher in test.
5. Security and governance review.
6. Production deployment approval.
7. Optional Odoo integration.
8. Decision on whether application-level access is required.

## First milestone

The first milestone is deliberately small:

```text
Scheduled Teams test meeting
  -> delegated Graph authentication works
  -> meeting resolves from join URL
  -> transcript VTT is retrieved
  -> transcript is cleaned
  -> LLM returns valid structured JSON
  -> summary is reviewed manually
```

Only after this succeeds reliably should approval, SharePoint publication, scheduling, and optional Odoo logging be added.
