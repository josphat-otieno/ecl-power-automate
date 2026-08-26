# ECL Power Platform MCP

This project-scoped plugin launches upstream `powerautomate-mcp` version `0.16.12` without mixing it with the existing read-only Graph transcript helper. Pinning the package keeps the advertised tools stable while the ECL flows are implemented.

## What this plugin implements

- Power Platform environment, solution, connection, and flow inventory.
- Cloud-flow planning, creation, inspection, validation, testing, and debugging.
- Power Platform solution-aware work for the `ECL Meeting Summary` solution.
- A separate authentication boundary from the certificate application used by the Graph transcript gateway.

The plugin does not contain Microsoft credentials. Upstream stores the delegated sign-in through the operating system's secure credential storage and keeps its non-secret configuration outside this repository.

## Initial setup

From this directory, run setup once and select the approved Power Platform Development environment:

```bash
npm run setup
```

Use a separate public-client Entra registration for MCP authoring. Do not add Flow Service or Power Apps delegated permissions to the certificate application used by the transcript gateway.

Start with the Power Automate-only permission preset. Add connector or SharePoint capabilities only when the corresponding implementation step requires them and an administrator has approved them.

## Operating guardrails

- Inventory environments, solutions, connections, and existing flows before making changes.
- Target Development only until the manual end-to-end acceptance test passes.
- Export or capture the current solution state before updating an existing cloud flow.
- Require confirmation before flow deletion, production import, permission expansion, or connection replacement.
- Never place certificates, access tokens, client secrets, function keys, transcript bodies, or LLM keys in MCP prompts or flow descriptions.
- Keep the Graph certificate application separate from the delegated MCP authoring application.

Setup configures the current Codex installation to launch the pinned package through `npx`. Restart Codex after setup so the new MCP server is loaded.

Before using write tools, run:

```bash
npm run doctor
npm run validate
```

Run `npm test` to verify the project plugin contract without signing in or contacting Power Platform.

## First implementation session

1. Use read-only tools to identify the selected environment and confirm it is Development.
2. Inventory the `ECL Meeting Summary` solution, existing flows, connections, connection references, and environment variables.
3. Compare the inventory with `power-automate/flow-specs/ECL-MS-02-retrieve-teams-transcript.json`.
4. Ask for confirmation before creating or changing Flow 02.
5. Validate the flow after each change and capture the resulting flow ID and validation output.

Do not use this plugin to alter the old manual-guide skill or the read-only Graph transcript MCP.
