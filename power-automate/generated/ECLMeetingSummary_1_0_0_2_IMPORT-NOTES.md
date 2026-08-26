# ECL Meeting Summary 1.0.0.2 import notes

This unmanaged solution was derived from `ECLMeetingSummary_1_0_0_1.zip` and changes only Flow 01 plus its required `ecl_PromptVersion` environment variable.

Before import into Development:

1. Confirm `ecl_DefaultOrganizerEmail`, `ecl_DefaultOrganizerUserId`, and `ecl_SharePointSiteUrl` have current values.
2. Confirm the `MeetingSummaryRuns` SharePoint list exists and its internal column names match the flow parameters.
3. Map both `ecl_shared_office365` and `ecl_shared_sharepointonline` to the approved organizer's connections.
4. Import as unmanaged and leave Flow 01 off.
5. Open Flow 01 in the designer and allow connector metadata to reconcile the calendar and SharePoint list fields.
6. Run Flow Checker before saving or enabling the flow.
7. Perform a manual run with `LookbackMinutes = 90`, then repeat it to verify duplicate prevention.

The calendar identifier remains the identifier exported from the existing Flow 01. Confirm it resolves to the approved organizer's primary calendar after connection mapping.
