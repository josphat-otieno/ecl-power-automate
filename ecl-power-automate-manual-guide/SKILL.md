---
name: ecl-power-automate-manual-guide
description: Give click-by-click manual instructions for implementing the ECL Meeting Summary Power Automate solution, one verifiable UI checkpoint at a time. Use when the user will perform every portal action themselves and reply only "done" before receiving the next checkpoint. Do not use this skill to perform tenant changes automatically.
---

# ECL Power Automate Manual Guide

Guide the user through the implementation while the user performs every external action.

The assistant must not use a browser, MCP write tool, Azure/Power Platform CLI mutation, or connector to perform the manual checkpoint. The user alone clicks, types, authenticates, creates, changes, tests, or deploys in Microsoft and Azure portals. Read-only inspection is allowed only when the user explicitly asks for help diagnosing a checkpoint.

## Turn protocol

1. Read `progress.json` to identify the first `pending` checkpoint.
2. Read only the ECL implementation reference named for that checkpoint in [references/checkpoint-sequence.md](references/checkpoint-sequence.md).
3. Give exactly one checkpoint. Within that checkpoint, provide every navigation click, selection, form entry, and save action needed to complete its single outcome. Do not preview or bundle later checkpoints.
4. End with `Reply done when this is complete.`
5. When the user replies `done`, mark that checkpoint `completed` in `progress.json`, set `completed_on` to the current ISO timestamp, and present the next pending checkpoint in the same response.
6. If the user reports an error, remain on the same checkpoint, diagnose the failing boundary, and provide one corrective action. Do not advance.
7. If the user says `skip`, explain the impact. Mark it skipped only when later work can continue safely; otherwise keep it pending.

Treat `done` as confirmation that the user performed the action. Never repeat the action through an automated tool after the user reports completion.

Do not ask for screenshots or evidence after routine checkpoints. Ask for the visible error text or a screenshot only when troubleshooting requires it.

## Checkpoint format

Use this structure without extra implementation commentary:

```text
Step <id> — <short outcome>

Where: <portal and starting page>

Actions:
1. <first exact click or navigation action>
2. <next exact selection or form entry>
3. <save/create action>

Values:
- <field>: <exact non-secret value>

Done when: <one visible success condition>

Reply done when this is complete.
```

A checkpoint represents one atomic outcome, such as creating one container, connection reference, environment variable, SharePoint column, connector operation, flow action, or test assertion. Include all click-by-click actions needed for that outcome, but do not add a second outcome under the same `done` response.

Do not use vague directions such as `configure the connector`, `create the flow`, or `fill in the required fields`. Name the visible menu, button, control, field, selected option, and exact non-secret value. Include how to reach controls hidden under menus such as `New`, `More`, `Settings`, or `Advanced options`.

When Microsoft changes a label, give the current likely label followed by a recognizable alternative in parentheses. If the user cannot find it, remain on the checkpoint and ask what labels are visible.

## Implementation boundaries

- Target Development until the manual end-to-end test passes and Production deployment is explicitly approved.
- Keep the `ECL Meeting Transcript` certificate application dedicated to Graph transcript retrieval.
- The Power Automate MCP authoring application is out of scope while using this manual guide.
- Use the certificate-authenticated gateway for Flow 02. Never configure the legacy delegated `/me` connector as the production path.
- `OrganizerUserId` is the meeting organizer's Entra user object ID. It is never the app registration object ID or an email address.
- Never ask the user to paste a certificate, private key, API key, client secret, function key, access token, transcript, or client data into chat.
- When a step handles a secret, tell the user where to enter it privately and how to confirm success without revealing the value.
- Pause at admin consent, permission expansion, Azure role assignment, production import, deletion, connector replacement, and irreversible publication checkpoints. State the effect before instructing the user to perform the action.
- Nothing is published before the human approval flow succeeds.

## Source of truth

Use the current repository assets rather than reproducing values from memory:

- Solution configuration: `../ecl-meeting-summary-orchestrator/resources/solution-manifest.json`
- SharePoint schema: `../ecl-meeting-summary-orchestrator/resources/sharepoint-list-schema.json`
- Gateway connector: `../ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json`
- Flow 02 contract: `../power-automate/flow-specs/ECL-MS-02-retrieve-teams-transcript.json`
- Detailed procedures: `../ecl-meeting-summary-orchestrator/references/`

If the repository contract and the visible portal disagree, stop on the current checkpoint and explain the mismatch before changing either one.
