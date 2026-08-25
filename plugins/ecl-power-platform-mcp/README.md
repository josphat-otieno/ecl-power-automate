# ECL Power Platform MCP

This project-scoped plugin launches the upstream `powerautomate-mcp` server without mixing it with the existing read-only Graph transcript helper.

## Initial setup

Run the upstream setup once and select the approved Power Platform Development environment:

```bash
npx -y powerautomate-mcp@latest --setup --client codex --npx
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

After setup, run the upstream diagnostic and validation commands before using write tools:

```bash
npx -y powerautomate-mcp@latest --doctor
npx -y powerautomate-mcp@latest --validate
```
