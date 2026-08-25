# Solution setup and environment variables

Purpose
- Provide a step-by-step implementer guide for creating, packaging, and configuring the **`ECL Meeting Summary`** Power Platform solution, its 15 Environment Variables, 6 Connection References, and the Graph transcript gateway connector.

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
| `ecl_GraphBaseUrl` | Graph Base URL | String | `https://graph.microsoft.com/v1.0` | Microsoft Graph API v1.0 base endpoint used by the gateway. |
| `ecl_GraphGatewayBaseUrl` | Graph Transcript Gateway Base URL | String | Environment-specific | Approved Azure Function gateway URL used by Power Automate. |
| `ecl_DefaultOrganizerUserId` | Default Organizer Entra User ID | String | Environment-specific GUID | Organizer object ID used in `/users/{userId}` for the first single-organizer release. |
| `ecl_DefaultOrganizerEmail` | Default Organizer Email | String | Environment-specific | Outlook filtering identity paired with the organizer object ID. |
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
| `ecl_shared_graphgateway` | Graph Transcript Gateway Connection | Custom Connector ID | Calling the certificate-authenticated gateway without placing certificate material in flows. |

---

## 4. Graph Transcript Gateway Connector Setup

- **Connector Name:** `ECL Graph Transcript Gateway`
- **Definition File:** `ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json`
- **Host:** Replace with the approved Azure Function App host before import.
- **Base URL:** `/api`
- **Authentication:** API key in the `x-functions-key` header, stored only in the connector connection.
- **Graph authentication:** The gateway uses the approved Entra certificate and application token. Certificate/private-key values are Key Vault references in Function App settings and are never stored in Power Automate.
- **Implementation:** `services/graph-transcript-gateway/`

---

## 5. ALM & Deployment Checklist

1. **Create Solution:** Create unmanaged solution `ECL Meeting Summary` in Development environment.
2. **Add Components:**
   - Add the 6 Connection References and 15 Environment Variables.
   - Add the custom connector `ECL Graph Transcript Gateway`.
   - Add cloud flows `ECL-MS-01`, `ECL-MS-02`, `ECL-MS-03`, `ECL-MS-04` (and optional `ECL-MS-05`).
3. **Export Solution:** Export as **Managed** for staging and production environments.
4. **Environment Deployment:**
   - Import solution into target environment.
   - Bind connection references to service account / managed identities.
   - Populate environment variable current values without modifying schema definitions.
