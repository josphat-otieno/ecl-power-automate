# Key Vault secret retrieval

Purpose
- Securely retrieve secrets (LLM API keys, connector secrets) from Azure Key Vault for use in Power Automate flows and child summarisation routines.

Principles
- Never store secret values in SharePoint, flow definitions, run notes, or logs.
- Use secure inputs/outputs in Power Automate actions and treat Key Vault secrets as ephemeral values.
- Prefer managed identity or platform-integrated connectors over embedding client secrets in flows.

Prerequisites
- An Azure Key Vault with the required secrets created and named.
- A Power Platform connection with access to Key Vault (Managed Identity, Service Principal, or connector configured).
- Secure Inputs/Outputs capability enabled on actions that process secrets.

Connector options
- **Managed identity (recommended):** Assign the Power Platform environment's managed identity appropriate `get` permission to the Key Vault access policy or RBAC role.
- **Service principal / app registration:** Grant the app `get` secret permissions on the Key Vault and store its client secret securely in your pipeline or environment; avoid embedding in flows.
- **Power Automate Key Vault connector:** Use only when configured with least-privilege credentials and secure inputs/outputs enabled.

Power Automate pattern
1. Store secret *names* (not values) in environment variables or connection references: `LlmSecretName`, `GraphClientSecretName`, etc.
2. In the flow, retrieve the secret value using the Key Vault connector action (e.g., `Get secret`), passing the secret name from the environment variable.
3. Immediately use the retrieved value as a secure input to the next action (HTTP/LLM call) and mark the `Get secret` action's outputs as secure where supported.
4. Do not write the secret value to SharePoint, compose actions, or run history; if you must log, log only secret names or masked markers (e.g., `***REDACTED***`).
5. If calling a child flow, pass secret values via secure input parameters (Power Automate secure inputs) rather than storing them in the processing item.

Power Automate example (pseudo-steps)
- `Get secret` (Key Vault): Secret name = `variables('LlmSecretName')` → output `llmKey` (secure)
- `HTTP` action to LLM endpoint: set `Authorization` header to `Bearer @{outputs('Get_secret')?['value']}` (set secure inputs)
- `Scope - Finally`: clear any in-memory variables that held the secret or ensure they're not logged

Testing and acceptance
- Validate that flows can read secrets in the test environment without exposing values in run history.
- Confirm secure inputs/outputs are enabled and that the Key Vault connector action shows masked outputs in the run UI.
- Confirm the environment variable names used match the Key Vault secret names.

Developer notes
- Use Key Vault secret versioning if you need rollbacks; store the secret name and optionally a version in environment variables.
- Rotate secrets by updating Key Vault and updating environment variable references where necessary.
- For automation and CI, use Azure CLI or `az keyvault secret show --id` with a service principal for non-interactive checks; never expose the returned secret in CI logs.
