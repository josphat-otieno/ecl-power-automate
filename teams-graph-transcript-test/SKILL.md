---
name: teams-graph-transcript-test
description: Test Microsoft Teams meeting resolution and transcript access through Microsoft Graph using certificate-based application authentication. Use when given a Teams join URL and asked to verify the organizer, application permissions, application access policy, transcript availability, or VTT retrieval. Do not use merely to join or participate in a meeting.
---

# Teams Graph Transcript Test

Perform a read-only, evidence-based test of the Graph path from a Teams join URL to its transcript. Use the existing helper at `plugins/ecl-power-automate-mcp/scripts/graph-readonly-mcp.mjs` when working in this repository.

## Required inputs

- Teams join URL.
- Entra tenant ID and application (client) ID.
- Certificate and matching private-key paths.
- Organizer's Entra **user GUID**.

For a long Teams join URL, decode the `context` query parameter and inspect `Oid`; it usually identifies the organizer. Verify it when practical. A short `/meet/{code}` URL does not expose the organizer GUID.

Never use the app registration's Object ID as the organizer user ID. Graph application calls use `/users/{organizerUserGuid}/onlineMeetings`; they do not use `/me`, an email address, or the service principal/app object ID for this workflow.

## Authentication

Configure these environment variables without printing their values:

- `ECL_ENTRA_CLIENT_ID`
- `ECL_ENTRA_TENANT_ID`
- `ECL_ENTRA_CERT_PATH`
- `ECL_ENTRA_PRIVATE_KEY_PATH`

Call `acquire_app_token` in the existing Graph helper. Certificate authentication succeeding proves only token issuance; it does not by itself prove Graph roles or meeting access.

Before using the certificate, inspect only its non-secret metadata and confirm that it is valid and that its SHA-1 thumbprint matches a certificate registered on the application. Never print the private key, token, client assertion, or raw environment values.

## Test sequence

1. Resolve the organizer user GUID from the supplied context or trusted user-directory lookup.
2. Acquire an application token with the certificate.
3. Call `resolve_meeting_by_join_url` with the exact join URL and organizer user GUID.
4. If one meeting resolves, record only safe evidence: subject, organizer, schedule, meeting type, transcription setting, and opaque meeting ID when needed for the next call.
5. Call `list_meeting_transcripts` with that meeting ID and the same organizer GUID.
6. Report transcript count. A successful empty collection is valid evidence that the endpoint is authorized but no processed transcript is available.
7. Call `get_transcript_vtt` only when the user asks to retrieve or process content. Save it to an approved local path; do not dump the transcript into chat or logs.

Use the same authenticated helper process for token acquisition and Graph calls because its access token is held in memory. If the helper is invoked as a standalone newline-delimited JSON-RPC process, send the calls in order before closing standard input.

## Interpret results precisely

- Token endpoint failure: certificate, thumbprint, tenant, client ID, key pairing, or app configuration problem.
- `400` stating that `userId` is not a valid GUID: an email address or wrong identifier was used.
- `403 Insufficient permissions`: inspect the application roles and admin consent. Meeting resolution normally needs `OnlineMeetings.Read.All`; transcripts need `OnlineMeetingTranscript.Read.All`.
- `403` stating that no application access policy exists: the Teams application access policy is missing for that organizer.
- `404 / 3004 Specified meeting is not found`: Graph cannot locate the meeting under that organizer. Verify the URL/organizer pair and consider a stale, deleted, expired, external, or differently owned meeting. Do not misreport this as successful transcript access.
- `200` with `value: []`: the call is authorized, but no transcript is currently available. Confirm transcription was started, the meeting ended, and Teams had time to process it.
- A listed transcript followed by successful VTT retrieval: the end-to-end Graph boundary is validated.

Do not widen permissions, create access policies, change the app registration, or alter a meeting unless the user explicitly authorizes that separate action.

## Report

Lead with the outcome and state separately:

- certificate authentication;
- organizer identity used;
- meeting resolution;
- transcript endpoint authorization and count;
- whether VTT content was retrieved; and
- the least-privilege next action for any blocker.

Include Graph status/error codes and request IDs when available, but exclude tokens, private keys, passcodes, full join metadata, and transcript text.
