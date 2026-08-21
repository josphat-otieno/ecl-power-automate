# Solution setup and environment variables

Purpose
- Provide a step-by-step implementer guide for creating, packaging, and configuring the **`ECL Meeting Summary`** Power Platform solution, its 12 Environment Variables, 6 Connection References, and the Microsoft Graph Custom Connector.

---

## 1. Solution Definition

- **Display Name:** `ECL Meeting Summary`
- **Name (Schema):** `ECLMeetingSummary`
- **Publisher:** `Elewa` (Prefix: `ecl_`)
- **Version:** `1.0.0.0`
- **Description:** `Automated Teams meeting transcript summarisation, human review, and SharePoint document publishing pipeline.`

---

## 2. Environment Variables Specification

All environment variables must use the publisher prefix `ecl_` to support Application Lifecycle Management (ALM) and seamless environment migration (Dev $\rightarrow$ Test $\rightarrow$ Prod).

| Schema Name | Display Name | Type | Default Value | Description |
|---|---|---|---|---|
| `ecl_GraphBaseUrl` | Graph Base URL | String | `https://graph.microsoft.com/v1.0` | Microsoft Graph API v1.0 base endpoint. |
| `ecl_TranscriptInitialDelayMinutes` | Transcript Initial Delay (Minutes) | Number | `15` | Lookback delay after a meeting ends before checking for transcripts. |
| `ecl_TranscriptRetryDelayMinutes` | Transcript Retry Delay (Minutes) | Number | `5` | Wait time between transcript lookup attempts. |
| `ecl_TranscriptMaximumAttempts` | Transcript Maximum Attempts | Number | `6` | Maximum retry attempts for transcript retrieval before timing out. |
| `ecl_TranscriptChunkMaximumCharacters` | Transcript Chunk Maximum Characters | Number | `12000` | Maximum character length per transcript chunk sent to LLM. |
| `ecl_LlmEndpoint` | LLM Endpoint | String | `https://your-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview` | Approved Azure OpenAI or LLM endpoint URL. |
| `ecl_LlmModelDeployment` | LLM Model Deployment | String | `gpt-4o` | Model deployment name. |
| `ecl_LlmSecretName` | LLM Secret Name | String | `ECL-AzureOpenAI-ApiKey` | Azure Key Vault secret name for the LLM API key (value never stored in flow). |
| `ecl_KeyVaultName` | Key Vault Name | String | `kv-ecl-prod` | Name of the Azure Key Vault instance. |
| `ecl_SharePointSiteUrl` | SharePoint Site URL | String | `https://elewa.sharepoint.com/sites/ECLAutomations` | Target SharePoint Site Collection URL. |
| `ecl_ProcessingListName` | Processing List Name | String | `MeetingSummaryRuns` | Work queue and duplicate prevention list name. |
| `ecl_SummaryLibraryName` | Summary Library Name | String | `Meeting Summaries` | Document library name for published HTML/Markdown reports. |

---

## 3. Connection References Specification

The solution requires 6 connection references to connect flows with Microsoft 365, Azure, and custom services:

| Schema Name | Display Name | Connector ID | Purpose |
|---|---|---|---|
| `ecl_shared_office365` | Office 365 Outlook Connection | `shared_office365` | Querying calendar views and sending notification emails. |
| `ecl_shared_sharepointonline` | SharePoint Connection | `shared_sharepointonline` | Managing `MeetingSummaryRuns` and publishing files to `Meeting Summaries`. |
| `ecl_shared_approvals` | Approvals Connection | `shared_approvals` | Creating and managing human review cards. |
| `ecl_shared_azurekeyvault` | Azure Key Vault Connection | `shared_azurekeyvault` | Securely retrieving LLM credentials using ephemeral `Get secret`. |
| `ecl_shared_http` | HTTP Connection | `shared_http` | Invoking the approved Azure OpenAI / LLM endpoint. |
| `ecl_shared_graphconnector` | Graph Meetings Custom Connector | Custom Connector ID | Executing delegated `/me/onlineMeetings` and transcript queries. |

---

## 4. Microsoft Graph Custom Connector Setup

- **Connector Name:** `ECL Microsoft Graph Meetings`
- **Definition File:** `ecl-meeting-summary-orchestrator/resources/graph-connector-swagger.json`
- **Host:** `graph.microsoft.com`
- **Base URL:** `/v1.0`
- **Authentication:** OAuth 2.0 (Azure Active Directory)
  - **Client ID:** `<Entra Application Client ID>`
  - **Client Secret:** `<Entra Application Client Secret>`
  - **Authorization URL:** `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
  - **Token URL:** `https://login.microsoftonline.com/common/oauth2/v2.0/token`
  - **Resource URL:** `https://graph.microsoft.com`
  - **Scopes:** `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`, `offline_access`

---

## 5. ALM & Deployment Checklist

1. **Create Solution:** Create unmanaged solution `ECL Meeting Summary` in Development environment.
2. **Add Components:**
   - Add the 6 Connection References and 12 Environment Variables.
   - Add the custom connector `ECL Microsoft Graph Meetings`.
   - Add cloud flows `ECL-MS-01`, `ECL-MS-02`, `ECL-MS-03`, `ECL-MS-04` (and optional `ECL-MS-05`).
3. **Export Solution:** Export as **Managed** for staging and production environments.
4. **Environment Deployment:**
   - Import solution into target environment.
   - Bind connection references to service account / managed identities.
   - Populate environment variable current values without modifying schema definitions.
