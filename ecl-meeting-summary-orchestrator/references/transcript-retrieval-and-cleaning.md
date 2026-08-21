# Transcript retrieval and cleaning

Purpose
- Implement and verify the transcript retrieval path (Graph → VTT) and basic cleaning so the summarisation step can consume reliable, speaker-preserved text.

Assumptions
- Entra delegated sign-in is available for a test organiser, or a delegated short-lived token is provided.
- The Microsoft Graph custom connector or the local `graph-readonly-mcp` helper is accessible for reads only.

Dependencies
- `ecl-meeting-summary-orchestrator/references/build-checklists.md` — checklist and conventions.
- `plugins/ecl-power-automate-mcp/scripts/graph-readonly-mcp.mjs` — delegated Graph helper exposing `resolve_meeting_by_join_url`, `list_meeting_transcripts`, and `get_transcript_vtt`.

Step-by-step implementer guide
1. Create a manual-triggered Power Automate flow for POC runs only.
2. Input parameters: `JoinUrl` (meeting join URL), `TestRunId` (optional test identifier).
3. Resolve meeting:
   - Call the Graph helper or custom connector to `ResolveMeeting`/`resolve_meeting_by_join_url` with `JoinUrl`.
   - If zero or multiple matches, set processing item `Status = ResolvingMeetingError` and stop.
   - Store the returned `MeetingId` in the processing item.
4. List transcripts:
   - Call `ListTranscripts`/`list_meeting_transcripts` for the stored `MeetingId`.
   - If none, implement a retry loop using configured delays and maximum attempts; if still none, set `Status = TranscriptUnavailable`, `ErrorCode = TRANSCRIPT_NOT_READY`, and stop.
5. Fetch transcript content:
   - Select the most recent transcript (or matching `transcriptId` if provided).
   - Call `GetTranscriptContent`/`get_transcript_vtt` with `meeting_id` and `transcript_id`, requesting `text/vtt`.
   - If the connector returns a `$content` envelope, base64-decode it first; otherwise use body as received.
6. Clean VTT to produce plain, speaker-preserved text:
   - Remove VTT headers, `WEBVTT` lines, `NOTE`, `Kind:`, `Language:` metadata, timestamp lines, and blank lines.
   - Preserve speaker labels and utterance order; collapse multi-line utterances into single lines at speaker boundaries.
   - Sanitize sensitive tokens, secrets, or long raw tokens from any stored error details.
   
Local VTT cleaning script

- A small local helper is provided at `scripts/clean-vtt.js` to perform the cleaning rules above for POC runs. It:
   - strips VTT headers/NOTE/Kind/Language lines and timestamps,
   - collapses multi-line utterances into single lines preserving speaker labels, and
   - redacts long base64-like blobs, bearer tokens, and long hex tokens.

- Run it locally after saving `transcript.vtt`:

```powershell
node scripts/clean-vtt.js transcript.vtt transcript.cleaned.txt
```

The script writes `transcript.cleaned.txt` (one utterance per line, speaker labels preserved) which is consumable by the summarisation step.
7. Persist cleaned text:
   - Save cleaned text to the processing item (e.g., `CleanedTranscript`) or a temporary test storage location accessible to the summarisation step.
   - Update `Status = TranscriptReady` and record `ProcessedOn` and relevant evidence (meetingId, transcriptId).

Testing and acceptance
- Manual test: Provide a known test meeting `JoinUrl` and confirm the flow resolves a single meeting and retrieves a VTT transcript.
- Output validation: Cleaned transcript preserves speaker labels and utterance order and contains no VTT metadata or timestamps.
- Security: No secret values or raw tokens are stored in flow run history, SharePoint fields, or logs.
- Metrics: Record elapsed time for resolve → fetch → clean to detect delays in transcript availability.

Developer notes
- Use `Scope - Try` / `Scope - Catch` / `Scope - Finally` to capture sanitized error details and ensure `ProcessedOn` updates.
- Keep this flow manual or limited to a test environment until the POC is accepted.
- Once stable, convert the trigger to the scheduled or event-driven dispatcher in the dispatcher flow.
