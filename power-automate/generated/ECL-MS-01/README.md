# ECL-MS-01 Teams transcript dispatcher

This generated artifact replaces the single-organizer Outlook calendar scan with scheduled Teams transcript discovery through the ECL Graph Transcript Gateway.

The package is intentionally draft/off. During import, set `ecl_DefaultOrganizerUserId`, `ecl_GraphGatewayBaseUrl`, and `ecl_GraphGatewayFunctionKey`, then map the SharePoint connection.

The flow uses the existing unique `EventID` field, populated with `MeetingID`, to prevent duplicate queue records. It does not require `MeetingSummaryOrganizers` or `DispatchKey`. Channel meetings and ad-hoc calls are outside this initial source scope.
