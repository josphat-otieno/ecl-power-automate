# ECL-MS-03 implementation plan

## Objective

Finish `ECL-MS-03 - Summarise Meeting Transcript` as a solution-aware child flow that receives cleaned transcript text from Flow 02, produces evidence-grounded structured JSON through the approved Azure OpenAI route, writes the result to the existing `MeetingSummaryRuns` item, and advances the item from `Summarising` to `ReadyToPublish`.

Flow 03 must remain off/draft until the approved LLM endpoint, Key Vault connection, and one synthetic test have passed.

## Baseline and confirmed constraints

- Solution baseline: `ECL Meeting Summary` version `1.0.0.5`; Flow 02 import package version `1.0.0.6` remains gateway-disabled.
- SharePoint site: `https://elewacompanyltd.sharepoint.com/sites/ProjectsDelivery`.
- Processing list ID: `51450320-536b-4ba3-b005-7f355e7405d9`.
- Queue contract: Flow 01 creates a complete, duplicate-safe `Queued` item.
- Flow 02 retrieves and cleans the WebVTT body but intentionally does not store transcript text in SharePoint.
- Therefore Flow 03 must be invoked directly by Flow 02 while the cleaned transcript is still in memory. A separate SharePoint trigger on `TranscriptReady` is not sufficient under the current data model.
- Client or citizen transcript data may be sent only to the approved Azure OpenAI deployment.
- Azure OpenAI is the default route for all transcripts. Claude or the public OpenAI API is not enabled in this implementation because the current queue has no approved data-classification field that can prove a meeting is internal-only.

## Current Flow 03 defects to replace

The existing skeleton is not runtime-ready:

1. The manual trigger contract is not yet connected to Flow 02 or the SharePoint record ID.
2. `Build_Transcript_Chunks` is empty, so `Chunks` never receives content.
3. The LLM URI is `https://placeholder.invalid` and the Key Vault secret name is hard-coded.
4. There is no SharePoint connection or update to `SummaryJson`, `Status`, or error fields.
5. The current merge concatenates chunk recaps and arrays without a final deduplication/synthesis pass.
6. Evidence snippets are schema-checked but not verified against the transcript.
7. Several `runAfter` values use inconsistent casing and `Merge_Warnings` uses `items()` without the loop name.
8. The response references outputs that may not exist on a failure path.
9. The flow has no explicit input-size, empty-content, timeout, or LLM throttling guard.

## Gate 1: approve and configure the LLM boundary

Before making an LLM call, confirm:

1. The approved Azure OpenAI endpoint and deployment name.
2. The API version supported by that deployment.
3. The API key is stored in Azure Key Vault under the configured secret name.
4. The Power Automate Key Vault connection identity has read access to that secret only.
5. The environment DLP policy allows SharePoint, Key Vault, the child-flow connector, and HTTP/Azure OpenAI in the same permitted data group.
6. `ecl_LlmEndpoint`, `ecl_LlmModelDeployment`, `ecl_LlmSecretName`, `ecl_PromptVersion`, and `ecl_TranscriptChunkMaximumCharacters` have non-placeholder values.

No live transcript test is permitted until this gate passes. A synthetic transcript may be used to build and validate all non-production logic.

## Gate 2: freeze the Flow 02 → Flow 03 contract

Use Flow 03 as a child flow within the same solution. Its inputs are:

| Input | Required | Source |
|---|---:|---|
| `processing_item_id` | Yes | SharePoint item `ID` from Flow 02 |
| `source_type` | Yes | `SourceType/Value` |
| `source_id` | Yes | stable `EventID` or meeting ID |
| `title` | Yes | queue item `Title` |
| `event_date` | Yes | `MeetingStart` |
| `organizer_email` | Yes | `OrganizerEmail` |
| `participants` | No | normalized participant text when available |
| `content_text` | Yes | cleaned transcript held in Flow 02 memory |
| `speaker_availability` | Yes | Boolean derived during VTT cleaning |
| `prompt_version` | Yes | queue item `PromptVersion` |

The child flow returns:

- `status`: `ReadyToPublish` or `Failed`;
- `summary_json`: final JSON string on success;
- `error_code`: sanitized code on failure;
- `correlation_id`: generated per invocation for operational tracing.

Flow 02 calls Flow 03 only after nonempty transcript content is retrieved and cleaned. The child-flow action uses secure inputs and outputs. Flow 02 does not write or log the transcript body.

## Phase 1: validation and idempotency

Inside `Scope - Try`:

1. Validate `processing_item_id` is a positive integer.
2. Reject empty or whitespace-only `content_text` with `TRANSCRIPT_EMPTY`.
3. Reject transcript text above the agreed maximum total size with `TRANSCRIPT_TOO_LARGE` rather than truncating silently.
4. Read the SharePoint item and require `Status = TranscriptReady`.
5. If the item is already `ReadyToPublish` or `Published` and has a nonempty `SummaryJson`, return the existing result without making another LLM call.
6. Update the record to `Status = Summarising`, clear prior sanitized error fields, and leave `ProcessedOn` empty.

This makes retries safe and prevents duplicate LLM charges.

## Phase 2: speaker-preserving chunk construction

Replace the empty chunk loop with deterministic line-aware chunking:

1. Estimate transcript tokens as `ceiling(length(content_text) / 4)` for planning purposes.
2. Reserve explicit context-window headroom for the system prompt, chunk metadata, final output, and model-specific safety margin; do not treat the full advertised context window as transcript capacity.
3. Normalize line endings to `\n`.
4. Split on newline boundaries while retaining speaker-labelled utterances.
5. Build `CurrentChunk` sequentially with loop concurrency set to one.
6. Before adding a line, compare the proposed length with `TranscriptChunkMaximumCharacters` and the calculated token budget.
7. If it would exceed either limit, append the nonempty current chunk to `Chunks`, then start a new chunk with that line.
8. Append the final nonempty chunk after the loop.
9. Reject any individual line larger than the configured limit with `TRANSCRIPT_LINE_TOO_LARGE`; do not silently split evidence mid-line.
10. Require `length(Chunks) > 0` before retrieving the LLM credential.

Default target: 12,000 characters per chunk, subject to the approved model context window and prompt overhead.

## Phase 3: secure map-stage summarisation

For each chunk, sequentially:

1. Use the same versioned system/user prompt template for every chunk. Only source ID, chunk index, chunk count, speaker-availability flag, and chunk text may vary.
2. Require exactly these JSON keys: `recap`, `decisions`, `action_items`, `open_questions`, and `warnings`.
3. Require `null` for unknown owners, dates, or decision makers.
4. Require a short verbatim evidence snippet for every decision, action item, and open question.
5. Call the approved Azure OpenAI endpoint with temperature `0.1` and structured JSON mode where supported.
6. Enable secure inputs and outputs on Key Vault, prompt composition, HTTP, and parsing actions.
7. Configure bounded retries for `408`, `429`, and `5xx` responses only, respecting `Retry-After`; do not retry authorization failures or invalid schema indefinitely.
8. Parse against the strict schema. On malformed or incomplete JSON, fail with `LLM_RESPONSE_INVALID`.
9. Verify each evidence snippet occurs in the corresponding chunk. Fail with `LLM_EVIDENCE_INVALID` if it does not.
10. Append the validated chunk result and a response fingerprint; never store raw prompts or responses in SharePoint.

## Phase 4: reduce-stage synthesis and validation

Use a final reduce call over the validated chunk summaries, not the raw transcript:

1. Produce one concise recap rather than concatenating every chunk recap.
2. Merge and deduplicate decisions, action items, and open questions while preserving their original evidence snippets.
3. Preserve `null` values when ownership or dates are unknown.
4. Aggregate warnings, including missing speaker attribution.
5. Parse the final result against the same strict schema.
6. Revalidate every final evidence snippet against the original cleaned transcript.
7. Enforce an agreed maximum `SummaryJson` size suitable for the SharePoint multiline text field.
8. Add trace metadata outside the model-authored content only if the downstream Flow 04 contract accepts it; otherwise retain correlation and prompt version in their existing SharePoint fields.

If reduce-stage input could exceed the model context window, batch-reduce summaries in deterministic groups and perform one final reduction.

## Phase 5: persist the automatic publication handoff to Flow 04

On successful final validation, update the same SharePoint item in one action:

- `SummaryJson` = serialized final JSON;
- `Status` = `ReadyToPublish`;
- `PromptVersion` = the input/configured prompt version;
- `ErrorCode` = empty;
- `ErrorDetails` = empty;
- `ProcessedOn` = `utcNow()`.

Return the same summary and `ReadyToPublish` to Flow 02. Flow 04 is responsible only for automatic SharePoint publication and its duplicate-publication guard; no human approval is created.

## Phase 6: failure and finally behavior

`Scope - Catch` runs after failure or timeout and writes:

- `Status = Failed`;
- a stable sanitized code such as `TRANSCRIPT_EMPTY`, `LLM_AUTH_FAILED`, `LLM_THROTTLED`, `LLM_RESPONSE_INVALID`, `LLM_EVIDENCE_INVALID`, or `SUMMARISATION_FAILED`;
- a short sanitized `ErrorDetails` value containing the phase and correlation ID only;
- `ProcessedOn = utcNow()`.

Never write transcript text, prompts, model responses, API keys, authorization headers, or full connector responses into SharePoint errors. `Scope - Finally` returns a response for both success and handled failure without referencing actions that were skipped.

## Testing sequence

1. **Contract test:** invoke with a short synthetic transcript and a valid processing item.
2. **Schema test:** verify all required keys and nullable fields.
3. **Evidence test:** confirm invented evidence is rejected.
4. **Speaker test:** confirm speaker labels survive chunk boundaries.
5. **Long transcript test:** create multiple chunks and one deduplicated final summary.
6. **Empty transcript test:** expect `TRANSCRIPT_EMPTY` and no LLM call.
7. **Malformed response test:** expect `LLM_RESPONSE_INVALID`.
8. **Throttling test:** confirm bounded retry and no duplicate SharePoint result.
9. **Idempotency test:** rerun an already completed item and confirm no second LLM call.
10. **Pipeline test:** Flow 02 passes cleaned content; Flow 03 stores valid `SummaryJson`; status becomes `ReadyToPublish`; Flow 04 publishes once.

Use synthetic content first. Use one approved real transcript only after security and DLP gates pass.

## Packaging strategy

1. Re-export the live solution after the successful Flow 02 import and use that export as the authoritative baseline.
2. Modify only Flow 03 plus required connection references and environment-variable bindings.
3. Preserve Flow 03 component ID `{a49701ec-82a0-f111-b8dc-000d3ab04ac1}`.
4. Publish or discard any existing unpublished Flow 03 edit before importing, avoiding the earlier `ActiveUnpublished` collision.
5. Increment the solution version and import Flow 03 as draft/off.
6. Map SharePoint and Key Vault connections during import; do not package live connection IDs or secrets.
7. Run synthetic acceptance, then export the successful live correction as the next repository baseline.

## Definition of done

- The Flow 02 → Flow 03 child-flow contract is wired and secure.
- Empty, oversized, and duplicate inputs are handled without unnecessary LLM calls.
- Chunking preserves speaker turns and never loses text silently.
- Every model-produced claim has transcript-backed evidence.
- Final JSON passes the strict schema and evidence validation.
- One SharePoint item transitions exactly once from `TranscriptReady` through `Summarising` to `ReadyToPublish`.
- Failures end in `Failed` with sanitized diagnostics.
- Flow 04 receives one complete, valid `SummaryJson` and creates no duplicate publication.
- No transcript, prompt, model response, credential, or access token is persisted outside approved secure boundaries.
