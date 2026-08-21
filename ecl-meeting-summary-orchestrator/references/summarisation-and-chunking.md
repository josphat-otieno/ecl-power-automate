# Summarisation and chunking

Purpose
- Provide a concise implementer guide for chunking cleaned transcripts and producing the final structured JSON summary via the approved LLM route.

Inputs
- `source_type`, `source_id`, `title`, `event_date`, `organiser_email`, `participants`, `content_text`, `speaker_availability`, `prompt_version`.

Prerequisites
- `content_text` is cleaned WebVTT (speaker labels preserved) and ready for chunking.
- LLM credential available in Key Vault; secure inputs/outputs enabled in Power Automate.

Step-by-step implementer guide
1. Retrieve LLM secret from Key Vault using a secure connector action.
2. Estimate token size from `content_text` (use character→token heuristic) and determine chunk count using configured `TranscriptChunkMaximumCharacters`.
3. Chunking rules:
   - Prefer splitting on speaker-turn boundaries or newline boundaries.
   - Aim for chunks under the configured character/token limit.
   - Include a minimal header with `source_type`, `source_id`, `chunk_index`, and `prompt_version` for traceability.
4. For each chunk, call the approved LLM endpoint with:
   - The chunk text as input.
   - A prompt that instructs the model to produce the required JSON schema (see Schema section below).
   - A short system message enforcing evidence-only extraction and `null` for unknown owners/dates.
5. Validate each chunk response:
   - Ensure JSON parses and contains all required top-level keys.
   - Reject or retry on malformed JSON, invented facts, or missing required sections.
6. Merge chunk-level outputs into a final summary:
   - Concatenate `recap` fields (or synthesise a final recap from chunk recaps).
   - Combine `decisions`, `action_items`, and `open_questions`, deduplicating by evidence snippet.
   - Aggregate `warnings`.
7. Store the final `SummaryJson` in the processing record and set `Status = PendingApproval`.

Prompt guidance
- Instruct the model to reference only the chunk text and to include short evidence snippets copied verbatim from the chunk.
- Require `null` for unknown owners/due dates and short ISO dates for known dates.
- Ask the model to return only the JSON object and nothing else.

Schema (required output)
- `recap`: string
- `decisions`: list of { `decision`, `made_by` (string|null), `evidence` }
- `action_items`: list of { `task`, `owner` (string|null), `due_date` (YYYY-MM-DD|null), `evidence` }
- `open_questions`: list of { `question`, `owner` (string|null), `evidence` }
- `warnings`: list of string

Testing and acceptance
- Short synthetic chunk returns valid JSON matching schema.
- Long transcripts chunk and recombine without losing evidence.
- Model does not invent owners or dates; unknowns are `null`.

Developer notes
- Use exponential backoff for transient LLM errors; do not retry on schema-rejection without human review.
- Record chunk index, prompt version, and LLM response fingerprint for auditability.
- Keep LLM request/response details out of SharePoint fields; store them only in secure run logs if needed.
