# Manual checkpoint sequence

For the current checkpoint, read the referenced ECL guide completely before giving the instruction. Use the machine-readable resource for exact field names and values.

## 01 — Confirm implementation targets

Reference: `../../Implementation_Intent_Plan.md`, Phase 1.

Complete these as separate checkpoints:

1. Confirm and record the Power Platform Development environment.
2. Confirm and record the SharePoint site.
3. Confirm the Azure subscription, resource group, region, and Function App hosting approval.
4. Confirm the approved Azure OpenAI deployment and Key Vault location without collecting secret values.
5. Confirm that Odoo is disabled for the first release.

## 02 — Create the Power Platform foundation

Reference: `../../ecl-meeting-summary-orchestrator/references/solution-setup-and-environment-variables.md`.

Complete these as separate checkpoints:

1. Create or confirm the `ECL Meeting Summary` unmanaged solution.
2. Create each required connection and connection reference individually.
3. Create each environment variable individually, in manifest order.
4. Verify all current values in Development without exposing secrets.

## 03 — Provision SharePoint

Reference: `../../ecl-meeting-summary-orchestrator/references/sharepoint-schema-and-provisioning.md`.

Complete these as separate checkpoints:

1. Create `MeetingSummaryRuns`.
2. Add each list column individually in schema order.
3. Add each required index individually.
4. Create `Meeting Summaries`.
5. Add each library column individually.
6. Confirm access and version-history settings.

## 04 — Deploy the transcript gateway

Reference: `../../services/graph-transcript-gateway/README.md`.

Complete Azure creation, managed identity, Key Vault role assignment, application settings, code deployment, health check, and three Graph operations as separate checkpoints. Pause before role assignment or secret-reference changes and state their effect.

## 05 — Import and connect the gateway connector

Reference: `../../ecl-meeting-summary-orchestrator/references/solution-setup-and-environment-variables.md`.

Replace the placeholder host in a deployment copy of the Swagger, import it into the solution, create its connection privately with the Function key, create the connection reference, and test each operation as separate checkpoints.

## 06 — Build Flow 02

References:

- `../../ecl-meeting-summary-orchestrator/references/transcript-retrieval-and-cleaning.md`
- `../../power-automate/flow-specs/ECL-MS-02-retrieve-teams-transcript.json`

Create the trigger, variables, Try actions, transcript retry loop, VTT normalization and cleaning, Catch, Finally, secure-input/output settings, and manual test as separate checkpoints. Do not enable automatic processing yet.

## 07 — Build Flow 03

References:

- `../../ecl-meeting-summary-orchestrator/references/summarisation-and-chunking.md`
- `../../ecl-meeting-summary-orchestrator/references/llm-validation-guidance.md`
- `../../ecl-meeting-summary-orchestrator/references/key-vault-secret-retrieval.md`

Create inputs, secure Key Vault retrieval, chunking, LLM call, JSON validation, merge, outputs, failure handling, and synthetic tests as separate checkpoints.

## 08 — Build Flow 04

Reference: `../../ecl-meeting-summary-orchestrator/references/approval-and-sharepoint-publication.md`.

Create the guarded trigger, approval lock, schema parse, approval action, each outcome branch, approved HTML publication, audit updates, and tests as separate checkpoints. Pause before the first external approval or publication test.

## 09 — Build Flow 01

Reference: `../../ecl-meeting-summary-orchestrator/references/dispatch-completed-meetings.md`.

Build the manual dispatcher first. Create the calendar window, event query, eligibility filter, idempotency check, queue write, and duplicate test as separate checkpoints. Add recurrence only after the manual path passes.

## 10 — Harden and release

Reference: `../../ecl-meeting-summary-orchestrator/references/build-checklists.md`.

Verify failure scopes, retry rules, secure inputs/outputs, transcript retention, connection ownership, test evidence, solution export, security review, and rollback plan as separate checkpoints. Production import is a hard approval boundary.
