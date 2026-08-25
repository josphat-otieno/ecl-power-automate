# ECL Power Automate Meeting Summary

This repository contains the implementation materials for ECL's Teams meeting-summary automation using Microsoft Power Automate, Microsoft Graph, SharePoint, approvals, and a selected LLM endpoint.

The validated Graph path now uses certificate-based application authentication. Because Power Automate custom connectors do not support the OAuth client-credentials grant directly, the implementation includes a small Azure Functions gateway under `services/graph-transcript-gateway/`. The flow calls that gateway; the gateway holds the certificate boundary and calls Graph through `/users/{OrganizerUserId}`.

The current architecture does not require a separately hosted agent or Copilot Studio. Power Automate performs the orchestration directly:

```text
Flow 01 - Find completed meetings
    -> Flow 02 - Retrieve and clean transcript
    -> Flow 03 - Chunk and summarise through LLM endpoint
    -> Flow 04 - Request approval and publish
    -> Optional Flow 05 - Log approved summary in Odoo
```

> [!NOTE]
> **Cloud Deployment Status:** Certificate-based Graph authentication, meeting resolution, and transcript-endpoint authorization have been validated. Automated Azure and Power Platform deployment remains pending until the gateway hosting boundary, target Development environment, SharePoint site, and approved LLM route receive formal approval.
> 
> **Future Proposal (`powerautomate-mcp`):** Following formal security sign-off, the team proposes evaluating the upstream [`powerautomate-mcp`](https://github.com/rcb0727/powerplatform-mcp-docs) toolset (as prototyped on the `codex/powerautomate-mcp` branch). Until it is approved and activated, Power Platform environment changes remain human-governed and this repository produces reviewable implementation assets locally.

---

## Repository Contents

### Core Documents

| Path | Purpose |
|---|---|
| `ECL_Meeting_Summary_Power_Automate_Implementation_Plan.md` | Source-of-truth architecture document covering solution setup, SharePoint schema, Graph connector actions, and full flow design. |
| `ECL_Handoff_MeetingSummaryFlow_07082026.docx` | Handoff document for the meeting-summary flow. |

---

### Codex Skill — `ecl-meeting-summary-orchestrator/`

The Codex skill is the primary entry point for AI-assisted planning, validation, and troubleshooting of this pipeline.

| Path | Purpose |
|---|---|
| `ecl-meeting-summary-orchestrator/SKILL.md` | Skill routing table: maps any implementation question to the right reference document or local script. |
| `ecl-meeting-summary-orchestrator/agents/openai.yaml` | OpenAI agent configuration for the orchestrator skill. |

#### Reference Guides — `ecl-meeting-summary-orchestrator/references/`

Each file is a self-contained implementation reference for one concern.

| File | Covers |
|---|---|
| `approval-and-sharepoint-publication.md` | Flow 04 — Teams Adaptive Card approval, Outlook email notification, and HTML publication to SharePoint. |
| `build-checklists.md` | Step-by-step build checklists for each flow, with accept/reject checks. |
| `delegated-proof-of-concept.md` | Delegated POC sequence and acceptance criteria before productionising. |
| `dispatch-completed-meetings.md` | Flow 01 — Recurrence trigger, lookback window, Graph calendar query, deduplication, and queue item creation. |
| `key-vault-secret-retrieval.md` | How to retrieve LLM and Graph secrets safely from Azure Key Vault with secure inputs/outputs enabled. |
| `llm-validation-guidance.md` | LLM prompt design, structured JSON output schema, and synthetic transcript validation guidance. |
| `sharepoint-schema-and-provisioning.md` | `MeetingSummaryRuns` list columns, `Meeting Summaries` document library, column choices, and provisioning steps. |
| `solution-setup-and-environment-variables.md` | All 15 environment variables, connection references, and gateway connector registration steps. |
| `summarisation-and-chunking.md` | Flow 03 — Transcript chunking strategy, LLM prompt, structured JSON output handling, and error detection. |
| `transcript-retrieval-and-cleaning.md` | Flow 02 — Graph transcript retrieval, base64 decode, VTT cleaning, speaker attribution, and secret redaction. |

#### Resources — `ecl-meeting-summary-orchestrator/resources/`

Machine-readable definitions for direct use in Power Automate or deployment tooling.

| File | Purpose |
|---|---|
| `adaptive-card-template.json` | Adaptive Card v1.5 template for the Teams approval notification (Flow 04). |
| `graph-gateway-connector-swagger.json` | Current OpenAPI definition for the certificate-authenticated Graph gateway connector. |
| `graph-connector-swagger.json` | Superseded direct-Graph connector retained for migration reference; it is not the certificate-authenticated production path. |
| `sharepoint-list-schema.json` | Machine-readable column schema for the `MeetingSummaryRuns` SharePoint list. |
| `solution-manifest.json` | All 15 environment variable declarations for the Power Platform solution manifest. |
| `graph-gateway-connector-swagger.json` | Import definition for the certificate-authenticated Graph transcript gateway. |

---

### Local Validation Scripts — `scripts/`

Node.js CLI tools for dry-run testing without a live Power Automate or Azure environment.

| Script | Purpose | Usage |
|---|---|---|
| `clean-vtt.js` | Strip VTT metadata/timestamps, preserve speaker attribution, redact tokens. | `node scripts/clean-vtt.js <input.vtt> <output.txt>` |
| `generate-html-summary.js` | Convert a structured `SummaryJson` fixture into the HTML approval document published to SharePoint. | `node scripts/generate-html-summary.js <summary.json> <output.html>` |
| `run-pipeline-test.js` | **End-to-end pipeline dry-run.** Chains all scripts through Flows 01–04 using synthetic fixtures. | `node scripts/run-pipeline-test.js` |
| `simulate-calendar-dispatcher.js` | Filter synthetic calendar events through the Flow 01 eligibility rules and produce queue items. | `node scripts/simulate-calendar-dispatcher.js` |
| `validate-sharepoint-item.js` | Validate a `MeetingSummaryRuns` list item against the full column schema. | `node scripts/validate-sharepoint-item.js <items.json>` |
| `validate-solution-env.js` | Validate all 15 environment variables declared in `solution-manifest.json`. | `node scripts/validate-solution-env.js <manifest.json>` |

#### Running the E2E pipeline test
```bash
node scripts/run-pipeline-test.js
```
Expected output: all 5 stages PASS and an HTML approval document written to `test-fixtures/pipeline-output.html`.

### Certificate-authenticated Graph gateway — `services/graph-transcript-gateway/`

This Azure Functions service is the unattended authentication boundary for Flow 02. It creates a short-lived certificate assertion, caches only the resulting access token in memory, resolves meetings by organizer object ID, lists transcripts, and returns VTT content. Its connector contract is `ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json`.

Run its unit tests with:

```bash
npm test --prefix services/graph-transcript-gateway
```

### Delegated Graph MCP Tool — `plugins/ecl-power-automate-mcp/`

A local, read-only MCP server (`ecl-graph-transcripts`) used to test certificate-based application access or delegated Microsoft Graph access before deploying Power Automate flows.

| Path | Purpose |
|---|---|
| `plugins/ecl-power-automate-mcp/.mcp.json` | MCP server configuration mapping `ecl-graph-transcripts` to `node ./scripts/graph-readonly-mcp.mjs`. |
| `plugins/ecl-power-automate-mcp/scripts/graph-readonly-mcp.mjs` | Node.js MCP server implementing certificate application authentication and optional delegated sign-in for Graph validation. |

#### Available MCP Tools

| Tool | Description | Parameters |
|---|---|---|
| `begin_delegated_sign_in` | Requests an Entra ID device code with scopes (`User.Read`, `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`). | *(none)* |
| `complete_delegated_sign_in` | Finalizes authentication once the user completes the browser sign-in. | *(none)* |
| `get_current_user` | Returns the authenticated organizer identity (`/me?$select=id,displayName,userPrincipalName`). | *(none)* |
| `resolve_meeting_by_join_url` | Resolves a Teams online meeting record using its join URL. | `join_url` (string) |
| `list_meeting_transcripts` | Lists available transcript IDs for a given meeting. | `meeting_id` (string) |
| `get_transcript_vtt` | Fetches the raw WebVTT transcript content for cleaning and summarisation. | `meeting_id` (string), `transcript_id` (string) |

#### How to Use Device-Code Sign-In

1. **Set Environment Variables:**
   Supply your Entra ID application registration details to the MCP host / environment:
   ```bash
   export ECL_ENTRA_CLIENT_ID="<your-entra-client-id>"
   export ECL_ENTRA_TENANT_ID="<your-entra-tenant-id>"
   ```
   *(Alternatively, provide a pre-existing token via `export ECL_GRAPH_ACCESS_TOKEN="<token>"`).*

2. **Initiate Sign-In:**
   Call `begin_delegated_sign_in`. The tool returns a message with a verification URL and user code:
   ```text
   To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code XXXXXXXX to authenticate.
   ```

3. **Authenticate in Browser:**
   - Open `https://microsoft.com/devicelogin` in your browser.
   - Enter the code displayed.
   - Sign in using the meeting organizer's Microsoft 365 account and consent to the requested read-only scopes.

4. **Complete Sign-In:**
   Call `complete_delegated_sign_in`. The tool exchanges the device code for a session access token.

5. **Verify & Retrieve Transcripts:**
   - Call `get_current_user` to verify the organizer identity.
   - Call `resolve_meeting_by_join_url` with the Teams meeting join link.
   - Call `list_meeting_transcripts` with the returned `meeting_id`.
   - Call `get_transcript_vtt` with the `meeting_id` and `transcript_id` to download the transcript.

---

### Test Fixtures — `test-fixtures/`

Synthetic data for local dry-run validation — no live tenant credentials required.

| File | Purpose |
|---|---|
| `pipeline-transcript.vtt` | Realistic synthetic Teams WebVTT transcript with speaker labels and timestamps. |
| `pipeline-summary.json` | Synthetic structured `SummaryJson` with recap, decisions, action items, open questions, and warnings. |
| `pipeline-output.html` | Generated HTML approval document produced by the last pipeline test run. |

---

## Target Outcome

- detect completed Teams meetings;
- resolve the Microsoft Graph online meeting record;
- retrieve the generated transcript;
- clean WebVTT content while preserving speaker attribution;
- send transcript chunks to the approved LLM endpoint;
- produce a structured meeting summary;
- route the draft for human approval;
- publish the approved summary to SharePoint; and
- optionally log the approved result in Odoo.

---

## Required Microsoft 365 Components

Create a Power Platform solution named:

```text
ECL Meeting Summary
```

Configure connection references for:

- Office 365 Outlook
- SharePoint
- Approvals
- Azure Key Vault
- HTTP
- Microsoft Graph custom connector

Create a SharePoint processing list named:

```text
MeetingSummaryRuns
```

Use this list as the work queue, duplicate-prevention register, and audit trail.

---

## Key Environment Variables

Full definitions are in `ecl-meeting-summary-orchestrator/resources/solution-manifest.json` and `ecl-meeting-summary-orchestrator/references/solution-setup-and-environment-variables.md`.

| Variable | Purpose |
|---|---|
| `GraphBaseUrl` | Microsoft Graph base URL (`https://graph.microsoft.com/v1.0`). |
| `GraphGatewayBaseUrl` | Approved Azure Function gateway URL used by Flow 02. |
| `DefaultOrganizerUserId` | Entra object ID used in application-authenticated `/users/{userId}` Graph calls. |
| `DefaultOrganizerEmail` | Outlook organizer address paired with the object ID for the first release. |
| `TranscriptInitialDelayMinutes` | Delay before first transcript lookup after a meeting ends. |
| `TranscriptRetryDelayMinutes` | Delay between transcript retrieval attempts. |
| `TranscriptMaximumAttempts` | Maximum transcript lookup attempts before marking failed. |
| `TranscriptChunkMaximumCharacters` | Maximum transcript chunk size before LLM summarisation. |
| `LlmEndpoint` | Approved Azure OpenAI or other approved LLM endpoint URL. |
| `LlmModelDeployment` | Model or deployment name. |
| `LlmSecretName` | Key Vault secret name for the LLM API key. |
| `KeyVaultName` | Azure Key Vault name. |
| `SharePointSiteUrl` | Elewa SharePoint site URL. |
| `ProcessingListName` | SharePoint processing list name (`MeetingSummaryRuns`). |
| `SummaryLibraryName` | SharePoint summary document library name (`Meeting Summaries`). |

---

## Graph Proof of Concept

The current proof uses application authentication with the registered certificate.

The POC must:

- use `/users/{OrganizerUserId}` and the approved Teams application access policy;
- process only scheduled test meetings owned by that organiser;
- avoid tenant-wide application permissions;
- keep automated environment provisioning on hold until the gateway hosting boundary is approved;
- avoid production Odoo writes;
- store secrets only in Key Vault or another approved secret store;
- use an approved Azure OpenAI route for client or citizen data; and
- require human review before publishing any summary.

Required Graph application permissions:

```text
OnlineMeetings.Read.All
OnlineMeetingTranscript.Read.All
```

The organizer's Entra user object ID must be supplied separately from the app registration object ID. A `200` response with an empty transcript collection proves authorization but means a transcript is not yet available.


---

## Microsoft Graph Custom Connector

Create a custom connector named:

```text
ECL Graph Transcript Gateway
```

Use:

```text
Scheme: HTTPS
Host: <approved Function App>.azurewebsites.net
Base URL: /api
```

The current OpenAPI 2.0 definition is in `ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json`.

Required actions:

| Action | Method and path |
|---|---|
| `ResolveMeeting` | `GET /meetings/resolve?organizerUserId=...&joinUrl=...` |
| `ListTranscripts` | `GET /users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts` |
| `GetTranscriptContent` | `GET /users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content` |

For transcript content, request:

```text
Accept: text/vtt
```

> **Note:** Decode a Power Automate `$content` envelope only when the connector actually returns one. If the connector returns `text/vtt` directly, pass the body to the VTT cleaner unchanged.

---

## Security Notes

- Do not store API keys, raw tokens, or client data in SharePoint columns, flow definitions, prompts, or logs.
- Use Azure Key Vault or an approved secret store for LLM credentials.
- Enable **Secure Inputs** and **Secure Outputs** on all Key Vault `Get secret` actions.
- Keep transcript retention minimal and auditable.
- Require explicit human approval for Entra consent, permission expansion, secret creation, production deployment, and irreversible external writes.
- Do not widen permissions when troubleshooting without documenting the failing boundary first.

## Implementation Reference

Use `ECL_Meeting_Summary_Power_Automate_Implementation_Plan.md` as the source of truth for:

- Power Platform solution setup;
- SharePoint column design;
- Teams and Graph configuration;
- flow-by-flow implementation steps;
- LLM prompt and schema handling;
- approval and publishing logic; and
- optional Odoo integration.
