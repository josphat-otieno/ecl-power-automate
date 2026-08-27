# ECL Graph Transcript Gateway

This Azure Functions service is the certificate-authentication boundary between Power Automate and Microsoft Graph. Power Automate calls the gateway through a custom connector; the gateway creates a short-lived client assertion, obtains an application token, and calls Graph through `/users/{organizerUserId}`.

The service never returns access tokens or certificate material. Transcript bodies are returned only by the explicit content operation and should have secure inputs/outputs enabled in Flow 02.

## Operations

| Route | Purpose |
|---|---|
| `GET /api/users/{organizerUserId}/transcripts/discover` | Discover scheduled Teams transcripts created in a bounded UTC window |
| `GET /api/users/{organizerUserId}/onlineMeetings/{meetingId}` | Return minimal Teams meeting metadata |
| `GET /api/meetings/resolve` | Legacy/fallback join-URL meeting resolution |
| `GET /api/users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts` | List transcripts for one known meeting |
| `GET /api/users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content` | Download WebVTT transcript content |

The discovery operation uses Microsoft Graph v1.0 `getAllTranscripts`. It supports scheduled Teams meetings but not channel meetings. Ad-hoc calls require a separate endpoint and are not part of the initial Flow 01 source scope.

## Required application settings

| Setting | Source |
|---|---|
| `ECL_ENTRA_CLIENT_ID` | Entra application client ID |
| `ECL_ENTRA_TENANT_ID` | Entra tenant ID |
| `ECL_ENTRA_CERT_PEM` | Key Vault reference to the public PEM certificate |
| `ECL_ENTRA_PRIVATE_KEY_PEM` | Key Vault reference to the private PEM key |

For local testing only, `ECL_ENTRA_CERT_PATH` and `ECL_ENTRA_PRIVATE_KEY_PATH` may be used instead of PEM-valued settings. Never commit `local.settings.json`, certificates, private keys, function keys, or access tokens.

## Security boundary

- Set all transcript operations to Azure Functions `function` authorization.
- Store the function key in the Power Platform custom connector connection, not in a flow definition or environment variable.
- Give the Function App managed identity only `Key Vault Secrets User` access to the two certificate secrets.
- Restrict the existing Teams application access policy to approved organizer user IDs.
- Grant only `OnlineMeetingTranscript.Read.All` and the other explicitly approved online-meeting permissions required by the enabled routes; Flow 01 does not require Outlook calendar permission.
- Enable tenant Graph transcript API access for only the approved application and organizer scope.
- Disable request/response body logging for transcript routes and apply the agreed transcript retention policy.

## Deployment sequence

1. Obtain security approval for the Azure Function hosting boundary and data region.
2. Create a Function App in the approved subscription and region with Node.js 20 or 22.
3. Enable its system-assigned managed identity and grant least-privilege Key Vault secret read access.
4. Configure the four application settings above using Key Vault references.
5. Deploy this folder, call `/api/health`, and then test `meetings/resolve` with a function key.
6. Replace the placeholder host in `resources/graph-gateway-connector-swagger.json`, import the connector, and save the function key only in its connection.
7. Bind the connector connection reference and build Flow 02.

Rollback is reversible: disable the Function App, revoke its Key Vault role, remove its connector connection, and leave the existing Graph application access policy unchanged until investigation is complete.
