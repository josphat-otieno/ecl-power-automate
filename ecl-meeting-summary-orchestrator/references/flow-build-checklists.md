# Flow build checklists

Use the smallest checklist that matches the current implementation task. Keep every step independently verifiable from Power Automate run history, SharePoint state, or a synthetic fixture.

## Shared setup

- Create the `ECL Meeting Summary` solution before creating flows.
- Use connection references for Outlook, SharePoint, Approvals, Azure Key Vault, HTTP, and the Microsoft Graph custom connector.
- Use environment variables for URLs, retry settings, chunk size, model deployment, prompt version, list names, and library names.
- Keep secrets in Key Vault or another approved secret store. Never paste secret values into flow actions, prompts, run notes, or SharePoint fields.
- Use `Scope - Try`, `Scope - Catch`, and `Scope - Finally` in flows that call Graph, the LLM endpoint, SharePoint publication, or Odoo.

## Flow 01 - Dispatch completed meetings

- Trigger manually for the first POC; move to recurrence only after the manual run passes.
- Query Outlook calendar view for the configured time window.
- Filter to Teams online meetings with a join URL and the delegated organiser identity.
- Use SharePoint `Get items` to detect an existing `EventId`.
- Create exactly one `MeetingSummaryRuns` item per eligible meeting.
- Initial status must be `Queued`, `AttemptCount` must be `0`, and `ApprovalStarted` must be `No`.

## Flow 02 - Retrieve and clean transcript

- Update the item to `ResolvingMeeting` before calling Graph.
- Resolve `/me/onlineMeetings` with the exact join URL filter.
- Store `MeetingId` only after one matching meeting is found.
- Retry transcript listing with configured delay and maximum attempts.
- If unavailable after retries, set `Status = TranscriptUnavailable` and `ErrorCode = TRANSCRIPT_NOT_READY`.
- Fetch transcript content as `text/vtt`.
- Convert base64 content only when the connector returns a `$content` envelope.
- Remove VTT headers, timestamp lines, blank lines, `NOTE`, `Kind:`, and `Language:` metadata.
- Preserve speaker attribution and utterance order.

## Flow 03 - Chunk and summarise

- Set status to `Summarising` before the first LLM call.
- Chunk by configured character limit, preferably at speaker-turn or newline boundaries.
- Include prompt version, schema instruction, and source chunk index in each request.
- Require JSON output with recap, decisions, action items, open questions, and warnings.
- Reject invalid JSON, missing required sections, or summaries that invent owners or due dates.
- Merge chunk summaries into a final structured summary.
- Store only the required summary/audit output in SharePoint.

## Flow 04 - Request approval and publish

- Set `ApprovalStarted = Yes` and `Status = PendingApproval` when approval begins.
- Include source meeting metadata, generated summary, warnings, and a link to the processing item.
- On approval, publish to the configured SharePoint library and set `Status = Approved`.
- On revision request, set `Status = RevisionRequested` and preserve approver comments.
- On rejection, set `Status = Rejected` and preserve approver comments.
- Do not publish automatically before human approval.

## Optional Flow 05 - Log approved summary in Odoo

- Enable only after approval from the Odoo owner.
- Trigger only from `Status = Approved`.
- Write only the minimum agreed fields.
- Store the Odoo response ID or URL in the processing record.
- If Odoo fails, do not roll back the approved SharePoint publication unless a human instructs it.

## Catch and finally pattern

- Catch scope records `Status = Failed`, an `ErrorCode`, and useful sanitized `ErrorDetails`.
- Avoid raw tokens, secrets, full transcript dumps, or client-sensitive excerpts in error details.
- Finally scope updates `ProcessedOn` when the flow reaches a terminal state.
