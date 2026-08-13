# ECL Power Automate MCP

This plugin wraps the upstream [powerautomate-mcp](https://github.com/rcb0727/powerplatform-mcp-docs) package. The upstream project describes it as a Power Platform MCP server whose npm package remains `powerautomate-mcp`.

## MCP Server

The plugin starts the MCP server with:

```text
npx -y powerautomate-mcp@latest
```

Run setup once before relying on the MCP tools:

```bash
npx -y powerautomate-mcp@latest --setup --client codex --npx
```

Useful checks:

```bash
npx -y powerautomate-mcp@latest --doctor
npx -y powerautomate-mcp@latest --validate
```

## Optional Host Environment

The MCP config passes through these variables when supplied by the host:

- `PA_MCP_CLIENT_ID`
- `PA_MCP_TENANT_ID`
- `PA_MCP_ENVIRONMENT_ID`
- `PA_MCP_ENVIRONMENT_REGION`

Authentication and Power Platform permissions are handled by the upstream setup flow.
