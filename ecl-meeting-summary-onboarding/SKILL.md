---
name: ecl-meeting-summary-onboarding
description: Orient a new owner of the ECL Meeting Summary Power Automate project. Use when someone asks what the project does, where to start, what is implemented, what is blocked, which document is authoritative, or how to move safely from the current Development state toward full deployment. Do not use for unrelated Power Automate projects.
---

# ECL Meeting Summary Onboarding

Help a new user form an accurate mental model, find the current state, and choose the smallest useful next action. Do not assume the repository overview, an old solution export, or a previous handoff still reflects the latest design.

## Begin by identifying the user's goal

If the user invokes the skill without a clear task, do not immediately give a full project explanation. Ask one short question:

```text
What would you like to do with the ECL Meeting Summary project?

1. Understand how the project works
2. Review current progress and blockers
3. Continue the implementation
4. Troubleshoot a problem
5. Prepare to share, hand over, test, or deploy the solution
```

Allow a free-form answer. If an interactive choice tool is available, it may be used with broader grouped choices, but do not require it. After the user chooses, inspect only the evidence and references needed for that goal.

Do not ask this question when the user's request already makes their goal clear. In that case, acknowledge the goal and proceed directly. Ask at most one follow-up question only when a missing answer would materially change the recommended path, environment, or permissions.

## Start with current evidence

Before reporting status or recommending work, read:

1. `../ecl-power-automate-manual-guide/progress.json` for live checkpoint status and blockers.
2. The four current implementation plans:
   - `../power-automate/plans/ECL-MS-01-configuration-hardening-plan.md`
   - `../power-automate/plans/ECL-MS-02-implementation-plan.md`
   - `../power-automate/plans/ECL-MS-03-implementation-plan.md`
   - `../power-automate/plans/ECL-MS-04-implementation-plan.md`
3. `../README.md` for repository navigation and `../services/graph-transcript-gateway/README.md` for the gateway boundary.

Read only the detailed reference needed for the user's question after this initial orientation. Use `../ecl-power-automate-manual-guide/references/checkpoint-sequence.md` to find the relevant procedure.

Treat the current flow implementation plans as the design authority. Treat exported baselines, `../Implementation_Intent_Plan.md`, and older orchestrator references as historical or supporting material when they conflict with those plans. Verify the newest usable solution export instead of assuming a version number.

## Explain the project simply

Use this mental model:

```text
Flow 01 discovers available Teams transcripts and queues each meeting once.
    -> Flow 02 retrieves the exact transcript, cleans it, and calls Flow 03 in memory.
    -> Flow 03 creates validated evidence-grounded SummaryJson.
    -> Flow 04 publishes one verified HTML summary to SharePoint.
```

The flows coordinate through a `MeetingSummaryRuns` SharePoint item and status changes. The Azure Functions Graph gateway is the certificate-authenticated security boundary between Power Automate and Microsoft Graph. SharePoint holds configuration, queue/audit state, and published summaries; raw transcript text should remain in secure in-memory flow actions.

Mention these non-obvious design changes when relevant:

- Target Flow 01 is Teams-transcript-led and multi-organizer. The older one-mailbox Outlook dispatcher is not the target architecture.
- Flow 01 should provide organizer, meeting, and transcript IDs; normal Flow 02 processing should not search Outlook, resolve a join URL, or poll for discovery.
- Flow 03 ends at `ReadyToPublish` and does not publish a document.
- The current Flow 04 plan replaces legacy approval behavior with automatic, idempotent SharePoint publication.
- If the business still requires human approval, flag it as an unresolved design decision. Do not blend approval and automatic-publication lifecycles without revising the Flow 03 and Flow 04 contracts together.

## Choose the user's starting point

Base the recommendation on evidence, not a fixed checkpoint number:

- **New and learning:** Explain the four-flow chain, the three shared services (SharePoint, Graph gateway, Azure OpenAI), the current-state-versus-target distinction, and the main blocker. Recommend reading the simple handoff at `../deliverables/ECL_Meeting_Summary_Project_Handoff.docx`, then the relevant current flow plan.
- **Taking ownership:** Summarize completed, pending, blocked, and skipped tracker counts; identify named owners still needed; list the first three dependency-clearing actions; and point to the authoritative files.
- **Ready to implement:** Identify the earliest unblocked dependency. Read its plan or checkpoint reference completely before proposing changes. Separate work that can proceed locally from work requiring Azure, Entra, SharePoint, or Power Platform access.
- **Continuing manual portal work:** Route to `../ecl-power-automate-manual-guide/SKILL.md`. Follow its one-checkpoint-at-a-time protocol rather than giving a large batch of portal actions.
- **Planning, validation, or troubleshooting:** Route to `../ecl-meeting-summary-orchestrator/SKILL.md`, but reconcile any older approval or Outlook guidance against the current flow plans first.
- **Preparing release:** Require a tested Development export, environment-specific connections and values, end-to-end evidence, security/DLP review, monitoring, rollback, and explicit Production approval.

When infrastructure is blocked, propose useful work that does not pretend the dependency is available. Examples include SharePoint schema preparation, local gateway/connector changes, synthetic flow contracts and fixtures, test matrices, organizer onboarding procedures, or draft/off flow construction.

## Safe forward path

Use this dependency order unless current evidence requires a different sequence:

1. Resolve ownership and infrastructure access: Azure/MFA, subscription, resource group, region, hosting approval, SharePoint target, Azure OpenAI route, and Power Platform owners.
2. Provision and verify SharePoint contracts, including the organizer registry and unique dispatch key required by current Flow 01.
3. Extend, deploy, and validate the Graph gateway and its Power Platform connection boundary.
4. Build Flow 01 as draft/off against synthetic data and the current Teams-led plan.
5. Configure and validate Flow 03's approved LLM route and freeze the shared summary schema.
6. Build and validate Flow 02 against the frozen Flow 03 child-flow contract.
7. Replace legacy Flow 04 behavior with the current publisher design and validate idempotency and safe rendering.
8. Run a controlled Development end-to-end test, harden, export a new baseline, promote through managed imports, and enable recurrence only after downstream acceptance.

Do not mistake build order for enablement order. The safe downstream enablement order is Flow 03, Flow 02, Flow 04, then scheduled Flow 01.

## Detailed routing

- SharePoint schema: `../ecl-meeting-summary-orchestrator/references/sharepoint-schema-and-provisioning.md`
- Solution, variables, and connections: `../ecl-meeting-summary-orchestrator/references/solution-setup-and-environment-variables.md`
- Gateway deployment: `../services/graph-transcript-gateway/README.md`
- Gateway connector contract: `../ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json`
- Machine-readable SharePoint contract: `../ecl-meeting-summary-orchestrator/resources/sharepoint-list-schema.json`
- Release checks: `../ecl-meeting-summary-orchestrator/references/build-checklists.md`
- Synthetic pipeline validation: `../scripts/run-pipeline-test.js`

## Response shape

For onboarding or “where do I start?” requests, answer in this order:

1. **Project in one minute** - purpose and the four-flow chain.
2. **Current position** - evidence-based progress, target-versus-baseline gaps, and blockers.
3. **Start here** - one recommended starting action and why it unlocks later work.
4. **Next steps** - no more than the next three concrete actions unless the user asks for the full plan.
5. **Read next** - the smallest set of authoritative files relevant to those actions.

State which facts came from the live tracker and which are design targets from plans. Keep secrets, tokens, certificate material, function keys, transcripts, and client data out of responses and project notes. Do not perform tenant changes, permission expansion, role assignment, external publication, or Production deployment without explicit authorization.
