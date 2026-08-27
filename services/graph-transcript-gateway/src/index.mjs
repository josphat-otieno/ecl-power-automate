import { app } from "@azure/functions";
import { GatewayError, GraphTranscriptClient, loadConfig } from "./graph-client.mjs";

let clientPromise;

function graphClient() {
  clientPromise ??= loadConfig().then((config) => new GraphTranscriptClient(config));
  return clientPromise;
}

function errorResponse(error, invocationId) {
  const known = error instanceof GatewayError;
  return {
    status: known ? error.status : 500,
    jsonBody: {
      error: {
        code: known ? error.code : "GATEWAY_ERROR",
        message: known ? error.message : "The transcript gateway failed.",
        correlationId: invocationId,
        ...(known && error.requestId ? { graphRequestId: error.requestId } : {})
      }
    }
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => ({ jsonBody: { status: "ok", service: "ecl-graph-transcript-gateway" } })
});

app.http("resolveMeeting", {
  methods: ["GET"],
  authLevel: "function",
  route: "meetings/resolve",
  handler: async (request, context) => {
    try {
      const organizerUserId = request.query.get("organizerUserId");
      const joinUrl = request.query.get("joinUrl");
      const result = await (await graphClient()).resolveMeeting(organizerUserId, joinUrl);
      const matches = result.value ?? [];
      if (matches.length === 0) {
        throw new GatewayError("No active meeting matched this organizer and join URL.", { status: 404, code: "MEETING_NOT_FOUND" });
      }
      if (matches.length > 1) {
        throw new GatewayError("More than one meeting matched this organizer and join URL.", { status: 409, code: "MEETING_NOT_UNIQUE" });
      }
      const meeting = matches[0];
      return {
        jsonBody: {
          id: meeting.id,
          subject: meeting.subject ?? null,
          joinWebUrl: meeting.joinWebUrl ?? null,
          startDateTime: meeting.startDateTime ?? null,
          endDateTime: meeting.endDateTime ?? null
        }
      };
    } catch (error) {
      return errorResponse(error, context.invocationId);
    }
  }
});

app.http("getMeeting", {
  methods: ["GET"],
  authLevel: "function",
  route: "users/{organizerUserId}/onlineMeetings/{meetingId}",
  handler: async (request, context) => {
    try {
      const meeting = await (await graphClient()).getMeeting(
        request.params.organizerUserId,
        request.params.meetingId
      );
      return {
        jsonBody: {
          id: meeting.id,
          subject: meeting.subject ?? null,
          joinWebUrl: meeting.joinWebUrl ?? null,
          startDateTime: meeting.startDateTime ?? null,
          endDateTime: meeting.endDateTime ?? null,
          meetingType: meeting.meetingType ?? null,
          organizer: meeting.participants?.organizer?.identity?.user
            ? {
                id: meeting.participants.organizer.identity.user.id ?? null,
                displayName: meeting.participants.organizer.identity.user.displayName ?? null
              }
            : null
        }
      };
    } catch (error) {
      return errorResponse(error, context.invocationId);
    }
  }
});

app.http("discoverTranscripts", {
  methods: ["GET"],
  authLevel: "function",
  route: "users/{organizerUserId}/transcripts/discover",
  handler: async (request, context) => {
    try {
      const result = await (await graphClient()).discoverTranscripts(
        request.params.organizerUserId,
        request.query.get("startDateTime"),
        request.query.get("endDateTime"),
        request.query.get("checkpoint")
      );
      return {
        jsonBody: {
          value: result.value.map((transcript) => ({
            id: transcript.id,
            meetingId: transcript.meetingId ?? null,
            createdDateTime: transcript.createdDateTime ?? null,
            endDateTime: transcript.endDateTime ?? null,
            meetingOrganizer: transcript.meetingOrganizer?.user
              ? {
                  id: transcript.meetingOrganizer.user.id ?? null,
                  displayName: transcript.meetingOrganizer.user.displayName ?? null
                }
              : null
          })),
          deltaLink: result.deltaLink ?? null
        }
      };
    } catch (error) {
      return errorResponse(error, context.invocationId);
    }
  }
});

app.http("listTranscripts", {
  methods: ["GET"],
  authLevel: "function",
  route: "users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts",
  handler: async (request, context) => {
    try {
      const result = await (await graphClient()).listTranscripts(
        request.params.organizerUserId,
        request.params.meetingId
      );
      return {
        jsonBody: {
          value: (result.value ?? []).map((transcript) => ({
            id: transcript.id,
            createdDateTime: transcript.createdDateTime ?? null,
            endDateTime: transcript.endDateTime ?? null
          }))
        }
      };
    } catch (error) {
      return errorResponse(error, context.invocationId);
    }
  }
});

app.http("getTranscriptContent", {
  methods: ["GET"],
  authLevel: "function",
  route: "users/{organizerUserId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content",
  handler: async (request, context) => {
    try {
      const body = await (await graphClient()).getTranscriptVtt(
        request.params.organizerUserId,
        request.params.meetingId,
        request.params.transcriptId
      );
      return { headers: { "Content-Type": "text/vtt; charset=utf-8" }, body };
    } catch (error) {
      return errorResponse(error, context.invocationId);
    }
  }
});
