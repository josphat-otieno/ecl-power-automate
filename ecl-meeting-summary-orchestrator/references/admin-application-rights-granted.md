# Application rights granted next steps

Use this when the Entra application has already been created and granted the required Microsoft Graph rights, but the implementation still needs controlled validation before production use.

This is no longer an admin-consent waiting track. The next work should prove that the approved application, connector configuration, Power Automate flows, SharePoint resources, and LLM route work together without widening permissions or touching production-only integrations too early.

## Boundary

- Do not request additional Microsoft Graph scopes unless a specific failing boundary proves they are required.
- Do not create production Odoo writes or irreversible external records during validation.
- Do not process real client or citizen transcripts until the approved LLM route, retention controls, and reviewer path are confirmed.
- Treat the granted application rights as available only after they are verified in the current Power Platform environment.
- Store client secrets or certificates only in Key Vault or another approved secret store.
- Defer the external `powerautomate-mcp` / Power Platform MCP integration until after the delegated POC proves the core transcript-to-summary path.
- Keep the local `ecl-power-automate-mcp` Graph helper conceptually separate from the external Power Platform MCP track.

## Verify first

Confirm the approved application details before building flows around it:

- Entra application ID and tenant ID.
- Granted Microsoft Graph scopes.
- Whether the approved design is delegated `/me`, application access, or both.
- Teams transcript API access and speaker attribution settings.
- Secret storage location and secret name, without exposing the secret value.
- Power Platform environment name.
- SharePoint site, processing list, and summary library.
- Approved LLM endpoint, deployment, and data boundary.
- Human reviewer or approval owner.

## Build now

Proceed with connected implementation assets:

- Create or confirm the `ECL Meeting Summary` Power Platform solution.
- Create connection references for Outlook, SharePoint, Approvals, Azure Key Vault, HTTP, and the Microsoft Graph custom connector.
- Create environment variables for Graph, retries, chunk size, LLM settings, Key Vault, SharePoint, and prompt version.
- Create or confirm the `MeetingSummaryRuns` SharePoint list and `Meeting Summaries` document library.
- Configure the Microsoft Graph custom connector with the approved application details.
- Build `ECL-MS-02` first to resolve one meeting, retrieve one transcript, and clean VTT text.
- Build `ECL-MS-03` as a reusable summarisation child flow using the approved LLM route.
- Connect `ECL-MS-02` to `ECL-MS-03` only after each piece works independently.
- Add `ECL-MS-04` approval and SharePoint publication after summary output is valid and reviewable.

## Park for later

- Extra Microsoft Graph scope requests.
- External `powerautomate-mcp` / Power Platform MCP evaluation, installation, and tenant connection.
- Production Odoo write integrations.
- Broad scheduled processing across many organisers.
- Any move from delegated validation to application-wide processing unless explicitly approved.

## Useful validation runs

- Validate the custom connector by resolving one known scheduled Teams test meeting.
- List transcripts after the configured transcript delay and retry window.
- Retrieve one transcript as `text/vtt`.
- Clean VTT metadata while preserving speaker attribution and utterance order.
- Validate chunking with synthetic and retrieved transcript text.
- Send harmless synthetic or approved test transcript content to the approved LLM endpoint.
- Review generated summaries against the source text for hallucinated owners, dates, actions, or decisions.
- Walk through SharePoint status transitions from `Queued` through `PendingApproval`.
- Confirm that secrets, access tokens, and full raw transcripts are not exposed in run history.

## Evidence packet contents

Document the validation evidence before asking for production deployment:

- Environment name and owner.
- Entra application ID and approved Graph scopes.
- Confirmed access model: delegated, application access, or both.
- Test meeting metadata used for validation.
- Custom connector action definitions and successful test evidence.
- SharePoint list and library names.
- LLM endpoint route and secret name, without secret values.
- Data categories processed, retention location, and deletion policy.
- Human approval gate before publication.
- Flow run evidence for transcript retrieval, VTT cleaning, summarisation, and approval readiness.
- Rollback plan and disabled-state behavior.
- Known limitations and unresolved risks.

## Exit criteria

Move from connected validation to production deployment only when:

- The target environment is confirmed.
- The approved application rights are verified from the connector or flow.
- Connection references authenticate successfully.
- Secret storage is configured and no secret values are exposed.
- The approved LLM route is known.
- One scheduled test meeting can be resolved and its transcript retrieved.
- VTT cleaning preserves speakers and removes metadata.
- The LLM returns valid structured JSON without invented facts.
- The human reviewer and publication destination are confirmed.
- Approval remains mandatory before SharePoint publication.
- Production Odoo writes remain disabled unless separately approved.
