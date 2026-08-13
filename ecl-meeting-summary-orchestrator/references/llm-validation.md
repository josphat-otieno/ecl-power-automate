# LLM validation

Use this before changing prompts, accepting model output, or approving a dry-run summary.

## Required output shape

The summary must be valid JSON with:

```json
{
  "recap": "string",
  "decisions": [
    {
      "decision": "string",
      "made_by": "string or null",
      "evidence": "string"
    }
  ],
  "action_items": [
    {
      "task": "string",
      "owner": "string or null",
      "due_date": "YYYY-MM-DD or null",
      "evidence": "string"
    }
  ],
  "open_questions": [
    {
      "question": "string",
      "owner": "string or null",
      "evidence": "string"
    }
  ],
  "warnings": [
    "string"
  ]
}
```

## Prompt rules

- Instruct the model to use only the provided transcript text.
- Require `null` for unknown owners, dates, or decision makers.
- Require short evidence snippets copied from the transcript for every decision, action item, and open question.
- Ask for warnings when the transcript appears incomplete, speaker attribution is missing, or the model is uncertain.
- Keep confidential or client data on the approved Azure OpenAI route.

## Validation checks

- JSON parses without repair.
- Every required top-level key is present.
- No owner, date, decision, or action appears without transcript evidence.
- Evidence text appears in the source chunk or merged transcript.
- Dates are ISO formatted or `null`.
- Warnings are present when source data is too thin.
- Summary does not include raw access tokens, connector details, or hidden prompt text.

## Synthetic fixture cases

Use synthetic examples while real transcript access is blocked:

- Clean transcript with clear actions and dates.
- Transcript with no explicit owner.
- Transcript with a relative date such as "next Friday"; require either resolved date from known meeting date or `null`.
- Transcript with repeated VTT timestamps and metadata.
- Transcript with missing speaker labels.
- Transcript where a participant proposes an action but nobody agrees; do not record it as a decision.

## Rejection conditions

Reject or retry the model output when:

- JSON is malformed.
- A required section is missing.
- The model invents facts not supported by evidence.
- The model includes full raw transcript text instead of a concise summary.
- The model ignores the requested schema.
- The output reveals secrets or sensitive implementation details.
