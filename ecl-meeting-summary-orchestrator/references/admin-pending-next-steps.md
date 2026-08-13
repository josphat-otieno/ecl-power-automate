# Admin consent pending next steps

Use this when Entra admin consent, custom connector approval, Key Vault approval, or production deployment approval is not yet available.

## Boundary

- Do not request, grant, simulate, or assume tenant-wide application permissions.
- Do not create production flows, secrets, Odoo writes, or irreversible external records.
- Do not process real client or citizen transcripts unless the approved test route and retention controls are confirmed.
- Treat Graph access and Power Platform connections as unavailable until verified in the current environment.
- Defer the external `powerautomate-mcp` / Power Platform MCP integration until after the delegated POC proves the core transcript-to-summary path.
- Keep the local `ecl-power-automate-mcp` Graph helper conceptually separate from the external Power Platform MCP track.

## Build now

Create or refine reusable implementation assets:

- Flow build checklists for `ECL-MS-01` through `ECL-MS-04` and optional `ECL-MS-05`.
- SharePoint list schema, status values, and duplicate-prevention rules.
- Custom connector action definitions and sample request/response shapes.
- Synthetic VTT transcript fixtures with speaker labels and edge cases.
- VTT-cleaning expressions and expected cleaned outputs.
- LLM prompt text, JSON schema, and invalid-response handling rules.
- Approval packet template covering permission scope, data flow, retention, rollback, and evidence.
- Test plan with delegated POC, dry-run, and production readiness gates.
- Runbook notes for common failures and least-privilege next actions.

## Park for after POC

- External `powerautomate-mcp` / Power Platform MCP evaluation, installation, and tenant connection.
- MCP/plugin packaging beyond the existing local ECL placeholder.
- Power Platform inspection or authoring tools.
- Production Graph application-access tooling.
- Automated transcript retrieval outside the delegated POC boundary.
- Odoo write integrations.

## Useful dry runs

- Validate Power Automate expressions against synthetic text.
- Chunk synthetic transcript text and verify chunk boundaries preserve speaker turns.
- Send harmless synthetic transcripts to the approved test LLM endpoint only if credentials and endpoint approval are already available.
- Review generated summaries against source text for hallucinated owners, dates, actions, or decisions.
- Walk through SharePoint status transitions manually without calling Graph.

## Approval packet contents

Document the exact request before asking an administrator:

- Environment name and owner.
- Delegated POC or production/application-access path.
- Requested Microsoft Graph scopes and why each is needed.
- Data categories processed, retention location, and deletion policy.
- Secret names and storage location, without secret values.
- Human approval gate before publication.
- Rollback plan and disabled-state behavior.
- Test evidence already collected from synthetic or delegated-safe runs.

## Exit criteria

Move from preparation to connected implementation only when:

- The target environment is confirmed.
- Required identities and consent path are approved.
- Connection references can be authenticated.
- Secret storage is ready.
- The approved LLM route is known.
- The human reviewer and publication destination are confirmed.
