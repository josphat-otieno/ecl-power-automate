#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const solutionRoot = path.resolve(process.argv[2] || "power-automate/generated/ECLMeetingSummary_1_0_0_2_unmanaged");
const expectedVersion = process.argv[3] || "1.0.0.2";
const workflowName = "ECL-MS-01DispatchCompletedMeetings-560C2DA9-37A1-F111-B8DC-000D3AB04AC1.json";
const flow = JSON.parse(fs.readFileSync(path.join(solutionRoot, "Workflows", workflowName), "utf8"));
const definition = flow.properties?.definition;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function collectActions(actions, result = {}) {
  for (const [name, action] of Object.entries(actions || {})) {
    result[name] = action;
    collectActions(action.actions, result);
    collectActions(action.else?.actions, result);
  }
  return result;
}

const actions = collectActions(definition?.actions);
const serialized = JSON.stringify(flow);
const refs = flow.properties?.connectionReferences || {};
const createItemParameters = actions.Create_queue_item?.inputs?.parameters || {};

check(definition?.triggers?.manual?.kind === "Button", "Manual POC trigger is missing.");
check(definition?.triggers?.manual?.runtimeConfiguration?.concurrency?.runs === 1, "Trigger concurrency must be one.");
check(refs.shared_office365?.connection?.connectionReferenceLogicalName === "ecl_shared_office365", "Outlook connection reference is incorrect.");
check(refs.shared_sharepointonline?.connection?.connectionReferenceLogicalName === "ecl_shared_sharepointonline", "SharePoint connection reference is incorrect.");
check(actions.Get_Completed_Calendar_Events?.inputs?.host?.operationId === "GetEventsCalendarViewV3", "Calendar view action is missing.");
check(actions.Filter_Eligible_Teams_Meetings?.type === "Query", "Eligibility filter is missing.");
check(actions.Apply_to_each_eligible_meeting?.foreach === "@body('Filter_Eligible_Teams_Meetings')", "Eligible-meeting loop source is incorrect.");
check(actions.Apply_to_each_eligible_meeting?.runtimeConfiguration?.concurrency?.repetitions === 1, "Meeting-loop concurrency must be one.");
check(actions.Get_existing_queue_item?.inputs?.host?.operationId === "GetItems", "Duplicate lookup is missing.");
check(actions.Create_queue_item?.inputs?.host?.operationId === "PostItem", "Queue-item creation is missing.");
check(
  createItemParameters.item?.EventId || createItemParameters["item/EventID"],
  "Create item must provide the tenant's event-ID field."
);
for (const field of ["Title", "JoinURL", "OrganizerEmail", "OrganizerEntraUserID", "MeetingStart", "MeetingEnd", "Status/Value"]) {
  check(createItemParameters[`item/${field}`], `Create item is missing queue field: ${field}`);
}
check(actions.Catch?.runAfter?.Try?.includes("Failed"), "Catch does not run after Try failure.");
check(actions.Catch?.runAfter?.Try?.includes("TimedOut"), "Catch does not run after Try timeout.");

for (const value of [
  "EventID",
  "TeamsTranscript",
  "Queued",
  "josephat@elewa.ke",
  "c07b7048-a9b1-480a-b4db-f7c20ada7b77",
  "https://elewacompanyltd.sharepoint.com/sites/ProjectsDelivery",
  "51450320-536b-4ba3-b005-7f355e7405d9",
  "meeting-summary-v1"
]) {
  check(serialized.includes(value), `Flow 01 is missing required contract value: ${value}`);
}

const promptVariable = path.join(solutionRoot, "environmentvariabledefinitions", "ecl_PromptVersion", "environmentvariabledefinition.xml");
check(fs.existsSync(promptVariable), "Prompt Version environment-variable definition is missing.");

const solutionXml = fs.readFileSync(path.join(solutionRoot, "solution.xml"), "utf8");
const customizationsXml = fs.readFileSync(path.join(solutionRoot, "customizations.xml"), "utf8");
check(solutionXml.includes(`<Version>${expectedVersion}</Version>`), `Solution version is not ${expectedVersion}.`);
check(
  /Name="ECL-MS-01 – Dispatch Completed Meetings"[\s\S]*?<StateCode>0<\/StateCode>[\s\S]*?<StatusCode>1<\/StatusCode>/.test(customizationsXml),
  "Flow 01 must be packaged in draft/off state."
);
check(!/(client[_-]?secret|access[_-]?token|x-functions-key)/i.test(serialized), "Flow contains a secret-like field name.");

if (failures.length) {
  console.error(`Flow 01 solution validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Flow 01 solution validation passed.");
