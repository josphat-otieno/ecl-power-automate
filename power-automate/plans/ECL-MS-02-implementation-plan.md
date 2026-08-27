# ECL-MS-02 — retrieve and clean Teams transcript

## Objective

Implement Flow 02 as the reliable handoff between transcript discovery and summarisation. Flow 01 has already discovered an available scheduled-meeting transcript and written its identifiers to `MeetingSummaryRuns`; Flow 02 must retrieve that exact transcript, clean the WebVTT without losing speaker meaning, invoke Flow 03 in memory, and leave a clear terminal or recoverable state.

Flow 02 must not search Outlook, resolve a join URL, list meetings, or poll for transcripts on the normal path.

## Authoritative input contract

Flow 02 is triggered by a `MeetingSummaryRuns` item with `Status = Queued` and these required values:

| Field | Requirement | Use |
|---|---|---|
| `ID` | Positive SharePoint item ID | Updates and Flow 03 handoff |
| `EventID` | Nonempty and unique | End-to-end business idempotency key |
| `OrganizerEntraUserID` | Valid Entra object ID | Gateway path parameter |
| `MeetingID` | Nonempty Graph online-meeting ID | Gateway path parameter |
| `TranscriptID` | Nonempty Graph transcript ID | Gateway path parameter |
| `Status` | Exactly `Queued` | Trigger eligibility |
| `Title` | Nonempty | Summary metadata |
| `MeetingStart` | Valid date/time when present | Summary metadata |
| `PromptVersion` | Nonempty or configured fallback | Flow 03 prompt selection |

`JoinURL` and `OrganizerEmail` are not required for transcript retrieval. Organizer email may be retained as optional publication metadata, but it is not part of the Flow 02 gateway contract.

## Shared lifecycle

```text
Flow 01: Queued
Flow 02: Queued -> WaitingForTranscript -> TranscriptReady
                                      \-> TranscriptUnavailable
                                      \-> Failed
Flow 03: TranscriptReady -> Summarising -> ReadyToPublish
Flow 04: ReadyToPublish -> Publishing -> Published
                                   \-> PublicationFailed
```

No flow may overwrite a state owned by a later flow.

## Configuration and connections

Required environment values:

- `ecl_GraphGatewayBaseUrl` = approved HTTPS gateway base URL, without a trailing slash;
- `ecl_GraphGatewayFunctionKey` = environment-specific Azure Function key;
- `ecl_SharePointSiteUrl`;
- `ecl_ProcessingListName`;
- `ecl_PromptVersion`; and
- bounded HTTP retry settings.

Use native HTTP for the gateway and the existing SharePoint connection. The function key must be passed only in the `x-functions-key` header, treated as a secure value, and masked by secure inputs/outputs. Do not package a live key, connection ID, token, or certificate.

## Trigger, lock, and idempotency

1. Use `When an item is created or modified` on `MeetingSummaryRuns`.
2. Apply a trigger condition for `Status = Queued`; do not start runs for unrelated modifications.
3. Set trigger concurrency to one for the first production release. Increase it only after item-level locking is proven.
4. Re-read the item at the start of the run.
5. Validate the required contract fields before any gateway call.
6. If the current status is no longer `Queued`, terminate as `Ignored` without changing the item.
7. Update the item to `WaitingForTranscript`, clear prior `ErrorCode` and `ErrorDetails`, and increment `AttemptCount`.
8. Re-read and confirm the lock before retrieving content. This prevents two queued trigger events from processing the same item.

The unique `EventID` prevents duplicate queue records; the status lock prevents duplicate processing of one record.

## Direct transcript retrieval

Call:

```text
GET {GraphGatewayBaseUrl}/users/{OrganizerEntraUserID}/onlineMeetings/{MeetingID}/transcripts/{TranscriptID}/content
```

Requirements:

1. URI-encode every path value independently.
2. Send `Accept: text/vtt` and the secure function-key header.
3. Enable secure inputs and outputs on the HTTP action and every action that directly carries transcript content.
4. Use a bounded action timeout.
5. Retry only transient failures: `408`, `429`, and `5xx`; respect `Retry-After` where available.
6. Treat `400` as `TRANSCRIPT_IDENTIFIERS_INVALID` and `401`/`403` as `TRANSCRIPT_ACCESS_DENIED`; do not retry them indefinitely.
7. Retry `404` only for a short propagation window because Flow 01 already observed the transcript. If it remains unavailable, end as `TranscriptUnavailable` with `TRANSCRIPT_NOT_AVAILABLE`.
8. Record only response status, phase, correlation ID, and safe request ID. Never persist the response body in diagnostics.

## Response normalization

The gateway should normally return a `text/vtt` body. Normalize defensively:

1. If the HTTP body is a string, use it directly.
2. If Power Automate supplies a binary envelope with `$content`, base64-decode that value once.
3. Reject unsupported envelopes with `TRANSCRIPT_RESPONSE_INVALID`.
4. Remove a leading byte-order mark.
5. Normalize line endings to `\n`.
6. Require nonempty content and either a `WEBVTT` header or recognizable cue timing. An empty or structurally invalid body must not be sent to the LLM.

## Deterministic WebVTT cleaning

Implement a sequential line-state loop; do not depend on a broad regex that may delete spoken text.

1. Remove the `WEBVTT` header and header metadata.
2. Skip complete `NOTE`, `STYLE`, and `REGION` blocks until their terminating blank line.
3. Skip cue identifier lines only when the following line is a timestamp line.
4. Remove timestamp lines containing the WebVTT `-->` separator.
5. Preserve cue payload order, punctuation, Unicode, and speaker labels.
6. Preserve Teams voice tags or convert them deterministically to a readable `Speaker: utterance` form; never discard the speaker name.
7. Decode only known WebVTT entities needed for readable text. Do not interpret transcript content as HTML.
8. Collapse repeated blank lines and trim the result.
9. Derive `speaker_availability` from the cleaned cues rather than assuming speakers exist.
10. Reject an empty cleaned result with `TRANSCRIPT_EMPTY_AFTER_CLEANING`.

Test cleaning against fixtures containing multiple speakers, cue IDs, notes, entities, Unicode, missing speaker labels, and multiline utterances.

## Flow 02 to Flow 03 handoff

After successful cleaning:

1. Update only the processing item to `Status = TranscriptReady`, preserving identifiers and clearing prior errors.
2. Invoke Flow 03 as a solution-aware child flow with secure inputs and outputs.
3. Pass:
   - `processing_item_id`;
   - `event_id`;
   - `title`;
   - `meeting_start`;
   - `clean_transcript`;
   - `speaker_availability`; and
   - `prompt_version`.
4. Do not store raw or cleaned transcript text in SharePoint, email, ordinary variables exposed in run history, or error details.
5. Accept only the documented Flow 03 response contract.
6. If Flow 03 returns a handled failure, do not replace its SharePoint error with a generic Flow 02 error.
7. If the child-flow invocation itself fails before Flow 03 owns the record, set `Failed` with `SUMMARY_HANDOFF_FAILED`.

Flow 02 must not set `ProcessedOn` after Flow 03 has advanced the item to a later state.

## Failure model and recovery

| Condition | Final status | Error code | Retry route |
|---|---|---|---|
| Required queue field missing | `Failed` | `QUEUE_CONTRACT_INVALID` | Correct item, set `Queued` |
| Transcript remains absent | `TranscriptUnavailable` | `TRANSCRIPT_NOT_AVAILABLE` | Confirm transcript, set `Queued` |
| Invalid IDs | `Failed` | `TRANSCRIPT_IDENTIFIERS_INVALID` | Correct source logic |
| Gateway authorization failure | `Failed` | `TRANSCRIPT_ACCESS_DENIED` | Correct gateway/policy, set `Queued` |
| Invalid/empty VTT | `Failed` | `TRANSCRIPT_RESPONSE_INVALID` or `TRANSCRIPT_EMPTY_AFTER_CLEANING` | Inspect gateway safely, set `Queued` |
| Child-flow invocation fails | `Failed` | `SUMMARY_HANDOFF_FAILED` | Set `Queued`; transcript is refetched |
| Unexpected failure | `Failed` | `TRANSCRIPT_FLOW_FAILED` | Correct cause, set `Queued` |

`ErrorDetails` may contain only phase and correlation ID. `ProcessedOn` is set only for terminal failure/unavailable outcomes; success ownership passes to Flow 03.

## Test matrix

1. One valid queued item retrieves its exact transcript and invokes Flow 03 once.
2. A second trigger event for the same item terminates as ignored.
3. Missing organizer, meeting, or transcript ID makes no gateway call.
4. String and base64 response shapes normalize to identical VTT.
5. A transient `429` retries within the bound.
6. A persistent `404` becomes `TranscriptUnavailable`.
7. `401`/`403` fail without repeated calls.
8. Cleaning preserves speaker order and all utterance text.
9. Empty or invalid content never reaches Flow 03.
10. Transcript content and the function key are absent from visible run history and SharePoint.
11. Flow 03 failure ownership is preserved.
12. Requeue after a handled failure produces one new controlled attempt.

## Packaging and release

1. Start from the newest successful export containing Flow 01 version `1.0.0.7`.
2. Preserve Flow 02 component ID `{72eec559-75a0-f111-b8dc-000d3ab04ac1}`.
3. Package only Flow 02 and required environment-variable/connection changes.
4. Leave Flow 02 draft/off after import.
5. Use environment-specific values during import; never package live secrets.
6. Run synthetic VTT tests before one approved real transcript.
7. Enable Flow 02 only after Flow 03 is imported and its child-flow connection is valid.
8. Re-export the tested solution and make that export the next baseline.

## Definition of done

- Flow 02 uses stored organizer, meeting, and transcript IDs directly.
- One queue item is processed once despite repeated SharePoint events.
- Transcript retrieval has bounded, classified retries.
- WebVTT cleaning loses no spoken content or speaker attribution.
- Transcript content remains in secure in-memory actions only.
- Flow 03 receives the complete documented contract exactly once.
- Every failure has a stable state, code, and explicit recovery path.
