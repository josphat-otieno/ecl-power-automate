# Power Automate implementation assets

`flow-specs/` contains machine-readable build contracts for flows that are ready to create inside the `ECL Meeting Summary` solution. They are review artifacts, not exported Power Platform solution packages; environment-specific connection IDs are created only after the target Development environment is confirmed.

The first build contract is Flow 02 because Graph meeting resolution and transcript authorization are the highest-risk boundary and have already been proven independently.

## Live solution baseline

`baselines/ECLMeetingSummary_1_0_0_3.zip` is the preserved Development export after the first Flow 01 import and live SharePoint connector correction. Its extracted contents are under `baselines/ECLMeetingSummary_1_0_0_3/`, with reconciliation notes alongside it.

`baselines/ECLMeetingSummary_1_0_0_5.zip` is the current Development baseline containing the complete saved Flow 01 correction. Use `1.0.0.5`, not `1.0.0.3`, as the source for Flow 02 packaging.

`generated/ECLMeetingSummary_1_0_0_7_flow01_teams_dispatch.zip` is the targeted draft/off implementation of the revised Teams-led, multi-organizer Flow 01. It discovers available scheduled-meeting transcripts through the Graph gateway rather than scanning one Outlook calendar. Provision the organizer registry and unique `DispatchKey`, update/import gateway connector version `1.1.0`, and map both connection references before importing or enabling it.

The next implementation plan is `plans/ECL-MS-02-implementation-plan.md`. Flow 02 must be packaged as a targeted update so the active unpublished Flow 03 revision is not overwritten.
