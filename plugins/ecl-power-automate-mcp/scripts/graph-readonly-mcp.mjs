#!/usr/bin/env node

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DELEGATED_SCOPES = ["User.Read", "OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All"];
let activeAccessToken = null;
let pendingDeviceCode = null;

const tools = [
  {
    name: "begin_delegated_sign_in",
    description: "Start Microsoft Entra device-code sign-in for the configured ECL test app. This is read-only and requires the user to complete sign-in in Microsoft.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "complete_delegated_sign_in",
    description: "Complete a previously started delegated Entra device-code sign-in after the user has approved it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_current_user",
    description: "Return the delegated Microsoft 365 identity associated with the configured access token.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "resolve_meeting_by_join_url",
    description: "Find an online meeting organised by the delegated user using its Teams join URL.",
    inputSchema: {
      type: "object",
      properties: { join_url: { type: "string", description: "Full Teams meeting join URL." } },
      required: ["join_url"],
      additionalProperties: false
    }
  },
  {
    name: "list_meeting_transcripts",
    description: "List transcripts for an online meeting owned by the delegated user.",
    inputSchema: {
      type: "object",
      properties: { meeting_id: { type: "string", description: "Microsoft Graph online meeting ID." } },
      required: ["meeting_id"],
      additionalProperties: false
    }
  },
  {
    name: "get_transcript_vtt",
    description: "Retrieve one meeting transcript as WebVTT for local cleaning and summarisation.",
    inputSchema: {
      type: "object",
      properties: {
        meeting_id: { type: "string", description: "Microsoft Graph online meeting ID." },
        transcript_id: { type: "string", description: "Microsoft Graph transcript ID." }
      },
      required: ["meeting_id", "transcript_id"],
      additionalProperties: false
    }
  }
];

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function error(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function toolText(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function graphToken() {
  const token = activeAccessToken ?? process.env.ECL_GRAPH_ACCESS_TOKEN;
  if (!token || token.startsWith("${")) {
    throw new Error("ECL_GRAPH_ACCESS_TOKEN is not configured. Supply a short-lived delegated Graph token through the MCP host environment.");
  }
  return token;
}

function entraConfig() {
  const clientId = process.env.ECL_ENTRA_CLIENT_ID;
  const tenantId = process.env.ECL_ENTRA_TENANT_ID;
  if (!clientId || clientId.startsWith("${") || !tenantId || tenantId.startsWith("${")) {
    throw new Error("ECL_ENTRA_CLIENT_ID and ECL_ENTRA_TENANT_ID must be configured for delegated device-code sign-in.");
  }
  return { clientId, tenantId };
}

async function formPost(url, values) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Microsoft Entra ${response.status}: ${result.error_description ?? result.error ?? "Unknown error"}`);
  return result;
}

async function beginSignIn() {
  const { clientId, tenantId } = entraConfig();
  const result = await formPost(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`, {
    client_id: clientId,
    scope: DELEGATED_SCOPES.join(" ")
  });
  pendingDeviceCode = { deviceCode: result.device_code, expiresAt: Date.now() + result.expires_in * 1000 };
  return { message: result.message, expires_in: result.expires_in, interval: result.interval };
}

async function completeSignIn() {
  if (!pendingDeviceCode || Date.now() >= pendingDeviceCode.expiresAt) {
    throw new Error("No active device-code sign-in. Run begin_delegated_sign_in again.");
  }
  const { clientId, tenantId } = entraConfig();
  const result = await formPost(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    device_code: pendingDeviceCode.deviceCode
  });
  activeAccessToken = result.access_token;
  pendingDeviceCode = null;
  return { status: "signed_in", expires_in: result.expires_in, scope: result.scope };
}

async function graphGet(path, accept = "application/json") {
  const result = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${graphToken()}`, Accept: accept }
  });
  const body = await result.text();
  if (!result.ok) {
    throw new Error(`Microsoft Graph ${result.status}: ${body}`);
  }
  return accept === "application/json" ? JSON.parse(body) : body;
}

function escapedODataString(value) {
  return value.replaceAll("'", "''");
}

async function callTool(name, args) {
  switch (name) {
    case "begin_delegated_sign_in":
      return beginSignIn();
    case "complete_delegated_sign_in":
      return completeSignIn();
    case "get_current_user":
      return graphGet("/me?$select=id,displayName,userPrincipalName");
    case "resolve_meeting_by_join_url": {
      const filter = `JoinWebUrl eq '${escapedODataString(args.join_url)}'`;
      return graphGet(`/me/onlineMeetings?${new URLSearchParams({ "$filter": filter })}`);
    }
    case "list_meeting_transcripts":
      return graphGet(`/me/onlineMeetings/${encodeURIComponent(args.meeting_id)}/transcripts`);
    case "get_transcript_vtt":
      return graphGet(
        `/me/onlineMeetings/${encodeURIComponent(args.meeting_id)}/transcripts/${encodeURIComponent(args.transcript_id)}/content?$format=text/vtt`,
        "text/vtt"
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  for (const line of input.split(/\r?\n/).filter(Boolean)) {
    let message;
    try {
      message = JSON.parse(line);
      if (message.method === "notifications/initialized") continue;
      if (message.method === "initialize") {
        process.stdout.write(`${JSON.stringify(response(message.id, {
          protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "ecl-graph-transcripts", version: "0.1.0" }
        }))}\n`);
        continue;
      }
      if (message.method === "tools/list") {
        process.stdout.write(`${JSON.stringify(response(message.id, { tools }))}\n`);
        continue;
      }
      if (message.method === "tools/call") {
        const value = await callTool(message.params?.name, message.params?.arguments ?? {});
        process.stdout.write(`${JSON.stringify(response(message.id, toolText(value)))}\n`);
        continue;
      }
      process.stdout.write(`${JSON.stringify(error(message.id, -32601, "Method not found"))}\n`);
    } catch (cause) {
      process.stdout.write(`${JSON.stringify(error(message?.id ?? null, -32000, cause.message))}\n`);
    }
  }
});
