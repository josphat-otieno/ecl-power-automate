# Approval and SharePoint publication

Purpose
- Provide a step-by-step implementer guide and contract for Flow 04 (`ECL-MS-04 – Approve and Publish Summary`) to handle the human approval gate, document generation, SharePoint publication, and audit status transitions.

## Trigger

- **Connector:** SharePoint
- **Action:** `When an item is created or modified`
- **List Name:** `@parameters('ProcessingListName')` (`MeetingSummaryRuns`)
- **Trigger Condition:**
  ```text
  @and(equals(triggerOutputs()?['body/Status/Value'], 'PendingApproval'), equals(triggerOutputs()?['body/ApprovalStarted/Value'], 'No'))
  ```

## Boundary & Safety Rules

- Never publish a summary automatically without explicit human approval.
- Avoid race conditions and duplicate approval triggers by immediately updating `ApprovalStarted = Yes`.
- If an approver requests revision or rejects the summary, preserve their exact comments in `ApprovalComments` and do not publish.
- Keep secret values and raw unparsed transcripts out of approval notifications and document libraries.

---

## Step-by-Step Implementer Guide

### 1. Lock Trigger & Prevent Loops
- Immediately update the processing item:
  - `ApprovalStarted`: `Yes`
- This ensures concurrent flow runs or subsequent edits do not re-trigger duplicate approval cards.

### 2. Parse Structured Summary
- Parse `triggerOutputs()?['body/SummaryJson']` using the approved schema from `llm-validation-guidance.md`:
  - `recap` (string)
  - `decisions` (array of `{ decision, made_by, evidence }`)
  - `action_items` (array of `{ task, owner, due_date, evidence }`)
  - `open_questions` (array of `{ question, owner, evidence }`)
  - `warnings` (array of strings)

### 3. Construct Notification Bodies
- Build both the Teams Adaptive Card (see `resources/adaptive-card-template.json`) and standard email markdown body.
- Display key meeting metadata:
  - Meeting Title, Date, Organiser, Attendees count, and warnings (if any).
  - High-level recap, decisions list, action item assignments, and open questions.
  - Direct link to the `MeetingSummaryRuns` SharePoint item.

### 4. Initiate Approval Action
- **Action:** `Start and wait for an approval` (Approvals connector)
- **Approval Type:** `Custom Responses - Wait for one response`
- **Custom Responses:**
  - `Approve`
  - `Request changes`
  - `Reject`
- **Title:** `Meeting Summary Review: @{triggerOutputs()?['body/Title']}`
- **Assigned to:** `triggerOutputs()?['body/OrganizerEmail']`
- **Item link:** URL to the SharePoint processing item.

---

## Branching Logic on Outcome

### Outcome: `Approve`
1. **Generate HTML Document:**
   - Assemble the approved summary HTML using standard CSS styling (clean header, metadata banner, recap callout, decisions table, action items checklist, warnings alert).
   - Alternatively invoke `scripts/generate-html-summary.js` logic in flow expressions.
2. **Create File in SharePoint:**
   - **Folder Path:** `/Meeting Summaries/@{formatDateTime(triggerOutputs()?['body/EventDate'], 'yyyy-MM')}`
   - **File Name:** `@{triggerOutputs()?['body/EventDate']}_@{triggerOutputs()?['body/Title']}_Summary.html`
   - **File Content:** Generated HTML content.
3. **Update Processing Record:**
   - `Status`: `Approved`
   - `ApprovalOutcome`: `Approve`
   - `ApprovedBy`: `@responses('Start_and_wait_for_an_approval')?['responder/displayName']` (`responder/email`)
   - `ApprovedOn`: `utcNow()`
   - `SummaryFileUrl`: `@outputs('Create_file')?['body/Path']`
   - `ProcessedOn`: `utcNow()`
4. **Notify Organiser & Attendees:**
   - Send confirmation email containing the SharePoint file link.
5. **Trigger Downstream Integrations:**
   - Optionally trigger Flow 05 (Odoo logging) if enabled in environment configuration.

### Outcome: `Request changes`
1. **Update Processing Record:**
   - `Status`: `RevisionRequested`
   - `ApprovalOutcome`: `Request changes`
   - `ApprovalComments`: `@responses('Start_and_wait_for_an_approval')?['comments']`
   - `ApprovalStarted`: `No` (allows re-trigger once revised `SummaryJson` is submitted)
2. **Notify Meeting Organiser:**
   - Send email with approver comments and instructions for manual adjustment or regeneration.

### Outcome: `Reject`
1. **Update Processing Record:**
   - `Status`: `Rejected`
   - `ApprovalOutcome`: `Reject`
   - `ApprovalComments`: `@responses('Start_and_wait_for_an_approval')?['comments']`
   - `ProcessedOn`: `utcNow()`
2. **No Publication:** Do not write files to SharePoint or trigger Odoo.

---

## Testing & Acceptance Checklist

- [ ] Trigger fires only when `Status = PendingApproval` and `ApprovalStarted = No`.
- [ ] Adaptive Card / Email renders without markdown errors or missing dynamic values.
- [ ] Action item owners, due dates, and decision evidence snippets display clearly.
- [ ] Approver comments are accurately captured in SharePoint for both revisions and rejections.
- [ ] Approved HTML file renders cleanly in browser preview from SharePoint.
- [ ] No unhandled exceptions on empty arrays (e.g. meetings with zero warnings or zero decisions).
