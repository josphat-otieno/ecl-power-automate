---
name: ecl-meeting-summary-orchestrator
description: Orchestrate ECL's Power Automate meeting-summary work. Use as the entry point for requests to plan, set up, build, validate, troubleshoot, or release the Teams transcript summarisation flow, especially while Entra admin consent or production approval is pending. First inventory available tools, identities, permissions, and environment; then select and coordinate only the relevant implementation procedure, skills, checklists, or dry-run validation.
---

# ECL Meeting Summary Orchestrator

## Start here

Before planning or changing a system, inventory the available tools and connections. Identify whether the agent can:

- inspect or modify Power Automate solutions and flows;
- access SharePoint, Microsoft Graph, Azure Key Vault, the chosen LLM, and Odoo;
- use a browser or an authenticated connector for any unavailable integration;
- access a sandbox or production environment; and
- inspect run history and test evidence.

State missing capabilities and request the least-privilege access needed. Do not claim that a connector or permission exists until it has been verified.

## Route the request

- **Delegated proof of concept:** Read [references/delegated-proof-of-concept.md](references/delegated-proof-of-concept.md). Use only the organiser's own scheduled test meetings.
- **Admin consent or approval pending:** Read [references/admin-application-rights-granted.md](references/admin-application-rights-granted.md). Build reusable implementation assets, dry-run checks, and approval packets without touching tenant-wide permissions or production data.
- **Flow implementation:** Read [references/build-checklists.md](references/build-checklists.md) for the specific flow or component being built.
	- **Dispatch completed meetings:** Read [references/dispatch-completed-meetings.md](references/dispatch-completed-meetings.md).
	- **Transcript retrieval and cleaning:** Read [references/transcript-retrieval-and-cleaning.md](references/transcript-retrieval-and-cleaning.md).
	- **Summarisation and chunking:** Read [references/summarisation-and-chunking.md](references/summarisation-and-chunking.md).
	- **Key Vault secret retrieval:** Read [references/key-vault-secret-retrieval.md](references/key-vault-secret-retrieval.md).
	- **Approval and SharePoint publication:** Read [references/approval-and-sharepoint-publication.md](references/approval-and-sharepoint-publication.md).
- **Prompt, schema, or dry-run validation:** Read [references/llm-validation-guidance.md](references/llm-validation-guidance.md) before changing prompts or accepting model output.
- **Production or application access:** Stop after documenting the required architecture, security review, approval owners, and rollback plan. Do not grant tenant-wide permissions or deploy without explicit human approval.
- **Troubleshooting:** Determine the failing boundary first: trigger, meeting lookup, transcript retrieval, VTT parsing, LLM response, approval, publishing, or Odoo.
- **SharePoint schema & data contract:** Read [references/sharepoint-schema-and-provisioning.md](references/sharepoint-schema-and-provisioning.md).
- **Solution setup & environment variables:** Read [references/solution-setup-and-environment-variables.md](references/solution-setup-and-environment-variables.md).
- **Local dry-run validation:** Run `node scripts/run-pipeline-test.js` to verify the full Flows 01–04 data contract end-to-end before live deployment.
- **Review or design:** Compare the proposed change against the handoff requirements, data-residency rule, auditability, approval gate, and minimal-retention principle.

## Orchestration rules

- Execute the smallest independently verifiable step; use its evidence to choose the next one.
- Prefer existing authenticated tools. If a tool is unavailable, report the capability gap rather than imitating access.
- Keep secrets out of flow definitions, logs, prompts, SharePoint, and chat.
- Keep client or citizen data in an approved Azure OpenAI route. Escalate any request to use an external model.
- Require human approval for Entra consent, permission expansion, secret creation, production deployment, and irreversible external writes.
- While approvals are pending, prefer work that creates reusable skill instructions, implementation checklists, synthetic fixtures, prompt schemas, runbook drafts, and approval evidence.

## Report

After each stage, report the chosen path, tools used, evidence, blockers, and the least-privilege next action.
