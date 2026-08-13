# ECL Meeting Summary – Power Automate Implementation Plan

## Revised architecture

This version contains **no separately hosted agent and no Copilot Studio**. Power Automate performs all orchestration and calls the selected LLM endpoint directly.

```text
Flow 01 – Find completed meetings
                ↓
Flow 02 – Retrieve and clean transcript
                ↓
Flow 03 – Chunk and summarise through LLM endpoint
                ↓
Flow 04 – Request approval and publish
                ↓
Optional Flow 05 – Log approved summary in Odoo
```

The architecture follows the handoff design:

- Teams captures the transcript.
- Power Automate triggers and fetches the transcript.
- The selected LLM produces the summary.
- Power Automate routes the result for approval and storage.

---

# 1. Prepare the Power Platform solution

Create one Power Platform solution:

```text
ECL Meeting Summary
```

Create all flows inside this solution so reusable child flows can be called from parent flows.

## Connection references

Create connection references for:

- Office 365 Outlook
- SharePoint
- Approvals
- Azure Key Vault
- HTTP
- Microsoft Graph custom connector

## Environment variables

Create these environment variables:

| Variable | Example |
|---|---|
| `GraphBaseUrl` | `https://graph.microsoft.com/v1.0` |
| `TranscriptInitialDelayMinutes` | `15` |
| `TranscriptRetryDelayMinutes` | `5` |
| `TranscriptMaximumAttempts` | `4` |
| `TranscriptChunkMaximumCharacters` | `20000` |
| `LlmEndpoint` | Azure OpenAI / Claude endpoint |
| `LlmModelDeployment` | Model or deployment name |
| `LlmSecretName` | `meeting-summary-llm-key` |
| `KeyVaultName` | Your Key Vault |
| `PromptVersion` | `meeting-summary-v1` |
| `SharePointSiteUrl` | Elewa SharePoint site |
| `ProcessingListName` | `MeetingSummaryRuns` |
| `SummaryLibraryName` | `Meeting Summaries` |

Treat `TranscriptChunkMaximumCharacters` as an initial configurable value and tune it after testing the selected model.

---

# 2. Create the SharePoint processing list

Create a SharePoint list named:

```text
MeetingSummaryRuns
```

Use it as a work queue, duplicate-prevention register, and audit trail.

## Recommended columns

| Column | Type |
|---|---|
| `Title` | Single line |
| `EventId` | Single line |
| `SourceType` | Choice |
| `JoinUrl` | Multiple lines / Hyperlink |
| `OrganizerEmail` | Single line |
| `MeetingStart` | Date and time |
| `MeetingEnd` | Date and time |
| `MeetingId` | Single line |
| `TranscriptId` | Single line |
| `Status` | Choice |
| `AttemptCount` | Number |
| `SummaryJson` | Multiple lines |
| `ApprovalStarted` | Yes/No |
| `ApprovalOutcome` | Single line |
| `ApprovalComments` | Multiple lines |
| `ApprovedBy` | Single line |
| `ApprovedOn` | Date and time |
| `SummaryFileUrl` | Hyperlink |
| `PromptVersion` | Single line |
| `ErrorCode` | Single line |
| `ErrorDetails` | Multiple lines |
| `ProcessedOn` | Date and time |

Recommended `Status` values:

```text
Queued
ResolvingMeeting
WaitingForTranscript
TranscriptReady
Summarising
PendingApproval
Approved
RevisionRequested
Rejected
TranscriptUnavailable
Failed
```

Do not store API keys or raw authentication tokens in SharePoint.

---

# 3. Configure Teams and Microsoft Graph

A Teams administrator should enable transcript API access and speaker attribution.

Suggested path:

```text
Teams admin center
→ Meetings
→ Meeting settings
→ Transcript API access
→ Microsoft Graph access: On
→ Include speaker attribution: On
```

For the delegated proof of concept, configure the Entra application with:

```text
OnlineMeetings.Read
OnlineMeetingTranscript.Read.All
```

## Microsoft Graph custom connector

Create a connector named:

```text
ECL Microsoft Graph Meetings
```

General settings:

```text
Scheme: HTTPS
Host: graph.microsoft.com
Base URL: /v1.0
```

Security:

```text
Authentication: OAuth 2.0
Identity provider: Microsoft Entra ID
Client ID: <Entra application ID>
Client secret: <Entra client secret>
Login URL: https://login.microsoftonline.com
Tenant: <tenant ID>
Resource URL: https://graph.microsoft.com
```

Create these actions:

### `ResolveMeeting`

```http
GET /me/onlineMeetings
```

Query parameter:

```text
$filter
```

### `ListTranscripts`

```http
GET /me/onlineMeetings/{meetingId}/transcripts
```

### `GetTranscriptContent`

```http
GET /me/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content
```

Header:

```text
Accept: text/vtt
```

---

# Flow 01 — Dispatch completed Teams meetings

## Name

```text
ECL-MS-01 – Dispatch Completed Meetings
```

## Purpose

Find eligible Teams meetings that ended sufficiently long ago and add each unprocessed meeting to the SharePoint processing queue.

For the first proof of concept, a manual trigger can be used instead of a scheduled trigger.

## Actions

### 1. Trigger: `Recurrence`

Recommended:

```text
Frequency: Minute
Interval: 15
Time zone: Africa/Nairobi
```

### 2. Compose: `WindowStart`

```powerautomate
addMinutes(utcNow(), -90)
```

### 3. Compose: `WindowEnd`

Subtract the configured transcript delay from the current time.

Example:

```powerautomate
addMinutes(utcNow(), -15)
```

### 4. Outlook: `Get calendar view of events (V3)`

Configure:

```text
Calendar ID: Calendar
Start time: WindowStart
End time: WindowEnd
Top Count: 100
```

### 5. Filter eligible meetings

Keep:

- online meetings;
- Teams meetings;
- meetings with a join URL;
- meetings organised by the delegated Graph connection user.

### 6. `Apply to each`

For each meeting:

#### 6.1 SharePoint: `Get items`

Look for an existing record using the event ID.

#### 6.2 Condition: already queued?

If no matching item exists, continue.

#### 6.3 SharePoint: `Create item`

Set:

```text
Title              = meeting subject
EventId            = Outlook event ID
SourceType         = TeamsTranscript
JoinUrl            = Teams join URL
OrganizerEmail     = organiser email
MeetingStart       = meeting start
MeetingEnd         = meeting end
Status             = Queued
ApprovalStarted    = No
AttemptCount       = 0
PromptVersion      = meeting-summary-v1
```

## Success criterion

A scheduled Teams meeting creates exactly one processing item with status `Queued`.

---

# Flow 02 — Retrieve and clean the Teams transcript

## Name

```text
ECL-MS-02 – Retrieve Teams Transcript
```

## Trigger

SharePoint:

```text
When an item is created
```

List:

```text
MeetingSummaryRuns
```

Run only when:

```text
SourceType = TeamsTranscript
Status = Queued
```

## Recommended structure

```text
Scope – Try
Scope – Catch
Scope – Finally
```

---

## Scope — Try

### 1. SharePoint: Update item

```text
Status = ResolvingMeeting
```

### 2. Graph connector: `ResolveMeeting`

Use:

```powerautomate
concat(
  'JoinWebUrl eq ''',
  triggerBody()?['JoinUrl'],
  ''''
)
```

as the `$filter`.

### 3. Check whether the meeting was found

```powerautomate
greater(
  length(body('ResolveMeeting')?['value']),
  0
)
```

If no meeting is found:

```text
Status = Failed
ErrorCode = MEETING_NOT_FOUND
```

Then terminate.

### 4. Compose: `MeetingId`

```powerautomate
first(body('ResolveMeeting')?['value'])?['id']
```

### 5. Update SharePoint item

```text
MeetingId = MeetingId
Status = WaitingForTranscript
```

### 6. Initialise variables

```text
vTranscriptFound   Boolean  false
vTranscriptId      String   ''
vAttemptCount      Integer  0
```

### 7. `Do until` transcript is available

Stop when:

```powerautomate
or(
  equals(variables('vTranscriptFound'), true),
  greaterOrEquals(variables('vAttemptCount'), 4)
)
```

Inside:

1. Call `ListTranscripts`.
2. If a transcript exists:
   - store the transcript ID;
   - set `vTranscriptFound = true`.
3. Otherwise:
   - increment attempt count;
   - update SharePoint;
   - delay 5 minutes.

### 8. Handle transcript unavailable

If still not found:

```text
Status = TranscriptUnavailable
ErrorCode = TRANSCRIPT_NOT_READY
```

Then stop gracefully.

### 9. Graph connector: `GetTranscriptContent`

```text
meetingId: MeetingId
transcriptId: vTranscriptId
Accept: text/vtt
```

Optional fallback if speaker attribution is unavailable:

```text
Accept: application/vnd.microsoft.graph.transcript+text
```

### 10. Compose raw transcript text

If the connector returns a normal string, use the response body directly.

If it returns base64 content:

```powerautomate
base64ToString(
  body('GetTranscriptContent')?['$content']
)
```

### 11. Split transcript into lines

```powerautomate
split(
  replace(
    outputs('TranscriptRawText'),
    decodeUriComponent('%0D'),
    ''
  ),
  decodeUriComponent('%0A')
)
```

### 12. Filter VTT metadata

Remove:

- blank lines;
- `WEBVTT`;
- timestamp lines containing `-->`;
- `NOTE`;
- `Kind:`;
- `Language:`.

Keep speaker tags and actual utterances.

Example filter condition:

```powerautomate
@and(
  not(empty(trim(item()))),
  not(equals(trim(item()), 'WEBVTT')),
  not(contains(item(), '-->')),
  not(startsWith(trim(item()), 'NOTE')),
  not(startsWith(trim(item()), 'Kind:')),
  not(startsWith(trim(item()), 'Language:'))
)
```

### 13. Compose: `CleanTranscript`

```powerautomate
join(
  body('Filter_array'),
  decodeUriComponent('%0A')
)
```

### 14. Update processing record

```text
TranscriptId = vTranscriptId
Status = TranscriptReady
```

### 15. `Run a Child Flow`

Call:

```text
ECL-MS-03 – Summarise Text
```

Inputs:

```text
SourceType
SourceId
Title
EventDate
OrganizerEmail
Participants
ContentText
HasSpeakers
PromptVersion
```

### 16. Store result

```text
SummaryJson = child flow result
Status = PendingApproval
ProcessedOn = utcNow()
```

---

## Scope — Catch

When `Try` fails or times out:

1. Capture:

```powerautomate
result('Scope_-_Try')
```

2. Update the processing record:

```text
Status = Failed
ErrorCode = PROCESSING_FAILED
ErrorDetails = error result
ProcessedOn = utcNow()
```

3. Notify the technical owner.

---

# Flow 03 — Chunk and summarise text through the LLM

## Name

```text
ECL-MS-03 – Summarise Text
```

## Purpose

Reusable AI-processing flow for meeting transcripts and future text inputs such as emails.

## Inputs

```text
SourceType
SourceId
Title
EventDate
OrganizerEmail
Participants
ContentText
HasSpeakers
PromptVersion
```

## Outputs

```text
SummaryJson
ChunkCount
PromptVersion
```

---

## Actions

### 1. Key Vault: Get LLM secret

Retrieve:

```text
meeting-summary-llm-key
```

Enable:

```text
Secure Inputs
Secure Outputs
```

### 2. Initialise variables

```text
vChunks             Array    []
vCurrentChunk       String   ''
vPartialSummaries   Array    []
vChunkNumber        Integer  0
```

### 3. Estimate tokens

```powerautomate
div(length(triggerBody()?['ContentText']), 4)
```

### 4. Check whether chunking is required

Compare transcript length against:

```text
TranscriptChunkMaximumCharacters
```

If below the threshold:

```text
vChunks = [ContentText]
```

If above the threshold:

### 4.1 Split by lines

```powerautomate
split(
  replace(
    triggerBody()?['ContentText'],
    decodeUriComponent('%0D'),
    ''
  ),
  decodeUriComponent('%0A')
)
```

### 4.2 Build chunks

For each line, create:

```powerautomate
if(
  empty(variables('vCurrentChunk')),
  item(),
  concat(
    variables('vCurrentChunk'),
    decodeUriComponent('%0A'),
    item()
  )
)
```

If the candidate chunk exceeds the configured maximum:

1. append `vCurrentChunk` to `vChunks`;
2. start a new current chunk with the present line.

Otherwise update `vCurrentChunk`.

After the loop, append the final chunk.

---

# 5. Define the LLM output schema

Use structured JSON output.

```json
{
  "recap": [
    "Summary point"
  ],
  "decisions": [
    {
      "decision": "Decision made",
      "evidence": "Supporting transcript wording",
      "confidence": "high"
    }
  ],
  "action_items": [
    {
      "action": "Task",
      "owner": null,
      "due_date": null,
      "evidence": "Supporting transcript wording",
      "confidence": "medium"
    }
  ],
  "open_questions": [
    "Unresolved question"
  ],
  "warnings": [
    "Owner was not explicitly assigned"
  ]
}
```

Rules:

- Never invent owners.
- Never invent deadlines.
- Return `null` when owner or due date is unknown.
- Only include decisions actually made.
- Include supporting evidence.
- Preserve uncertainty or contradictions.

---

# 6. Summarise every chunk

Use an `Apply to each` over `vChunks`.

For each chunk:

### 6.1 Increment `vChunkNumber`

### 6.2 Build prompt

Example:

```text
Analyse the supplied meeting content.

Meeting title: <Title>
Meeting date: <EventDate>
Organizer: <OrganizerEmail>
Participants: <Participants>
Chunk: <current> of <total>

Requirements:
1. Produce three to five concise recap points.
2. Extract only decisions that were actually made.
3. Extract action items only when supported by the transcript.
4. Never invent an owner or deadline.
5. Return null when an owner or due date was not explicitly stated.
6. Include short supporting evidence for each decision and action.
7. Preserve unresolved questions and contradictions.
8. This may be one part of a larger meeting.

Content:
<chunk>
```

### 6.3 HTTP: Call selected LLM

```text
Method: POST
URI: LlmEndpoint
Content-Type: application/json
Authentication/API key: retrieved from Key Vault
```

For Azure OpenAI, use the configured deployment/model and structured JSON output.

Turn on Secure Inputs and Secure Outputs.

Use exponential retry for:

- HTTP 429;
- HTTP 5xx;
- temporary timeouts.

### 6.4 Parse chunk result

Convert the returned JSON text to an object.

### 6.5 Append result

Append the object to:

```text
vPartialSummaries
```

---

# 7. Final synthesis

If there is only one chunk, use its summary directly.

If there are multiple chunks, call the LLM one more time.

## Final prompt

```text
Combine the partial meeting analyses below into one authoritative meeting summary.

Requirements:
1. Deduplicate repeated recap points, decisions and action items.
2. Do not invent new information.
3. Preserve null owners and deadlines when not explicit.
4. Preserve conflicts in warnings.
5. Do not treat proposals as decisions.
6. Produce three to five final recap points.
7. Return only the required structured JSON.

Partial analyses:
<partial summaries>
```

Parse and validate the final structured JSON.

### Respond to parent flow

Return:

```text
SummaryJson
ChunkCount
PromptVersion
```

---

# Flow 04 — Approval and SharePoint publication

## Name

```text
ECL-MS-04 – Approve and Publish Summary
```

## Trigger

SharePoint:

```text
When an item is created or modified
```

Run only when:

```text
Status = PendingApproval
ApprovalStarted = No
```

## Actions

### 1. Update item

Immediately set:

```text
ApprovalStarted = Yes
```

### 2. Parse `SummaryJson`

Extract:

- recap;
- decisions;
- action items;
- open questions;
- warnings.

### 3. Build approval text

Example:

```text
Meeting recap
- ...

Decisions
- ...

Action items
- Action: ...
  Owner: ...
  Due: ...

Open questions
- ...

Warnings
- ...
```

### 4. Start approval

Use:

```text
Start and wait for an approval
```

Responses:

```text
Approve
Request changes
Reject
```

Assigned to:

```text
OrganizerEmail
```

---

## Approval outcome: Approve

1. Build an HTML summary.
2. Create the file in:

```text
Meeting Summaries
```

3. Update the processing record:

```text
Status = Approved
ApprovalOutcome = Approve
ApprovedBy = responder
ApprovedOn = utcNow()
SummaryFileUrl = created file
ProcessedOn = utcNow()
```

4. Email the organiser the SharePoint link.
5. Optionally invoke Flow 05 for Odoo.

---

## Approval outcome: Request changes

Update:

```text
Status = RevisionRequested
ApprovalOutcome = Request changes
ApprovalComments = response comments
```

Do not automatically publish.

Any revised AI summary must go through approval again.

---

## Approval outcome: Reject

Update:

```text
Status = Rejected
ApprovalOutcome = Reject
ApprovalComments = response comments
```

Do not publish to SharePoint or Odoo.

---

# Optional Flow 05 — Log approved summary in Odoo

## Name

```text
ECL-MS-05 – Log Approved Summary in Odoo
```

Keep this disabled until the primary pipeline is stable.

## Inputs

```text
LeadId
SummaryHtml
MeetingTitle
SharePointUrl
```

## Actions

1. Get Odoo credentials from Key Vault.
2. Authenticate the service user if required.
3. Call the relevant CRM API.
4. Post the approved summary as an internal note.
5. Validate that the API response contains no error.
6. Return success/failure to Flow 04.

---

# Error handling

Use:

```text
Scope – Try
Scope – Catch
Scope – Finally
```

across important flows.

## Retry

Retry transient errors for:

- Graph transcript retrieval;
- LLM requests;
- SharePoint writes;
- Odoo calls.

Do not blindly retry:

- authentication failures;
- permission failures;
- invalid input;
- rejected approvals.

## Duplicate prevention

Use:

```text
EventId
```

and later:

```text
MeetingId + TranscriptId
```

to ensure one transcript produces only one processing record and one approved summary.

## Logging

Every failure should write:

```text
Status
ErrorCode
ErrorDetails
ProcessedOn
```

---

# Security considerations

Enable Secure Inputs and Secure Outputs for:

- Key Vault actions;
- transcript retrieval;
- LLM requests;
- Odoo authentication.

Keep:

- secrets in Key Vault;
- transcript access restricted;
- human approval before publication;
- raw transcript retention minimal unless required.

---

# Recommended implementation order

Implement in this order:

1. Create the Power Platform solution.
2. Create environment variables.
3. Create `MeetingSummaryRuns`.
4. Create the `Meeting Summaries` document library.
5. Enable Teams Graph transcript access.
6. Configure the Entra application.
7. Build the Graph custom connector.
8. Manually resolve one Teams meeting.
9. Retrieve one transcript.
10. Clean one VTT transcript successfully.
11. Build and test Flow 03 using pasted sample text.
12. Connect Flow 02 to Flow 03.
13. Build approval and SharePoint publication.
14. Test the complete workflow manually.
15. Build the scheduled dispatcher Flow 01.
16. Add retries and duplicate prevention.
17. Add Odoo only after the main pipeline is stable.

---

# First proof-of-concept target

Do not initially try to build the entire solution.

The first milestone should be:

```text
Scheduled Teams meeting
        ↓
Graph authentication works
        ↓
Power Automate resolves meeting
        ↓
Power Automate retrieves VTT transcript
        ↓
Transcript is cleaned
        ↓
LLM returns valid structured JSON
        ↓
Summary is visible in the Power Automate run
```

Once this succeeds reliably, add approval and publication.
