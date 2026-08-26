# ECL-MS-02 generated artifacts

This folder contains the implemented draft source artifact for `ECL-MS-02 - Retrieve Teams Transcript`.

It is intentionally not labeled as an importable Dataverse solution ZIP. A valid solution package must be based on an exported unmanaged `ECL Meeting Summary` solution shell so Dataverse supplies component identifiers, publisher metadata, environment-variable definitions, connection-reference components, and dependency declarations.

The current solution shell is `power-automate/baselines/ECLMeetingSummary_1_0_0_5.zip`. Packaging is deferred because the Graph gateway and `ecl_shared_graphgateway` custom-connector connection do not exist yet. Power Platform validates those dependencies during import.

## Included

- `flow-definition.json`: Logic Apps-style solution cloud-flow definition with SharePoint and Graph gateway connection-reference mappings.
- `deployment-settings.template.json`: environment-variable and connection mappings to complete before import.
- `artifact-manifest.json`: provenance, status, and known limitations.

## Required before activation

1. Deploy or otherwise expose the Graph transcript gateway.
2. Import the gateway custom connector and confirm its actual connector API name.
3. Create the SharePoint `MeetingSummaryRuns` list from the repository schema.
4. Use the preserved unmanaged `ECL Meeting Summary` version `1.0.0.5` baseline.
5. Unpack it with `pac solution unpack`, merge this workflow definition, then repack with `pac solution pack`.
6. Populate deployment settings with actual Development connection IDs.
7. Import as unmanaged, leave the flow off, bind connections, validate, and only then enable it.

Run `node ../../scripts/validate-generated-flow.js` from this folder to validate the artifact without tenant access.
