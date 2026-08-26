# ECL Meeting Summary 1.0.0.3 reconciliation

Source export checksum:

`5eab54f3ee2d3f6c1ed940425a4b26ade7ac197830d74ed9f27ac7e9b1065ecc`

## Confirmed live corrections

- Flow 01 has Outlook and SharePoint connection references.
- The manual trigger has concurrency set to one.
- `Initialize_WindowEnd` uses a fixed 15-minute transcript delay for the proof of concept.
- The SharePoint `Create item` action is bound to the Projects Delivery site and the `MeetingSummaryRuns` list GUID.
- The list's observed event column internal name is `EventID`.
- `ecl_PromptVersion` is present in the solution.

## Outstanding Flow 01 reconciliation

The exported Flow 01 still filters against fields that are absent from the observed Outlook `Get calendar view of events (V3)` response: `isOnlineMeeting`, `onlineMeetingProvider`, `onlineMeeting.joinUrl`, structured `organizer.emailAddress.address`, and `isCancelled`.

The observed connector shape instead provides:

- `organizer` as a string email address;
- `location` as `Microsoft Teams Meeting`; and
- the Teams join URL inside the HTML `body`.

Before Flow 01 is accepted, update the filter to use the observed fields, extract the first Teams URL from `body`, and populate the remaining queue fields: `Title`, `JoinUrl`, `OrganizerEmail`, `OrganizerUserId`, `MeetingStart`, `MeetingEnd`, and `Status`.

## Flow 02 baseline state

- Manual proof-of-concept trigger exists with `JoinUrl` and `TestRunId`.
- Attempt and transcript variables exist.
- Try, Catch, and Finally scopes exist but are incomplete.
- No Graph gateway or SharePoint connection is mapped into Flow 02.
- No meeting resolution, transcript listing, transcript retrieval, SharePoint status update, or VTT cleaning action exists.
- The current `Until`/`Transcript Available` ordering is reversed and must be rebuilt.
