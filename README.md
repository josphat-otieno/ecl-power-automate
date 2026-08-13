# ECL Power Automate Meeting Summary

This repository contains the implementation materials for ECL's Teams meeting-summary automation using Microsoft Power Automate, Microsoft Graph, SharePoint, approvals, and a selected LLM endpoint.

The current architecture does not require a separately hosted agent or Copilot Studio. Power Automate performs the orchestration directly:

```text
Flow 01 - Find completed meetings
    -> Flow 02 - Retrieve and clean transcript
    -> Flow 03 - Chunk and summarise through LLM endpoint
    -> Flow 04 - Request approval and publish
    -> Optional Flow 05 - Log approved summary in Odoo
```

## Repository Contents

| Path | Purpose |
|---|---|
| `ECL_Meeting_Summary_Power_Automate_Implementation_Plan.md` | Main Power Automate implementation plan, including solution setup, environment variables, SharePoint schema, Graph connector actions, and flow design. |
| `ECL_Handoff_MeetingSummaryFlow_07082026.docx` | Handoff document for the meeting-summary flow. |
| `ecl-meeting-summary-orchestrator/` | Codex skill instructions for planning, validating, troubleshooting, and coordinating this implementation safely. |
| `ecl-meeting-summary-orchestrator/references/delegated-poc.md` | Delegated proof-of-concept procedure and acceptance checks. |
| `plugins/ecl-power-automate-mcp/scripts/graph-readonly-mcp.mjs` | Read-only Microsoft Graph MCP helper for delegated transcript proof-of-concept work. |

## Target Outcome

The automation should:

- detect completed Teams meetings;
- resolve the Microsoft Graph online meeting record;
- retrieve the generated transcript;
- clean WebVTT content while preserving speaker attribution;
- send transcript chunks to the approved LLM endpoint;
- produce a structured meeting summary;
- route the draft for human approval;
- publish the approved summary to SharePoint; and
- optionally log the approved result in Odoo.

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

## Key Environment Variables

The implementation plan defines the full set of variables. Core values include:

| Variable | Purpose |
|---|---|
| `GraphBaseUrl` | Microsoft Graph base URL, normally `https://graph.microsoft.com/v1.0`. |
| `TranscriptInitialDelayMinutes` | Delay before first transcript lookup after a meeting ends. |
| `TranscriptRetryDelayMinutes` | Delay between transcript retrieval attempts. |
| `TranscriptMaximumAttempts` | Maximum transcript lookup attempts. |
| `TranscriptChunkMaximumCharacters` | Maximum transcript chunk size before LLM summarisation. |
| `LlmEndpoint` | Approved Azure OpenAI or other approved LLM endpoint. |
| `LlmModelDeployment` | Model or deployment name. |
| `LlmSecretName` | Secret name for the LLM API key. |
| `KeyVaultName` | Azure Key Vault name. |
| `SharePointSiteUrl` | Elewa SharePoint site URL. |
| `ProcessingListName` | SharePoint processing list name. |
| `SummaryLibraryName` | SharePoint summary document library name. |

## Delegated Proof of Concept

Start with a delegated proof of concept before productionising the flow.

The POC must:

- use the meeting organiser's delegated Microsoft 365 identity only;
- process only scheduled test meetings owned by that organiser;
- avoid tenant-wide application permissions;
- avoid production Odoo writes;
- store secrets only in Key Vault or another approved secret store;
- use an approved Azure OpenAI route for client or citizen data; and
- require human review before publishing any summary.

Recommended delegated Graph scopes:

```text
OnlineMeetings.Read
OnlineMeetingTranscript.Read.All
```

See `ecl-meeting-summary-orchestrator/references/delegated-poc.md` for the detailed POC sequence and acceptance checks.

## Microsoft Graph Custom Connector

Create a custom connector named:

```text
ECL Microsoft Graph Meetings
```

Use:

```text
Scheme: HTTPS
Host: graph.microsoft.com
Base URL: /v1.0
```

Required actions:

| Action | Method and path |
|---|---|
| `ResolveMeeting` | `GET /me/onlineMeetings` |
| `ListTranscripts` | `GET /me/onlineMeetings/{meetingId}/transcripts` |
| `GetTranscriptContent` | `GET /me/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content` |

For transcript content, request:

```text
Accept: text/vtt
```

## Security Notes

- Do not store API keys, raw tokens, or client data in SharePoint columns, flow definitions, prompts, or logs.
- Use Azure Key Vault or an approved secret store for LLM credentials.
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
