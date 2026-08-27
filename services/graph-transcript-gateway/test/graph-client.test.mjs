import assert from "node:assert/strict";
import test from "node:test";
import {
  GatewayError,
  GraphTranscriptClient,
  assertDiscoveryWindow,
  assertOrganizerUserId,
  assertTeamsJoinUrl
} from "../src/graph-client.mjs";

const USER_ID = "c07b7048-a9b1-480a-b4db-f7c20ada7b77";
const JOIN_URL = "https://teams.microsoft.com/meet/355474200916606?p=example";

test("validates organizer object IDs and Teams URLs", () => {
  assert.equal(assertOrganizerUserId(USER_ID), USER_ID);
  assert.equal(assertTeamsJoinUrl(JOIN_URL), JOIN_URL);
  assert.throws(() => assertOrganizerUserId("organizer@example.com"), /object ID/);
  assert.throws(() => assertTeamsJoinUrl("https://example.com/meeting"), /teams.microsoft.com/);
});

test("validates bounded UTC discovery windows", () => {
  assert.deepEqual(assertDiscoveryWindow("2026-08-27T08:00:00Z", "2026-08-27T09:30:00Z"), {
    startDateTime: "2026-08-27T08:00:00Z",
    endDateTime: "2026-08-27T09:30:00Z"
  });
  assert.throws(
    () => assertDiscoveryWindow("2026-08-27T08:00:00+03:00", "2026-08-27T09:30:00Z"),
    (error) => error instanceof GatewayError && error.code === "DISCOVERY_TIME_INVALID"
  );
  assert.throws(
    () => assertDiscoveryWindow("2026-08-27T09:30:00Z", "2026-08-27T08:00:00Z"),
    (error) => error instanceof GatewayError && error.code === "DISCOVERY_WINDOW_INVALID"
  );
  assert.throws(
    () => assertDiscoveryWindow("2026-08-26T08:00:00Z", "2026-08-27T09:30:00Z"),
    (error) => error instanceof GatewayError && error.code === "DISCOVERY_WINDOW_INVALID"
  );
});

test("acquires one app token and reuses it for Graph requests", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ value: [{ id: "meeting-1" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "request-id": "request-1" }
    });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion", now: () => 1_000_000 }
  );

  await client.resolveMeeting(USER_ID, JOIN_URL);
  await client.resolveMeeting(USER_ID, JOIN_URL);

  assert.equal(calls.filter((call) => call.url.includes("/token")).length, 1);
  assert.equal(calls.filter((call) => call.url.includes("graph.microsoft.com")).length, 2);
  assert.match(calls[1].url, /\/users\/c07b7048-a9b1-480a-b4db-f7c20ada7b77\/onlineMeetings/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-token");
});

test("returns sanitized Graph errors with request IDs", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: "NotFound", message: "Specified meeting is not found" } }), {
      status: 404,
      headers: { "request-id": "graph-request-id" }
    });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion" }
  );

  await assert.rejects(
    () => client.listTranscripts(USER_ID, "meeting-1"),
    (error) => error instanceof GatewayError && error.status === 404 && error.code === "NotFound" && error.requestId === "graph-request-id"
  );
});

test("discovers transcript pages for one organizer and preserves the delta link", async () => {
  const graphCalls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    graphCalls.push(value);
    if (graphCalls.length === 1) {
      return new Response(JSON.stringify({
        value: [{ id: "transcript-1", meetingId: "meeting-1" }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/users/next-page"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      value: [{ id: "transcript-2", meetingId: "meeting-2" }],
      "@odata.deltaLink": "https://graph.microsoft.com/v1.0/users/delta-page?$deltatoken=opaque"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion" }
  );

  const result = await client.discoverTranscripts(USER_ID, "2026-08-27T08:00:00Z", "2026-08-27T09:30:00Z");

  assert.deepEqual(result.value.map((item) => item.id), ["transcript-1", "transcript-2"]);
  assert.match(result.deltaLink, /deltatoken=opaque/);
  assert.match(graphCalls[0], /getAllTranscripts\(meetingOrganizerUserId='c07b7048-a9b1-480a-b4db-f7c20ada7b77'/);
  assert.match(graphCalls[0], /startDateTime=2026-08-27T08:00:00Z/);
});

test("rejects pagination URLs outside Microsoft Graph v1.0", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({
      value: [],
      "@odata.nextLink": "https://example.com/steal-token"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion" }
  );

  await assert.rejects(
    () => client.discoverTranscripts(USER_ID, "2026-08-27T08:00:00Z", "2026-08-27T09:30:00Z"),
    (error) => error instanceof GatewayError && error.code === "GRAPH_PAGINATION_INVALID"
  );
});

test("follows a validated opaque discovery checkpoint without rebuilding the time filter", async () => {
  const checkpoint = `https://graph.microsoft.com/v1.0/users/${USER_ID}/onlineMeetings/getAllTranscripts/delta?$deltatoken=opaque`;
  const calls = [];
  const fetchImpl = async (url) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    calls.push(String(url));
    return new Response(JSON.stringify({ value: [], "@odata.deltaLink": checkpoint }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion" }
  );

  await client.discoverTranscripts(USER_ID, null, null, checkpoint);
  assert.equal(calls[0], checkpoint);
});

test("rejects a checkpoint that targets another Graph resource", () => {
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl: async () => { throw new Error("fetch must not run"); }, assertionFactory: async () => "signed-assertion" }
  );
  assert.throws(
    () => client.discoverTranscripts(USER_ID, null, null, "https://graph.microsoft.com/v1.0/users?$deltatoken=opaque"),
    (error) => error instanceof GatewayError && error.code === "DISCOVERY_CHECKPOINT_INVALID"
  );
});

test("gets online meeting metadata by organizer and meeting ID", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    calls.push(String(url));
    return new Response(JSON.stringify({ id: "meeting-1", subject: "Delivery review" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const client = new GraphTranscriptClient(
    { clientId: "client-id", tenantId: "tenant-id", certificatePem: "unused", privateKeyPem: "unused" },
    { fetchImpl, assertionFactory: async () => "signed-assertion" }
  );

  const meeting = await client.getMeeting(USER_ID, "meeting-1");
  assert.equal(meeting.subject, "Delivery review");
  assert.match(calls[0], /\/users\/c07b7048-a9b1-480a-b4db-f7c20ada7b77\/onlineMeetings\/meeting-1$/);
});
