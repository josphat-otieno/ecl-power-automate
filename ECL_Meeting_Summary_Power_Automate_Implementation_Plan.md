# Clarify Azure and SharePoint setup

> ### 4. Azure Key Vault
>
> - **Azure Key Vault Secrets: Client ID, Tenant , LLM API key for summarization,   Client Secret generated ,Odoo Secret if summary logging to Odoo is enabled**\
>
> ### 5 Custom Connector & Connection References
>
> - **Authorize Connection References:**
>   - Establish and bind connections for:&#x20;
>     - `Office 365 Outlook` (Querying calendar events)
>     - `SharePoint Online` (Accessing `MeetingSummaryRuns` and `Meeting Summaries`)
>     - `Approvals` (Adaptive Card human review routing)
>     - `Azure Key Vault` (Retrieving  secret keys)
>     - `HTTP with Microsoft Entra ID` / Custom Connector (Graph API transcript retrieval)
>
> ###
>
> ### **5. SharePoint**
>
> - **Share point Site**
>   - Create List: **`MeetingSummaryRuns`**
>   - Create Document Library: **`Meeting Summaries`**
>
> Help clarify each of these items for the admin and speficy how add them&#x20;

<details><summary>4 previous messages</summary>

> I’ll turn this into an admin-ready setup guide and verify the current Microsoft terminology and steps.
>
> <details><summary>Searched the web</summary>
>
> Searched the web for `site:learn.microsoft.com Azure Key Vault create secret access Power Automate connector managed identity 2026`
>
> Searched the web for `site:learn.microsoft.com/en-us/connectors/azurekeyvault Azure Key Vault Power Automate connector prerequisites`
>
> </details>
>
> ## Admin Configuration Guide
>
> The following items are prerequisites for the meeting-summary Power Automate solution. They should normally be created separately in Development, Test, and Production environments.
>
> ---
>
> ## 4. Azure Key Vault
>
> ### Purpose
>
> Azure Key Vault securely stores credentials used by the flow, custom connector, summarization service, and optional Odoo integration.
>
> The Azure Key Vault connector is a **Premium Power Automate connector**, so confirm that the flow owner or process account has an appropriate Power Automate licence. It supports both user-based Microsoft Entra authentication and service-principal authentication. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/keyvault/?utm_source=openai))
>
> ### Information to store
>
> | Recommended secret name | Value | Required? | Explanation |
> |---|---|---:|---|
> | `MeetingSummary-Graph-ClientSecret` | Microsoft Entra application client-secret value | Yes, for client-credential authentication | Used by the custom connector or HTTP authentication process |
> | `MeetingSummary-LLM-ApiKey` | API key for the summarization service | Yes, unless managed identity is used | Authorizes requests to Azure OpenAI or another approved LLM |
> | `MeetingSummary-Odoo-Secret` | Odoo API key, password, or integration token | Only if Odoo logging is enabled | Authorizes summary-log requests to Odoo |
> | `MeetingSummary-Graph-ClientId` | Application/client ID | Optional | This is an identifier rather than a secret; it can alternatively be a Power Platform environment variable |
> | `MeetingSummary-TenantId` | Microsoft Entra tenant ID | Optional | This is an identifier rather than a secret; it can alternatively be a Power Platform environment variable |
>
> **Recommended design:** store actual credentials—API keys, client-secret values, passwords, and tokens—in Key Vault. Store non-sensitive configuration such as tenant ID, client ID, SharePoint site URL, library name, and Odoo URL in Power Platform environment variables.
>
> ### Important distinction
>
> The **client secret used to establish the Azure Key Vault connection cannot first be retrieved from that same vault**. When service-principal authentication is selected, its client ID, tenant ID, client secret, and vault name are entered while creating the Power Automate connection. Power Platform then protects that connection credential. Other application secrets can subsequently be retrieved from Key Vault by flow actions. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/keyvault/?utm_source=openai))
>
> ### Admin steps
>
> #### A. Create the vault
>
> 1. Sign in to the Azure portal.
> 2. Open **Key vaults**.
> 3. Select **Create**.
> 4. Choose:
>    - The correct Azure subscription.
>    - The appropriate resource group.
>    - A unique vault name, such as `kv-meetings-prod-001`.
>    - The region approved by the organization.
> 5. Under permission configuration, use **Azure role-based access control** unless organizational policy requires legacy access policies.
> 6. Enable soft delete and purge protection for Production.
> 7. Configure public or private network access according to organizational security policy.
> 8. Select **Review + create** and create the vault.
>
> #### B. Add the secrets
>
> 1. Open the new vault.
> 2. Select **Objects → Secrets**.
> 3. Select **Generate/Import**.
> 4. Enter one recommended secret name from the table.
> 5. Paste the corresponding secret value.
> 6. Set an expiration date where applicable.
> 7. Select **Create**.
> 8. Repeat for every required secret.
>
> Do not enter the secret’s Azure URI into Power Automate where the connector expects a secret name. For example, the flow should request `MeetingSummary-LLM-ApiKey`, not paste the API-key value into the flow.
>
> #### C. Grant access
>
> Choose one identity to own the Production Power Automate connections—preferably a dedicated automation or service account rather than an individual employee.
>
> Grant that identity only the permission required to read secrets:
>
> - Recommended RBAC role: **Key Vault Secrets User**.
> - Avoid granting **Key Vault Administrator** to the flow identity.
> - Administrators responsible for creating or rotating secrets can receive a separate management role.
>
> If the Power Automate Key Vault connection uses a service principal, assign the Key Vault secret-reader role to the service principal rather than only to the administrator configuring it.
>
> #### D. Create the Power Automate connection
>
> 1. Sign in to the correct Power Platform environment.
> 2. Open **Connections**.
> 3. Select **New connection**.
> 4. Search for **Azure Key Vault**.
> 5. Select one authentication method:
>    - **Microsoft Entra ID:** sign in as the designated automation account.
>    - **Service principal:** enter the application’s client ID, tenant ID, client-secret value, and vault name.
> 6. Create the connection.
> 7. Test it by adding a temporary **Get secret** action to a test flow.
>
> Microsoft currently identifies the older generic Key Vault authentication option as deprecated, so create a connection with an explicit supported authentication method. Guest-user Entra connections are not supported for this connector. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/keyvault/?utm_source=openai))
>
> ### Security requirements
>
> - Never place secret values directly in flow action inputs, environment variables, flow descriptions, or documentation.
> - Enable **Secure Inputs** and **Secure Outputs** on actions that handle secrets.
> - Configure expiration dates and a rotation owner.
> - Retain the previous secret briefly during controlled rotation if the dependent connection cannot be updated atomically.
> - Restrict who can view flow run history.
> - Consider Power Platform data-loss-prevention policies governing Key Vault, HTTP, SharePoint, and Odoo connectors.
>
> ---
>
> ## 5. Custom Connector and Connection References
>
> ### Connections versus connection references
>
> A **connection** is the authenticated session for a connector—for example, the automation account’s authenticated SharePoint connection.
>
> A **connection reference** is a solution component that points to that connection. The flow uses the reference rather than being permanently tied to one person’s connection. This makes it easier to import the solution into Development, Test, and Production and bind each environment to its own credentials. ([learn.microsoft.com](https://learn.microsoft.com/en-us/power-automate/add-manage-connections?utm_source=openai))
>
> ### Connections required
>
> | Connection reference | Connector | Purpose | Suggested owner |
> |---|---|---|---|
> | `cr_MeetingSummary_Outlook` | Office 365 Outlook | Query calendar events and meeting metadata | Automation account |
> | `cr_MeetingSummary_SharePoint` | SharePoint Online | Read and update `MeetingSummaryRuns`; create files in `Meeting Summaries` | Automation account |
> | `cr_MeetingSummary_Approvals` | Approvals | Send summaries for human approval | Automation account |
> | `cr_MeetingSummary_KeyVault` | Azure Key Vault | Retrieve the required application secrets | Automation account or service principal |
> | `cr_MeetingSummary_Graph` | Custom connector or HTTP with Microsoft Entra ID | Retrieve Microsoft Teams transcripts through Microsoft Graph | Approved application identity |
> | `cr_MeetingSummary_Odoo` | Custom connector or HTTP | Log approved summaries to Odoo | Only when Odoo logging is enabled |
>
> ### Clarification about Approvals and Adaptive Cards
>
> The **Approvals** connector creates and tracks an approval request. Approvers can respond from Outlook, the Power Automate approvals center, or the adaptive card automatically presented through Microsoft Teams.
>
> A separately designed Teams adaptive card is not normally required if the flow uses **Start and wait for an approval**. Use a custom Teams adaptive card only when the standard Approvals experience does not meet the business requirements. ([learn.microsoft.com](https://learn.microsoft.com/en-us/power-automate/modern-approvals?utm_source=openai))
>
> The Approvals connector is classified as a standard connector. However, approvals are stored in Dataverse. In a non-default environment, the first approval run may need to provision the Dataverse database, and the person performing that first run must have an appropriate environment administrator role. ([learn.microsoft.com](https://learn.microsoft.com/en-us/power-automate/get-started-approvals?utm_source=openai))
>
> ### A. Create the underlying connections
>
> In the target Power Platform environment:
>
> 1. Open **Power Automate → Connections**.
> 2. Select **New connection**.
> 3. Create each required connection.
> 4. Authenticate using the designated Production automation identity.
> 5. Verify that every connection shows **Connected**.
> 6. Do not use a developer’s personal account for Production connections.
>
> Microsoft documents connections under **Data → Connections**, although navigation labels can vary slightly between the current Power Automate and Power Apps interfaces. ([learn.microsoft.com](https://learn.microsoft.com/en-us/power-automate/add-manage-connections?utm_source=openai))
>
> ### B. Create connection references in the solution
>
> 1. Open **Power Apps** or **Power Automate**.
> 2. Select the correct environment.
> 3. Open **Solutions**.
> 4. Open the Meeting Summary solution.
> 5. Select **New → More → Connection reference**.
> 6. Enter the proposed display name, such as `cr_MeetingSummary_SharePoint`.
> 7. Select the appropriate connector.
> 8. Select the previously created connection.
> 9. Save the connection reference.
> 10. Repeat for each required connector.
> 11. Open the flow and verify that each trigger and action uses the appropriate connection reference.
> 12. Save and turn on the flow.
>
> When importing the solution into another environment, the importer must bind each connection reference to a valid connection in that target environment.
>
> ---
>
> ## Microsoft Graph Custom Connector
>
> ### Purpose
>
> The Graph connector retrieves Teams meeting transcripts. The transcript-list API requires `OnlineMeetingTranscript.Read.All`. Microsoft identifies this as the least-privileged delegated or application permission for listing transcripts associated with an online meeting. ([learn.microsoft.com](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0&utm_source=openai))
>
> For application authentication, a tenant administrator must also configure an application access policy that permits the application to access online meetings or artifacts on behalf of the relevant meeting organizers. ([learn.microsoft.com](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0&utm_source=openai))
>
> ### Admin steps
>
> #### A. Register the application
>
> 1. Open **Microsoft Entra admin center**.
> 2. Go to **Identity → Applications → App registrations**.
> 3. Select **New registration**.
> 4. Enter a name such as `Meeting Summary Graph Connector – Production`.
> 5. Select the approved account type—normally **Accounts in this organizational directory only**.
> 6. Register the application.
> 7. Record:
>    - **Application (client) ID**
>    - **Directory (tenant) ID**
>
> #### B. Create the client secret
>
> 1. Open the application.
> 2. Select **Certificates & secrets**.
> 3. Select **New client secret**.
> 4. Enter a description and approved expiry period.
> 5. Create the secret.
> 6. Immediately copy the **secret value**, not the secret ID.
> 7. Store the value as `MeetingSummary-Graph-ClientSecret` in Key Vault.
> 8. Record the owner and expiration date.
>
> Microsoft only displays the client-secret value when it is created, so it must be captured securely at that time. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/custom-connectors/azure-active-directory-authentication?utm_source=openai))
>
> #### C. Add Microsoft Graph permissions
>
> 1. Open **API permissions**.
> 2. Select **Add a permission**.
> 3. Select **Microsoft Graph**.
> 4. Select the permission type required by the design:
>    - **Delegated permissions** when the connection operates as a signed-in user.
>    - **Application permissions** for unattended application access.
> 5. Add `OnlineMeetingTranscript.Read.All`.
> 6. Add any other permissions required by the actual implemented endpoints.
> 7. Select **Grant admin consent** after security review.
>
> Avoid adding broad permissions such as `Directory.ReadWrite.All` unless the implementation demonstrably requires them.
>
> #### D. Configure transcript-access policy
>
> For application-permission access, the Teams/tenant administrator must configure the application access policy and assign it to the meeting organizers whose transcripts the app may retrieve. The Graph API documentation explicitly requires this for application access to meeting transcripts. ([learn.microsoft.com](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0&utm_source=openai))
>
> Also verify that tenant-level Graph access to transcripts is enabled. If it is disabled, Microsoft Graph returns `403 Forbidden` with the `GraphAccessToTranscriptsDisabled` error, and the flow cannot work around it. ([learn.microsoft.com](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0&utm_source=openai))
>
> #### E. Create or import the custom connector
>
> 1. Open the Meeting Summary solution.
> 2. Select **New → Automation → Custom connector**.
> 3. Import the approved OpenAPI definition or create the connector from blank.
> 4. Configure the Graph host and required transcript operations.
> 5. Under **Security**, select Microsoft Entra ID/OAuth.
> 6. Enter the application registration details.
> 7. Save the connector.
> 8. Copy the connector’s generated redirect URL.
> 9. Return to the Entra application registration.
> 10. Add the redirect URL under **Authentication**.
> 11. Create and test a connector connection.
> 12. Create a connection reference for that connection.
>
> Microsoft recommends creating solution-aware custom connectors inside a solution. When moving them between environments, the custom connector should be imported and registered before flows and connection references that depend on it. Credentials and role assignments must be configured again in the target environment. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/custom-connectors/customconnectorssolutions?utm_source=openai))
>
> ---
>
> ## 6. SharePoint
>
> ### SharePoint site
>
> The admin must identify or create the SharePoint site that will hold the tracking list and generated summaries.
>
> Record the complete site address, for example:
>
> `https://<tenant>.sharepoint.com/sites/MeetingAutomation`
>
> Recommended permissions:
>
> | Identity or group | Recommended access |
> |---|---|
> | Power Automate connection owner | Edit or Contribute |
> | Meeting Summary administrators | Owner or Full Control |
> | Summary reviewers | Read or Edit, according to process |
> | General staff | No access unless summaries are intended for them |
> | External users | No access by default |
>
> The account used by Power Automate must have sufficient access to create and update list items and files. If the flow grants or removes permissions on individual files, the connection account must be a list or library owner. ([learn.microsoft.com](https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/guidance/manage-list-item-file-permissions?utm_source=openai))
>
> ---
>
> ## `MeetingSummaryRuns` List
>
> ### Purpose
>
> This list is the operational log for every meeting-summary attempt. It supports monitoring, retries, approvals, error investigation, and audit reporting.
>
> ### Create the list
>
> 1. Open the selected SharePoint site.
> 2. Select **New → List**.
> 3. Select **Blank list**.
> 4. Enter:
>    - Name: `MeetingSummaryRuns`
>    - Description: `Operational tracking and audit log for meeting-summary processing.`
> 5. Ensure the list is saved on the SharePoint site—not under a user’s personal **My Lists** location.
> 6. Select **Create**.
> 7. Add the required columns.
>
> Microsoft supports creating a blank list from **New → List**, after which columns can be added for the business data. Lists created under “My Lists” are personal and are not appropriate for a shared Production automation solution. ([support.microsoft.com](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-a-list?utm_source=openai))
>
> ### Recommended columns
>
> | Column | Type | Purpose |
> |---|---|---|
> | `Title` | Single line of text | Meeting subject or run display name |
> | `RunId` | Single line of text | Unique Power Automate run identifier |
> | `MeetingId` | Single line of text | Teams or Graph meeting identifier |
> | `OrganizerEmail` | Single line of text | Meeting organizer |
> | `MeetingStart` | Date and time | Scheduled meeting start |
> | `MeetingEnd` | Date and time | Scheduled meeting end |
> | `ProcessingStatus` | Choice | `Queued`, `Transcript Pending`, `Processing`, `Review Pending`, `Approved`, `Rejected`, `Completed`, `Failed` |
> | `ApprovalOutcome` | Choice | `Not Required`, `Pending`, `Approved`, `Rejected`, `Timed Out` |
> | `Approver` | Person or Group | Human reviewer |
> | `ApprovalComments` | Multiple lines of text | Reviewer comments |
> | `TranscriptId` | Single line of text | Graph transcript identifier |
> | `SummaryFileUrl` | Hyperlink | Link to the generated summary |
> | `OdooLoggingStatus` | Choice | `Disabled`, `Pending`, `Logged`, `Failed` |
> | `AttemptCount` | Number | Number of processing attempts |
> | `StartedAt` | Date and time | Actual processing start |
> | `CompletedAt` | Date and time | Completion time |
> | `ErrorCode` | Single line of text | Stable technical error code |
> | `ErrorMessage` | Multiple lines of text | Sanitized error details |
> | `CorrelationId` | Single line of text | Cross-system troubleshooting identifier |
> | `FlowEnvironment` | Choice | `Development`, `Test`, `Production` |
>
> Do not write API keys, access tokens, client secrets, full authentication headers, or sensitive transcript content into the run-tracking list.
>
> ### List configuration
>
> - Index `RunId`, `MeetingId`, `ProcessingStatus`, and `MeetingStart` if the list is expected to grow significantly.
> - Consider making `RunId` unique.
> - Enable version history.
> - Restrict list access to administrators, operators, and auditors.
> - Define a retention policy that matches organizational requirements.
> - Use a standard generic SharePoint list because Power Automate supports generic lists and generic document libraries most reliably. ([learn.microsoft.com](https://learn.microsoft.com/en-us/connectors/sharepoint/?source=recommendations&utm_source=openai))
>
> ---
>
> ## `Meeting Summaries` Document Library
>
> ### Purpose
>
> This library stores the generated summary documents and their associated metadata.
>
> ### Create the library
>
> 1. Open the selected SharePoint site.
> 2. Select **New → Document library**.
> 3. Select **Blank library**.
> 4. Enter:
>    - Name: `Meeting Summaries`
>    - Description: `Approved and generated summaries created by the meeting-summary automation.`
> 5. Select **Create**.
> 6. Open **Library settings**.
> 7. Enable version history.
> 8. Configure retention, sensitivity labels, and permissions according to organizational policy.
>
> ### Recommended metadata
>
> | Column | Type | Purpose |
> |---|---|---|
> | `MeetingId` | Single line of text | Links the document to the meeting |
> | `RunId` | Single line of text | Links the document to `MeetingSummaryRuns` |
> | `MeetingDate` | Date and time | Meeting date |
> | `Organizer` | Person or Group | Meeting organizer |
> | `ApprovalStatus` | Choice | `Draft`, `Pending Review`, `Approved`, `Rejected` |
> | `ApprovedBy` | Person or Group | Final approver |
> | `ApprovedAt` | Date and time | Approval date |
> | `Confidentiality` | Choice or sensitivity label | Document classification |
> | `OdooReference` | Single line of text | Optional Odoo record identifier |
>
> ### Recommended folder structure
>
> A simple structure is sufficient:
>
> `/<year>/<month>/<meeting-id-or-sanitized-subject>/`
>
> Avoid deeply nested folders. Metadata is generally better for filtering, search, reporting, and retention.
>
> ### File naming convention
>
> Use a deterministic filename such as:
>
> `YYYY-MM-DD - Meeting Subject - Summary.docx`
>
> Replace invalid SharePoint filename characters and add a meeting or run identifier when duplicate subjects are possible.
>
> ---
>
> ## Final Admin Validation
>
> Before handing the environment to the flow owner, confirm:
>
> - Azure Key Vault exists and contains all required secrets.
> - Secret-reader access is granted to the correct automation identity.
> - Secret expiration and rotation owners are documented.
> - Microsoft Graph app registration exists.
> - `OnlineMeetingTranscript.Read.All` has received admin consent.
> - Required application access policies are assigned.
> - Tenant Graph transcript access is enabled.
> - All Power Automate connections show **Connected**.
> - All connection references are bound in the correct environment.
> - The Approvals/Dataverse capability is provisioned.
> - `MeetingSummaryRuns` exists with the required columns.
> - `Meeting Summaries` exists with versioning and appropriate permissions.
> - The SharePoint connection identity can create, read, and update test records.
> - The Graph connector can retrieve a permitted test transcript.
> - The Key Vault connector can retrieve a test secret.
> - No credentials appear in flow definitions, run history, SharePoint, or error messages.
>
> Remove client secret&#x20;
</details>

Remove **Client Secret** from the configuration. The solution will use authenticated Microsoft Entra user connections rather than service-principal/client-secret authentication.

### 4. Azure Key Vault

Store the following values:

- **LLM API key** — API key used by the summarization service.
- **Odoo secret** — Required only when summary logging to Odoo is enabled.
- **Client ID** — Optional configuration value; preferably store it as a Power Platform environment variable.
- **Tenant ID** — Optional configuration value; preferably store it as a Power Platform environment variable.

Do **not** create or store a client secret.

### Azure Key Vault Connection

Create the Azure Key Vault connection using a designated automation account:

1. Open **Power Automate → Connections**.
2. Select **New connection**.
3. Search for **Azure Key Vault**.
4. Select **Microsoft Entra ID** authentication.
5. Sign in using the designated automation account.
6. Enter or select the Key Vault name.
7. Create and test the connection.

Grant the automation account the **Key Vault Secrets User** role on the vault.

### Microsoft Graph Connection

Configure the Microsoft Graph custom connector or **HTTP with Microsoft Entra ID** connection to use delegated Microsoft Entra authentication:

1. Register the application in Microsoft Entra ID.
2. Record the **Application (client) ID** and **Directory (tenant) ID**.
3. Do not create a client secret.
4. Add the required delegated Microsoft Graph permissions, including `OnlineMeetingTranscript.Read.All`.
5. Grant tenant-wide administrator consent.
6. Create the connector connection by signing in with the designated automation account.
7. Bind the connection to `cr_MeetingSummary_Graph`.

### Updated Key Vault Secrets

| Secret name | Purpose | Required? |
|---|---|---:|
| `MeetingSummary-LLM-ApiKey` | Authorizes summarization requests | Yes, unless another approved authentication method is used |
| `MeetingSummary-Odoo-Secret` | Authorizes Odoo summary logging | Only when Odoo logging is enabled |

The **Client ID**, **Tenant ID**, SharePoint site address, library name, and service endpoints should be stored as Power Platform environment variables rather than Key Vault secrets.

> Why cant i create connections myself

<details><summary>2 previous messages</summary>

> I’ll clarify which connections you can create and what may require admin help.
>
> <details><summary>Searched the web</summary>
>
> Searched the web for `site:learn.microsoft.com Power Automate create connections permissions environment maker DLP policy connector blocked ...`
>
> </details>
</details>

You **can create the connections yourself** if your account has the necessary permissions. An admin is only required for tenant-level configuration or restricted resources.

You need:

- **Environment Maker** role in the target Power Platform environment. This role permits creating flows, connections, and custom connectors. [Microsoft role guidance](https://learn.microsoft.com/en-us/power-platform/admin/database-security)
- Access to the relevant **SharePoint site and lists**.
- Permission to use the designated **Outlook mailbox/calendar**.
- **Key Vault Secrets User** access to the Azure Key Vault.
- A suitable Power Automate licence for premium connectors.
- Connectors permitted by your organization’s **data-loss-prevention policy**.

An administrator is still needed to:

- Assign your Environment Maker role.
- Grant Azure Key Vault access.
- Approve Microsoft Graph permissions such as `OnlineMeetingTranscript.Read.All`.
- Grant tenant-wide Entra consent.
- Enable transcript access and configure any required Teams policies.
- Unblock connectors restricted by organizational policy.

A `403 Forbidden` commonly means you lack access to the target resource, environment, or connector—or a data policy is blocking it. [Microsoft troubleshooting guidance](https://learn.microsoft.com/en-us/power-automate/fix-connection-failures)

So the document should say **“Create and authorize the following connections”**, not imply that only an administrator can create them. For Production, however, a dedicated automation account is generally preferable to a personal account because your connections may stop working if your account is disabled, password policies change, or you leave the organization.

> cant the mcp do it

An MCP **could** create many of these resources if it had dedicated Power Platform, Azure, and SharePoint tools plus your authorized account permissions.

In this task, however, no Power Platform/Azure administration MCP is connected. Therefore, I cannot directly:

- Create Power Automate connections or connection references.
- Grant Microsoft Graph admin consent.
- Assign Azure Key Vault roles.
- Create Key Vault secrets.
- Configure tenant or Teams policies.

I could potentially guide you through the admin portals using the in-app browser, but you would still need to sign in and personally approve any authentication or consent prompts. MCP cannot bypass Microsoft permissions or MFA.

Also, Microsoft 365 MCP access would not automatically provide Power Platform or Azure administrative access; those require separate APIs, tools, roles, and authorization.

> an the powerautomate-mcp do since it has many tools

<details><summary>3 previous messages</summary>

> I’ll check the available Power Automate MCP tools and their exact capabilities.
>
> The current session doesn’t expose it directly, so I’m checking the project’s MCP configuration.
>
> <details><summary>Explored a search, ran 2 commands, searched the web</summary>
>
> <details><summary>Explored a search</summary>
>
> - Searched for `powerautomate|power-automate|power automate|mcp` in `.`
>
> </details>
>
> - Ran `git branch --all --list '*powerautomate*' && git show codex/powerautomate-mcp:README.md | sed -n '1,140p'`
>
> - Ran `git ls-tree -r --name-only codex/powerautomate-mcp plugins/ecl-power-automate-mcp && git show codex/powerautomate-mcp:plugins/ecl-power-automate-mcp/README.md 2>/dev/null || true`
>
> Searched the web for `github rcb0727 powerplatform-mcp-docs powerautomate-mcp tools connections connection references ...`
>
> </details>
</details>

Yes—you’re right. The upstream **`powerautomate-mcp` can do much of this**.

It provides tools to:

- Create and test connections using `ensure_connection`, `create_connection`, and `test_connection`.
- Create custom connectors.
- Create flows with connection references.
- Create SharePoint lists and document libraries.
- Manage solutions and environment variables.
- Inspect DLP policies and environment permissions.

OAuth connections such as Outlook and SharePoint still require you to open the returned sign-in link and complete Microsoft login/MFA. It cannot bypass admin consent, missing licences, DLP restrictions, Azure RBAC, or tenant policies. It also cannot create the Azure Key Vault itself or grant its Azure roles unless separate Azure-management tools are provided.

The issue is that the upstream MCP is **not active in this current session**. This repository currently keeps it as a future proposal pending security approval, as documented in `/Users/elewa/Documents/ChatGPT/Elewa-Power-Automate/README.md:18`. The `codex/powerautomate-mcp` branch contains the plugin wrapper, but those tools have not been loaded here.

So the accurate answer is: **yes, once that plugin is installed, configured, signed in, and granted the required Power Platform permissions, I can use it to create most of these components—while you complete interactive consent prompts.** [Upstream tool documentation](https://github.com/rcb0727/powerplatform-mcp-docs)

> After creating the connections, what next?
>
> User context
>
> Images:
> - `/var/folders/w_/mp19fmyn22l4zlqlc3jf42nw0000gn/T/TemporaryItems/NSIRD_screencaptureui_CG1le0/Screenshot 2026-08-24 at 18.15.54.png`

The screenshot shows that only the **Microsoft Teams** connection is currently created and connected. Before moving on, create the other required connections:

1. **Office 365 Outlook**
2. **SharePoint**
3. **Approvals**
4. **Azure Key Vault**
5. **HTTP with Microsoft Entra ID** or the Microsoft Graph custom connector
6. **Microsoft Teams** — keep this if approval cards or Teams notifications are used

## After Connections

### 1. Create the solution

1. Select **Solutions** from the left menu.
2. Select **New solution**.
3. Enter:
   - **Display name:** `ECL Meeting Summary`
   - **Name:** `ECLMeetingSummary`
   - **Publisher:** Select the approved Elewa publisher or create one.
   - **Version:** `1.0.0.0`
4. Select **Create**.

All flows, connection references, environment variables, and the custom connector should be created inside this solution.

### 2. Create connection references

Inside the solution:

1. Select **New → More → Connection reference**.
2. Create one reference for each connection:

| Connection reference | Connector |
|---|---|
| `cr_ECL_Outlook` | Office 365 Outlook |
| `cr_ECL_SharePoint` | SharePoint |
| `cr_ECL_Approvals` | Approvals |
| `cr_ECL_KeyVault` | Azure Key Vault |
| `cr_ECL_Graph` | HTTP with Microsoft Entra ID or Graph custom connector |
| `cr_ECL_Teams` | Microsoft Teams |

3. For each reference, select the connection you created.
4. Save it.

A **connection** contains the authenticated account. A **connection reference** connects solution components and flows to that authenticated connection.

### 3. Create environment variables

Inside the same solution, select **New → More → Environment variable** and add:

- `SharePointSiteUrl`
- `ProcessingListName` — value: `MeetingSummaryRuns`
- `SummaryLibraryName` — value: `Meeting Summaries`
- `GraphBaseUrl` — value: `https://graph.microsoft.com/v1.0`
- `KeyVaultName`
- `LlmEndpoint`
- `LlmDeploymentName`
- `LlmSecretName`
- `TranscriptInitialDelayMinutes`
- `TranscriptRetryDelayMinutes`
- `TranscriptMaximumAttempts`
- `OdooEnabled`
- `OdooBaseUrl`, if required

Do not store API keys or passwords in environment variables.

### 4. Create the SharePoint resources

On the selected SharePoint site, create:

- List: **`MeetingSummaryRuns`**
- Document library: **`Meeting Summaries`**

Verify that the account used by the SharePoint connection can create, read, and update items and documents.

### 5. Configure Microsoft Graph

Create or import the custom connector for:

- Resolving the online meeting.
- Listing available transcripts.
- Downloading transcript content as WebVTT.

Create a connection for the connector, complete Microsoft sign-in, and bind it to `cr_ECL_Graph`.

### 6. Build the flows

Build the solution in this order:

1. **Find completed meetings**
2. **Retrieve and clean transcript**
3. **Generate meeting summary**
4. **Request human approval**
5. **Publish approved summary to SharePoint**
6. **Log to Odoo**, if enabled

Start with a manually triggered proof-of-concept flow. Confirm that it can retrieve one test transcript before adding scheduling, summarization, approvals, and publication.

### Immediate next action

From the page shown, select **New connection** and create **Office 365 Outlook** and **SharePoint** first. Then create the `ECL Meeting Summary` solution and its connection references.

> can the admin see the connections i created

Yes. A **Power Platform administrator or environment administrator can generally see connections created in the environment**, including:

- Connector type, such as SharePoint or Outlook.
- Connection owner.
- Connection name and status.
- When it was created or modified.
- Which flows depend on it.

They **cannot normally see your password, OAuth token, API key, or other stored credentials** through the admin interface.

Other ordinary makers generally cannot automatically use your personal OAuth connections. You must explicitly share supported connections, or they must create their own.

For Production, use a dedicated automation account instead of your personal account. Admins can then manage ownership and continuity without making the automation dependent on your employment account. However, creating connections under that automation account requires permission to sign in as it and complete any MFA or consent requirements.
