import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GatewayError extends Error {
  constructor(message, { status = 500, code = "GATEWAY_ERROR", requestId } = {}) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function certificateDer(certificatePem) {
  const encoded = certificatePem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
  if (!encoded) throw new GatewayError("The configured certificate is empty.", { code: "CERTIFICATE_INVALID" });
  return Buffer.from(encoded, "base64");
}

export function assertOrganizerUserId(value) {
  if (!USER_ID_PATTERN.test(value ?? "")) {
    throw new GatewayError("organizerUserId must be a Microsoft Entra user object ID.", {
      status: 400,
      code: "ORGANIZER_USER_ID_INVALID"
    });
  }
  return value;
}

export function assertTeamsJoinUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new GatewayError("joinUrl must be a valid Microsoft Teams HTTPS URL.", {
      status: 400,
      code: "JOIN_URL_INVALID"
    });
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "teams.microsoft.com") {
    throw new GatewayError("joinUrl must be hosted at teams.microsoft.com.", {
      status: 400,
      code: "JOIN_URL_INVALID"
    });
  }
  return value;
}

export async function createClientAssertion(config, now = Date.now()) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t: createHash("sha1").update(certificateDer(config.certificatePem)).digest("base64url")
  };
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    aud: tokenUrl,
    exp: issuedAt + 600,
    iss: config.clientId,
    jti: randomUUID(),
    nbf: issuedAt - 5,
    sub: config.clientId
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), createPrivateKey(config.privateKeyPem));
  return `${unsigned}.${signature.toString("base64url")}`;
}

async function readSettingOrFile(valueSetting, pathSetting) {
  if (valueSetting) return valueSetting.replaceAll("\\n", "\n");
  if (pathSetting) return readFile(pathSetting, "utf8");
  return null;
}

export async function loadConfig(env = process.env) {
  const [certificatePem, privateKeyPem] = await Promise.all([
    readSettingOrFile(env.ECL_ENTRA_CERT_PEM, env.ECL_ENTRA_CERT_PATH),
    readSettingOrFile(env.ECL_ENTRA_PRIVATE_KEY_PEM, env.ECL_ENTRA_PRIVATE_KEY_PATH)
  ]);
  const config = {
    clientId: env.ECL_ENTRA_CLIENT_ID,
    tenantId: env.ECL_ENTRA_TENANT_ID,
    certificatePem,
    privateKeyPem
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new GatewayError(`Missing gateway configuration: ${missing.join(", ")}.`, {
      code: "GATEWAY_CONFIG_INVALID"
    });
  }
  return config;
}

function parseGraphError(body) {
  try {
    const parsed = JSON.parse(body);
    return {
      code: parsed.error?.innerError?.code ?? parsed.error?.code ?? "GRAPH_ERROR",
      message: parsed.error?.message ?? "Microsoft Graph rejected the request."
    };
  } catch {
    return { code: "GRAPH_ERROR", message: "Microsoft Graph rejected the request." };
  }
}

export class GraphTranscriptClient {
  constructor(config, { fetchImpl = fetch, assertionFactory = createClientAssertion, now = () => Date.now() } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.assertionFactory = assertionFactory;
    this.now = now;
    this.cachedToken = null;
  }

  async accessToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > this.now() + 60_000) return this.cachedToken.value;

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`;
    const assertion = await this.assertionFactory(this.config, this.now());
    const response = await this.fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion
      })
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) {
      throw new GatewayError("Microsoft Entra certificate authentication failed.", {
        status: 502,
        code: body.error ?? "ENTRA_TOKEN_FAILED",
        requestId: response.headers.get("x-ms-request-id") ?? undefined
      });
    }
    this.cachedToken = {
      value: body.access_token,
      expiresAt: this.now() + Math.max(60, Number(body.expires_in ?? 3600)) * 1000
    };
    return this.cachedToken.value;
  }

  async graphGet(path, accept = "application/json") {
    const response = await this.fetchImpl(`${GRAPH_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: accept }
    });
    const body = await response.text();
    const requestId = response.headers.get("request-id") ?? response.headers.get("client-request-id") ?? undefined;
    if (!response.ok) {
      const graphError = parseGraphError(body);
      throw new GatewayError(graphError.message, {
        status: response.status,
        code: graphError.code,
        requestId
      });
    }
    return accept === "application/json" ? JSON.parse(body) : body;
  }

  resolveMeeting(organizerUserId, joinUrl) {
    assertOrganizerUserId(organizerUserId);
    assertTeamsJoinUrl(joinUrl);
    const filter = `JoinWebUrl eq '${joinUrl.replaceAll("'", "''")}'`;
    const query = new URLSearchParams({ "$filter": filter });
    return this.graphGet(`/users/${encodeURIComponent(organizerUserId)}/onlineMeetings?${query}`);
  }

  listTranscripts(organizerUserId, meetingId) {
    assertOrganizerUserId(organizerUserId);
    if (!meetingId) throw new GatewayError("meetingId is required.", { status: 400, code: "MEETING_ID_REQUIRED" });
    return this.graphGet(`/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`);
  }

  getTranscriptVtt(organizerUserId, meetingId, transcriptId) {
    assertOrganizerUserId(organizerUserId);
    if (!meetingId || !transcriptId) {
      throw new GatewayError("meetingId and transcriptId are required.", { status: 400, code: "TRANSCRIPT_PATH_INVALID" });
    }
    return this.graphGet(
      `/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`,
      "text/vtt"
    );
  }
}
