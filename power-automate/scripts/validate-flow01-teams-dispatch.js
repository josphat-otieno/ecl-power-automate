#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || "power-automate/generated/ECLMeetingSummary_1_0_0_7_flow01_teams_dispatch");
const workflowFile = "ECL-MS-01DispatchCompletedMeetings-560C2DA9-37A1-F111-B8DC-000D3AB04AC1.json";
const flow = JSON.parse(fs.readFileSync(path.join(root, "Workflows", workflowFile), "utf8"));
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
const createParameters = actions.Create_queue_item?.inputs?.parameters || {};

check(definition?.triggers?.Recurrence?.type === "Recurrence", "A recurrence trigger is required.");
check(definition?.triggers?.Recurrence?.recurrence?.interval === 15, "The initial recurrence interval must be 15 minutes.");
check(definition?.triggers?.Recurrence?.runtimeConfiguration?.concurrency?.runs === 1, "Trigger concurrency must be one.");
check(!refs.shared_office365, "Flow 01 must not use the Office 365 Outlook connection.");
check(refs.shared_sharepointonline?.connection?.connectionReferenceLogicalName === "ecl_shared_sharepointonline", "SharePoint connection reference is missing.");
check(!refs.shared_eclgraphtranscriptgateway, "Flow must not require the Graph gateway custom connector.");
check(!actions.Get_Enabled_Organizers, "Flow must not read an organizer registry.");
check(actions.Discover_Teams_Transcripts?.type === "Http" && actions.Discover_Teams_Transcripts?.inputs?.uri?.includes("/transcripts/discover"), "HTTP transcript discovery operation is missing.");
check(actions.Get_Teams_Meeting?.type === "Http" && actions.Get_Teams_Meeting?.inputs?.uri?.includes("/onlineMeetings/"), "HTTP meeting metadata operation is missing.");
check(definition?.parameters?.["Graph Gateway Function Key (ecl_GraphGatewayFunctionKey)"]?.type === "SecureString", "Gateway function key must be a secure workflow parameter.");
check(actions.For_each_enabled_organizer?.runtimeConfiguration?.concurrency?.repetitions === 1, "Organizer loop must be sequential initially.");
check(actions.For_each_discovered_meeting?.runtimeConfiguration?.concurrency?.repetitions === 1, "Meeting loop must be sequential initially.");
check(actions.Get_existing_queue_item?.inputs?.parameters?.$filter?.includes("EventID"), "Duplicate lookup must use EventID.");
check(!createParameters["item/DispatchKey"], "Queue item must not require DispatchKey.");
for (const field of ["Title", "EventID", "MeetingID", "TranscriptID", "JoinURL", "OrganizerEntraUserID", "MeetingStart", "MeetingEnd", "Status/Value"]) {
  check(createParameters[`item/${field}`], `Queue item is missing ${field}.`);
}
check(!actions.Organizer_Catch, "Flow must not contain organizer-registry failure updates.");
check(actions.Catch?.runAfter?.Try?.includes("Failed"), "Run-level Catch does not handle failure.");
check(!serialized.includes("GetEventsCalendarViewV3"), "Calendar-view discovery remains in Flow 01.");
check(!serialized.includes("shared_office365"), "Outlook connector remains in Flow 01.");
check(!serialized.includes("josephat@elewa.ke"), "A real organizer email remains hard-coded.");
check(!serialized.includes("c07b7048-a9b1-480a-b4db-f7c20ada7b77"), "A real organizer object ID remains hard-coded.");
check(!serialized.includes("AAMkADFh"), "A literal Outlook calendar ID remains in Flow 01.");
check(!/(client[_-]?secret|access[_-]?token)/i.test(serialized), "Flow contains a secret-like field name.");

const workflowFiles = fs.readdirSync(path.join(root, "Workflows")).filter((file) => file.endsWith(".json"));
check(workflowFiles.length === 1 && workflowFiles[0] === workflowFile, "Targeted package must contain only Flow 01.");
const solution = fs.readFileSync(path.join(root, "solution.xml"), "utf8");
const customizations = fs.readFileSync(path.join(root, "customizations.xml"), "utf8");
check(solution.includes("<Version>1.0.0.7</Version>"), "Solution version must be 1.0.0.7.");
check((solution.match(/<RootComponent type="29"/g) || []).length === 1, "Targeted package must contain one workflow root component.");
check(/Dispatch Available Teams Transcripts[\s\S]*?<StateCode>0<\/StateCode>[\s\S]*?<StatusCode>1<\/StatusCode>/.test(customizations), "Flow 01 must be packaged draft/off.");
check(!customizations.includes("ecl_shared_graphgateway"), "Solution still contains the Graph gateway connection reference.");

const swagger = JSON.parse(fs.readFileSync("ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json", "utf8"));
check(swagger.info?.version === "1.1.0", "Gateway connector version must be 1.1.0.");
check(swagger.paths?.["/users/{organizerUserId}/transcripts/discover"]?.get?.operationId === "DiscoverTranscripts", "Connector discovery operation is missing.");
check(swagger.paths?.["/users/{organizerUserId}/onlineMeetings/{meetingId}"]?.get?.operationId === "GetMeeting", "Connector meeting operation is missing.");

const schema = JSON.parse(fs.readFileSync("ecl-meeting-summary-orchestrator/resources/sharepoint-list-schema.json", "utf8"));
check(!schema.lists?.MeetingSummaryOrganizers, "Organizer registry schema must not be required.");
const eventId = schema.lists?.MeetingSummaryRuns?.columns?.find((column) => column.name === "EventId");
check(eventId?.indexed && eventId?.enforceUniqueValues, "EventID must be indexed and unique.");

if (failures.length) {
  console.error(`Flow 01 Teams dispatch validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Flow 01 Teams dispatch validation passed.");
