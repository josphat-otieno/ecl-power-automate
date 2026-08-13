# Delegated proof of concept

## Boundary

- Use the meeting organiser's delegated identity only and process only its meetings.
- Use a harmless, scheduled test meeting with transcription enabled; do not use an instant meeting.
- Do not request application permissions, Teams application access policies, tenant-wide access, production Odoo writes, or broad distribution for this POC.
- Store secrets only in Key Vault or another approved secret store.
- For client or citizen data, use an approved Azure OpenAI deployment; do not send content to an external model.

## Required capabilities

- Create/edit a Power Automate solution and flows in a test environment.
- Create or use SharePoint test resources.
- Authenticate the Graph connector as the organiser using delegated access.
- Read the scheduled test meeting and its transcript content.
- Retrieve the LLM credential securely and call the approved test endpoint.
- Inspect Power Automate run history and flow outputs.

## Sequence

1. Confirm the test environment, organiser identity, test meeting, transcription setting, LLM endpoint, and secret-store access.
2. Configure the Graph connector for delegated `/me` access. Do not mix delegated and application-access designs.
3. Resolve the scheduled test meeting from its correctly encoded join URL.
4. List and fetch VTT transcript content. Wait and retry because transcript generation is delayed.
5. Remove VTT metadata and timestamps while retaining speaker attribution.
6. Call the approved LLM endpoint and require structured JSON: recap, decisions, action items, open questions, warnings, and `null` for unknown owners/due dates.
7. Validate the run against the source transcript. Do not publish automatically.
8. Add approval, SharePoint publication, queueing, scheduling, and optional Odoo only after this slice passes.

## Acceptance checks

- Delegated Graph authentication succeeds.
- One scheduled meeting resolves from its join URL.
- VTT is retrieved after the configured delay.
- Clean text retains speakers but excludes timestamps and VTT headers.
- The LLM returns valid JSON and does not invent facts.
- Secrets and transcripts are not exposed in run history beyond the approved retention period.
- A human reviews the draft before publication.

## Failure handling

- No transcript: verify the meeting is scheduled, ended, transcribed, and past the retry window.
- Meeting not found: check join-URL encoding and organiser identity.
- Graph access error: distinguish delegated-consent problems from application-access configuration; do not widen permissions without approval.
- Invalid model response: preserve the schema, reduce test input, and inspect the raw response before adding retries.
