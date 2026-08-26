import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const baseline = path.join(root, 'power-automate/baselines/ECLMeetingSummary_1_0_0_5');
const draftFile = path.join(root, 'power-automate/generated/ECL-MS-02/flow-definition.json');
const output = path.join(root, 'power-automate/generated/ECLMeetingSummary_1_0_0_6_flow02_import');
const flowName = 'ECL-MS-02-RetrieveTeamsTranscript-72EEC559-75A0-F111-B8DC-000D3AB04AC1.json';

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(baseline, output, { recursive: true });

const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
// Solution workflow JSON stores lifecycle metadata in customizations.xml.
delete draft.properties.displayName;
delete draft.properties.state;
delete draft.properties.connectionReferences.shared_eclgraphtranscriptgateway;

draft.properties.definition.parameters.ecl_SharePointSiteUrl.defaultValue =
  'https://elewacompanyltd.sharepoint.com/sites/ProjectsDelivery';
draft.properties.definition.parameters.ecl_ProcessingListName.defaultValue =
  '51450320-536b-4ba3-b005-7f355e7405d9';
draft.properties.definition.parameters.ecl_TranscriptRetryDelayMinutes.defaultValue = 5;
draft.properties.definition.parameters.ecl_TranscriptMaximumAttempts.defaultValue = 12;

const actions = draft.properties.definition.actions.Try.actions;
actions.Resolve_Meeting = {
  type: 'Compose',
  inputs: {
    id: 'GATEWAY_NOT_CONFIGURED',
    note: 'Replace this action with the Graph transcript gateway ResolveMeeting operation.'
  },
  runAfter: { Set_ResolvingMeeting: ['Succeeded'] }
};
actions.Wait_For_Transcript.actions.List_Transcripts = {
  type: 'Compose',
  inputs: {
    value: [],
    note: 'Replace this action with the Graph transcript gateway ListTranscripts operation.'
  },
  runAfter: {}
};
actions.Transcript_Available.actions.Get_Transcript_Content = {
  type: 'Compose',
  inputs: '',
  runAfter: { Select_Latest_Transcript: ['Succeeded'] }
};
draft.schemaVersion = '1.0.0.0';

fs.writeFileSync(path.join(output, 'Workflows', flowName), `${JSON.stringify(draft, null, 2)}\n`);

const solutionFile = path.join(output, 'solution.xml');
const solution = fs.readFileSync(solutionFile, 'utf8').replace('<Version>1.0.0.5</Version>', '<Version>1.0.0.6</Version>');
fs.writeFileSync(solutionFile, solution);

const customizationsFile = path.join(output, 'customizations.xml');
const customizations = fs.readFileSync(customizationsFile, 'utf8').replace(
  /(<Workflow WorkflowId="\{72eec559-75a0-f111-b8dc-000d3ab04ac1\}"[\s\S]*?<StateCode>)1(<\/StateCode>\s*<StatusCode>)2(<\/StatusCode>)/,
  '$10$21$3'
);
fs.writeFileSync(customizationsFile, customizations);

console.log(output);
