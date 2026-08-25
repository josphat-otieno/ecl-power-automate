import assert from "node:assert/strict";
import test from "node:test";
import { GatewayError, GraphTranscriptClient, assertOrganizerUserId, assertTeamsJoinUrl } from "../src/graph-client.mjs";

const USER_ID = "c07b7048-a9b1-480a-b4db-f7c20ada7b77";
const JOIN_URL = "https://teams.microsoft.com/meet/355474200916606?p=example";

test("validates organizer object IDs and Teams URLs", () => {
  assert.equal(assertOrganizerUserId(USER_ID), USER_ID);
  assert.equal(assertTeamsJoinUrl(JOIN_URL), JOIN_URL);
  assert.throws(() => assertOrganizerUserId("organizer@example.com"), /object ID/);
  assert.throws(() => assertTeamsJoinUrl("https://example.com/meeting"), /teams.microsoft.com/);
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
