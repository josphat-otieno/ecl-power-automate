import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const baseline = path.join(root, "power-automate/baselines/ECLMeetingSummary_1_0_0_5");
const sourceDir = path.join(root, "power-automate/generated/ECL-MS-01");
const output = path.join(root, "power-automate/generated/ECLMeetingSummary_1_0_0_7_flow01_teams_dispatch");
const zipFile = `${output}.zip`;
const workflowFile = "ECL-MS-01DispatchCompletedMeetings-560C2DA9-37A1-F111-B8DC-000D3AB04AC1.json";
const siteUrl = "https://elewacompanyltd.sharepoint.com/sites/ProjectsDelivery";
const processingListId = "51450320-536b-4ba3-b005-7f355e7405d9";

const parameter = (type, defaultValue) => ({ type, ...(defaultValue === undefined ? {} : { defaultValue }) });
const successAfter = (name) => ({ [name]: ["Succeeded"] });
const sharePointHost = (operationId) => ({
  apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
  connectionName: "shared_sharepointonline",
  operationId
});

const flow = {
  properties: {
    connectionReferences: {
      shared_sharepointonline: {
        runtimeSource: "embedded",
        connection: { connectionReferenceLogicalName: "ecl_shared_sharepointonline" },
        api: { name: "shared_sharepointonline" }
      }
    },
    definition: {
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      parameters: {
        $authentication: parameter("SecureObject", {}),
        $connections: parameter("Object", {}),
        "SharePoint Site URL (ecl_SharePointSiteUrl)": parameter("String", siteUrl),
        "Processing List Name (ecl_ProcessingListName)": parameter("String", processingListId),
        "Graph Gateway Base URL (ecl_GraphGatewayBaseUrl)": parameter("String", "https://ecl-graph-gateway.azurewebsites.net/api"),
        "Graph Gateway Function Key (ecl_GraphGatewayFunctionKey)": parameter("SecureString"),
        "Default Organizer Entra User ID (ecl_DefaultOrganizerUserId)": parameter("String"),
        "Transcript Discovery Lookback Minutes (ecl_TranscriptDiscoveryLookbackMinutes)": parameter("Int", 180),
        "Prompt Version (ecl_PromptVersion)": parameter("String", "v1")
      },
      triggers: {
        Recurrence: {
          type: "Recurrence",
          recurrence: { frequency: "Minute", interval: 15, timeZone: "UTC" },
          runtimeConfiguration: { concurrency: { runs: 1 } }
        }
      },
      actions: {
        Initialize_WindowStart: {
          type: "InitializeVariable",
          inputs: {
            variables: [{
              name: "WindowStart",
              type: "string",
              value: "@formatDateTime(addMinutes(utcNow(), mul(-1, int(parameters('Transcript Discovery Lookback Minutes (ecl_TranscriptDiscoveryLookbackMinutes)')))), 'yyyy-MM-ddTHH:mm:ssZ')"
            }]
          },
          runAfter: {}
        },
        Initialize_WindowEnd: {
          type: "InitializeVariable",
          inputs: {
            variables: [{ name: "WindowEnd", type: "string", value: "@formatDateTime(utcNow(), 'yyyy-MM-ddTHH:mm:ssZ')" }]
          },
          runAfter: successAfter("Initialize_WindowStart")
        },
        Initialize_CorrelationId: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "CorrelationId", type: "string", value: "@guid()" }] },
          runAfter: successAfter("Initialize_WindowEnd")
        },
        Try: {
          type: "Scope",
          runAfter: successAfter("Initialize_CorrelationId"),
          actions: {
            For_each_enabled_organizer: {
              type: "Foreach",
              foreach: "@createArray(parameters('Default Organizer Entra User ID (ecl_DefaultOrganizerUserId)'))",
              runtimeConfiguration: { concurrency: { repetitions: 1 } },
              runAfter: {},
              actions: {
                Organizer_Try: {
                  type: "Scope",
                  runAfter: {},
                  actions: {
                    Discover_Teams_Transcripts: {
                      type: "Http",
                      inputs: {
                        method: "GET",
                        uri: "@concat(parameters('Graph Gateway Base URL (ecl_GraphGatewayBaseUrl)'), '/users/', encodeUriComponent(items('For_each_enabled_organizer')), '/transcripts/discover?startDateTime=', encodeUriComponent(variables('WindowStart')), '&endDateTime=', encodeUriComponent(variables('WindowEnd')))",
                        headers: { "x-functions-key": "@parameters('Graph Gateway Function Key (ecl_GraphGatewayFunctionKey)')" }
                      },
                      runtimeConfiguration: { secureData: { properties: ["inputs", "outputs"] } },
                      runAfter: {}
                    },
                    Select_Meeting_IDs: {
                      type: "Select",
                      inputs: {
                        from: "@coalesce(body('Discover_Teams_Transcripts')?['value'], json('[]'))",
                        select: { meetingId: "@item()?['meetingId']" }
                      },
                      runAfter: successAfter("Discover_Teams_Transcripts")
                    },
                    Unique_Meeting_IDs: {
                      type: "Compose",
                      inputs: "@union(body('Select_Meeting_IDs'), body('Select_Meeting_IDs'))",
                      runAfter: successAfter("Select_Meeting_IDs")
                    },
                    For_each_discovered_meeting: {
                      type: "Foreach",
                      foreach: "@outputs('Unique_Meeting_IDs')",
                      runtimeConfiguration: { concurrency: { repetitions: 1 } },
                      runAfter: successAfter("Unique_Meeting_IDs"),
                      actions: {
                        Filter_Transcripts_For_Meeting: {
                          type: "Query",
                          inputs: {
                            from: "@coalesce(body('Discover_Teams_Transcripts')?['value'], json('[]'))",
                            where: "@equals(item()?['meetingId'], items('For_each_discovered_meeting')?['meetingId'])"
                          },
                          runAfter: {}
                        },
                        Select_Latest_Discovered_Transcript: {
                          type: "Compose",
                          inputs: "@last(sort(body('Filter_Transcripts_For_Meeting'), 'createdDateTime'))",
                          runAfter: successAfter("Filter_Transcripts_For_Meeting")
                        },
                        Get_Teams_Meeting: {
                          type: "Http",
                          inputs: {
                            method: "GET",
                            uri: "@concat(parameters('Graph Gateway Base URL (ecl_GraphGatewayBaseUrl)'), '/users/', encodeUriComponent(items('For_each_enabled_organizer')), '/onlineMeetings/', encodeUriComponent(items('For_each_discovered_meeting')?['meetingId']))",
                            headers: { "x-functions-key": "@parameters('Graph Gateway Function Key (ecl_GraphGatewayFunctionKey)')" }
                          },
                          runtimeConfiguration: { secureData: { properties: ["inputs", "outputs"] } },
                          runAfter: successAfter("Select_Latest_Discovered_Transcript")
                        },
                        If_Eligible_Scheduled_Meeting: {
                          type: "If",
                          expression: "@and(equals(toLower(coalesce(body('Get_Teams_Meeting')?['organizer']?['id'], '')), toLower(items('For_each_enabled_organizer'))), or(empty(body('Get_Teams_Meeting')?['meetingType']), equals(toLower(body('Get_Teams_Meeting')?['meetingType']), 'scheduled')), not(empty(body('Get_Teams_Meeting')?['joinWebUrl'])))",
                          runAfter: successAfter("Get_Teams_Meeting"),
                          actions: {
                            Get_existing_queue_item: {
                              type: "OpenApiConnection",
                              inputs: {
                                host: sharePointHost("GetItems"),
                                parameters: {
                                  dataset: "@parameters('SharePoint Site URL (ecl_SharePointSiteUrl)')",
                                  table: "@parameters('Processing List Name (ecl_ProcessingListName)')",
                                  $filter: "@concat('EventID eq ''', replace(items('For_each_discovered_meeting')?['meetingId'], '''', ''''''), '''')",
                                  $top: 1
                                }
                              },
                              runAfter: {}
                            },
                            If_not_already_queued: {
                              type: "If",
                              expression: "@equals(length(outputs('Get_existing_queue_item')?['body/value']), 0)",
                              runAfter: successAfter("Get_existing_queue_item"),
                              actions: {
                                Create_queue_item: {
                                  type: "OpenApiConnection",
                                  inputs: {
                                    host: sharePointHost("PostItem"),
                                    parameters: {
                                      dataset: "@parameters('SharePoint Site URL (ecl_SharePointSiteUrl)')",
                                      table: "@parameters('Processing List Name (ecl_ProcessingListName)')",
                                      "item/Title": "@coalesce(body('Get_Teams_Meeting')?['subject'], 'Untitled Teams meeting')",
                                      "item/EventID": "@items('For_each_discovered_meeting')?['meetingId']",
                                      "item/SourceType/Value": "TeamsTranscript",
                                      "item/JoinURL": "@body('Get_Teams_Meeting')?['joinWebUrl']",
                                      "item/OrganizerEntraUserID": "@items('For_each_enabled_organizer')",
                                      "item/MeetingStart": "@body('Get_Teams_Meeting')?['startDateTime']",
                                      "item/MeetingEnd": "@body('Get_Teams_Meeting')?['endDateTime']",
                                      "item/MeetingID": "@items('For_each_discovered_meeting')?['meetingId']",
                                      "item/TranscriptID": "@outputs('Select_Latest_Discovered_Transcript')?['id']",
                                      "item/Status/Value": "Queued",
                                      "item/AttemptCount": 0,
                                      "item/ApprovalStarted": false,
                                      "item/PromptVersion": "@parameters('Prompt Version (ecl_PromptVersion)')"
                                    }
                                  },
                                  runAfter: {}
                                }
                              },
                              else: { actions: {} }
                            }
                          },
                          else: { actions: {} }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        Catch: {
          type: "Scope",
          actions: {
            Compose_sanitized_failure: {
              type: "Compose",
              inputs: "@concat('DISPATCH_FAILED:', variables('CorrelationId'))",
              runAfter: {}
            }
          },
          runAfter: { Try: ["Failed", "TimedOut"] }
        }
      },
      outputs: {}
    },
    templateName: null
  },
  schemaVersion: "1.0.0.0"
};

fs.rmSync(sourceDir, { recursive: true, force: true });
fs.mkdirSync(sourceDir, { recursive: true });
fs.writeFileSync(path.join(sourceDir, "flow-definition.json"), `${JSON.stringify(flow, null, 2)}\n`);
fs.writeFileSync(path.join(sourceDir, "deployment-settings.template.json"), `${JSON.stringify({
  environmentVariables: {
    ecl_SharePointSiteUrl: siteUrl,
    ecl_ProcessingListName: processingListId,
    ecl_GraphGatewayBaseUrl: "https://ecl-graph-gateway.azurewebsites.net/api",
    ecl_GraphGatewayFunctionKey: "REPLACE-WITH-AZURE-FUNCTION-KEY",
    ecl_DefaultOrganizerUserId: "REPLACE-WITH-ORGANIZER-ENTRA-USER-ID",
    ecl_TranscriptDiscoveryLookbackMinutes: 180,
    ecl_PromptVersion: "v1"
  },
  connectionReferences: {
    ecl_shared_sharepointonline: "MAP-DURING-IMPORT"
  }
}, null, 2)}\n`);
fs.copyFileSync(
  path.join(root, "ecl-meeting-summary-orchestrator/resources/graph-gateway-connector-swagger.json"),
  path.join(sourceDir, "graph-gateway-connector-swagger.json")
);
fs.copyFileSync(
  path.join(root, "ecl-meeting-summary-orchestrator/resources/sharepoint-list-schema.json"),
  path.join(sourceDir, "sharepoint-list-schema.json")
);

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(baseline, output, { recursive: true });
for (const file of fs.readdirSync(path.join(output, "Workflows"))) {
  if (file !== workflowFile) fs.rmSync(path.join(output, "Workflows", file));
}
fs.writeFileSync(path.join(output, "Workflows", workflowFile), `${JSON.stringify(flow, null, 2)}\n`);

const environmentRoot = path.join(output, "environmentvariabledefinitions");
const retainedVariables = new Set(["ecl_SharePointSiteUrl", "ecl_ProcessingListName", "ecl_PromptVersion"]);
for (const directory of fs.readdirSync(environmentRoot)) {
  if (!retainedVariables.has(directory)) fs.rmSync(path.join(environmentRoot, directory), { recursive: true, force: true });
}
const environmentDefinitions = [
  {
    schemaName: "ecl_GraphGatewayBaseUrl",
    displayName: "Graph Gateway Base URL",
    type: 100000000,
    defaultValue: "https://ecl-graph-gateway.azurewebsites.net/api"
  },
  {
    schemaName: "ecl_GraphGatewayFunctionKey",
    displayName: "Graph Gateway Function Key",
    type: 100000000,
    defaultValue: ""
  },
  {
    schemaName: "ecl_DefaultOrganizerUserId",
    displayName: "Default Organizer Entra User ID",
    type: 100000000,
    defaultValue: ""
  },
  {
    schemaName: "ecl_TranscriptDiscoveryLookbackMinutes",
    displayName: "Transcript Discovery Lookback (Minutes)",
    type: 100000001,
    defaultValue: "180"
  }
];
for (const definition of environmentDefinitions) {
  const directory = path.join(environmentRoot, definition.schemaName);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "environmentvariabledefinition.xml"), `<environmentvariabledefinition schemaname="${definition.schemaName}">
  <defaultvalue>${definition.defaultValue}</defaultvalue>
  <displayname default="${definition.displayName}">
    <label description="${definition.displayName}" languagecode="1033" />
  </displayname>
  <introducedversion>1.0.0.7</introducedversion>
  <iscustomizable>1</iscustomizable>
  <isrequired>0</isrequired>
  <secretstore>0</secretstore>
  <type>${definition.type}</type>
</environmentvariabledefinition>`);
}

const solutionFile = path.join(output, "solution.xml");
let solution = fs.readFileSync(solutionFile, "utf8");
solution = solution.replace("<Version>1.0.0.5</Version>", "<Version>1.0.0.7</Version>");
solution = solution.replace(/\s*<RootComponent type="29" id="\{(?:72eec559-75a0-f111-b8dc-000d3ab04ac1|9bd376e9-cfa0-f111-b8dc-000d3ab04ac1|a49701ec-82a0-f111-b8dc-000d3ab04ac1)\}" behavior="0" \/>/g, "");
fs.writeFileSync(solutionFile, solution);

const customizationsFile = path.join(output, "customizations.xml");
let customizations = fs.readFileSync(customizationsFile, "utf8");
customizations = customizations.replace(/\s*<Workflow WorkflowId="\{(?:72eec559-75a0-f111-b8dc-000d3ab04ac1|9bd376e9-cfa0-f111-b8dc-000d3ab04ac1|a49701ec-82a0-f111-b8dc-000d3ab04ac1)\}"[\s\S]*?<\/Workflow>/g, "");
customizations = customizations.replaceAll("ECL-MS-01 – Dispatch Completed Meetings", "ECL-MS-01 – Dispatch Available Teams Transcripts");
customizations = customizations.replace(
  /(<Workflow WorkflowId="\{560c2da9-37a1-f111-b8dc-000d3ab04ac1\}"[\s\S]*?<StateCode>)1(<\/StateCode>\s*<StatusCode>)2(<\/StatusCode>)/,
  "$10$21$3"
);
customizations = customizations.replace(/\s*<connectionreference connectionreferencelogicalname="(?:ecl_shared_approvals|ecl_shared_office365|new_sharedkeyvault_cb6e4|ecl_shared_graphgateway)"[\s\S]*?<\/connectionreference>/g, "");
fs.writeFileSync(customizationsFile, customizations);

fs.writeFileSync(path.join(sourceDir, "README.md"), `# ECL-MS-01 Teams transcript dispatcher

This generated artifact replaces the single-organizer Outlook calendar scan with scheduled Teams transcript discovery through the ECL Graph Transcript Gateway.

The package is intentionally draft/off. During import, set \`ecl_DefaultOrganizerUserId\`, \`ecl_GraphGatewayBaseUrl\`, and \`ecl_GraphGatewayFunctionKey\`, then map the SharePoint connection.

The flow uses the existing unique \`EventID\` field, populated with \`MeetingID\`, to prevent duplicate queue records. It does not require \`MeetingSummaryOrganizers\` or \`DispatchKey\`. Channel meetings and ad-hoc calls are outside this initial source scope.
`);

fs.writeFileSync(path.join(sourceDir, "artifact-manifest.json"), `${JSON.stringify({
  solutionVersion: "1.0.0.7",
  sourceBaseline: "ECLMeetingSummary_1_0_0_5",
  workflowId: "560c2da9-37a1-f111-b8dc-000d3ab04ac1",
  workflowState: "Draft/Off",
  packageDirectory: path.relative(root, output),
  packageZip: path.relative(root, zipFile),
  prerequisites: [
    "ecl_DefaultOrganizerUserId environment value",
    "Unique MeetingSummaryRuns.EventID column",
    "Graph gateway base URL and Azure Function key",
    "OnlineMeetingTranscript.Read.All and tenant transcript access policy"
  ]
}, null, 2)}\n`);

fs.rmSync(zipFile, { force: true });
execFileSync("zip", ["-q", "-r", zipFile, "."], { cwd: output });
console.log(output);
console.log(zipFile);
