#!/usr/bin/env node

/**
 * fetch-transcript-hybrid.js
 *
 * HYBRID AUTH STRATEGY (Option B):
 *
 *   DEV MODE  (no ECL_ENTRA_CLIENT_SECRET set):
 *     → Single Device Code sign-in with ALL required delegated scopes:
 *         User.Read  +  OnlineMeetings.Read  +  OnlineMeetingTranscript.Read.All
 *     → One token used for both meeting resolution AND transcript retrieval.
 *     → Requires "OnlineMeetings.Read" Delegated permission on the app registration.
 *
 *   PROD MODE (ECL_ENTRA_CLIENT_SECRET set):
 *     → Step 1: App token via Client Credentials (OnlineMeetings.Read.All — Application)
 *               Used to resolve the meeting by JoinUrl.
 *     → Step 2: User token via Device Code (OnlineMeetingTranscript.Read.All — Delegated)
 *               Used to fetch transcripts (Microsoft does NOT offer this as Application).
 *
 * WHY TWO MODES?
 *   Azure CLI produces a delegated user token, NOT an application token.
 *   Delegated tokens cannot use Application-only permissions like OnlineMeetings.Read.All.
 *   So in dev we lean fully delegated; in prod the app token is a true service-principal token.
 *
 * Usage:
 *   node scripts/fetch-transcript-hybrid.js [organizerEmail] [joinUrl]
 *
 * Env vars:
 *   ECL_ENTRA_CLIENT_ID      — App (client) ID
 *   ECL_ENTRA_TENANT_ID      — Tenant ID
 *   ECL_ENTRA_CLIENT_SECRET  — Client secret (prod only; omit for dev mode)
 *
 * Azure Portal — required delegated permissions for dev mode:
 *   Microsoft Graph → Delegated:
 *     • User.Read
 *     • OnlineMeetings.Read              ← ADD THIS for dev mode
 *     • OnlineMeetingTranscript.Read.All
 */

const clientId     = process.env.ECL_ENTRA_CLIENT_ID     || "cfefabf5-43b6-40b9-8467-b1a8982220ba";
const tenantId     = process.env.ECL_ENTRA_TENANT_ID     || "fdbf7d02-5b50-453d-a281-271ed6c13a80";
const clientSecret = process.env.ECL_ENTRA_CLIENT_SECRET || "";

const organizerEmail = process.argv[2] || "josephat@elewa.ke";
const joinUrl        = process.argv[3] || "https://teams.microsoft.com/meet/347039134541395?p=OAXte9LpMg3dlvIQ79";

const IS_DEV = !clientSecret;

const green  = s => `\x1b[32m${s}\x1b[0m`;
const red    = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const cyan   = s => `\x1b[36m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function formPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  return res.json();
}

async function graphGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ── DEV: Single Device Code flow with all delegated scopes ───────────────────
// One sign-in, one token — used for both meeting resolution and transcripts.
// Requires OnlineMeetings.Read (Delegated) on the app registration.
async function getDevToken() {
  const scopes = [
    "User.Read",
    "OnlineMeetings.Read",           // Needed to resolve meeting by JoinUrl
    "OnlineMeetingTranscript.Read.All",
    "offline_access"
  ].join(" ");

  const deviceRes = await formPost(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    { client_id: clientId, scope: scopes }
  );

  if (deviceRes.error) {
    throw new Error(`Device code request failed: ${deviceRes.error_description || deviceRes.error}`);
  }

  console.log(`\n   👉 ${bold("ACTION REQUIRED — Sign in as the meeting organizer:")}`);
  console.log(`      1. Open : ${cyan(deviceRes.verification_uri)}`);
  console.log(`      2. Code : ${bold(yellow(deviceRes.user_code))}\n`);
  console.log(`   Waiting for sign-in... (Ctrl+C to cancel)`);

  const interval  = (deviceRes.interval  || 5) * 1000;
  const expiresAt = Date.now() + (deviceRes.expires_in || 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval));
    process.stdout.write(".");

    const tokenRes = await formPost(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        grant_type:  "urn:ietf:params:oauth:grant-type:device_code",
        client_id:   clientId,
        device_code: deviceRes.device_code
      }
    );

    if (tokenRes.access_token) {
      console.log(`\n\n   ${green("✅ Signed in! User token acquired.")}\n`);
      return tokenRes.access_token;
    }

    if (tokenRes.error && tokenRes.error !== "authorization_pending") {
      throw new Error(`Device code sign-in failed: ${tokenRes.error_description || tokenRes.error}`);
    }
  }

  throw new Error("Timed out waiting for device code sign-in.");
}

// ── PROD: App token via Client Credentials ────────────────────────────────────
// True service-principal token — uses OnlineMeetings.Read.All (Application).
async function getAppToken() {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const data = await formPost(tokenUrl, {
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         "https://graph.microsoft.com/.default"
  });
  if (!data.access_token) {
    throw new Error(`Client credentials error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

// ── PROD: User token via Device Code (transcripts only) ───────────────────────
async function getProdUserToken() {
  const scopes = [
    "User.Read",
    "OnlineMeetingTranscript.Read.All",
    "offline_access"
  ].join(" ");

  const deviceRes = await formPost(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    { client_id: clientId, scope: scopes }
  );

  if (deviceRes.error) {
    throw new Error(`Device code request failed: ${deviceRes.error_description || deviceRes.error}`);
  }

  console.log(`\n   👉 ${bold("ACTION REQUIRED — Sign in for transcript access:")}`);
  console.log(`      1. Open : ${cyan(deviceRes.verification_uri)}`);
  console.log(`      2. Code : ${bold(yellow(deviceRes.user_code))}\n`);
  console.log(`   Waiting for sign-in... (Ctrl+C to cancel)`);

  const interval  = (deviceRes.interval  || 5) * 1000;
  const expiresAt = Date.now() + (deviceRes.expires_in || 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval));
    process.stdout.write(".");

    const tokenRes = await formPost(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        grant_type:  "urn:ietf:params:oauth:grant-type:device_code",
        client_id:   clientId,
        device_code: deviceRes.device_code
      }
    );

    if (tokenRes.access_token) {
      console.log(`\n\n   ${green("✅ Signed in! Delegated token acquired.")}\n`);
      return tokenRes.access_token;
    }

    if (tokenRes.error && tokenRes.error !== "authorization_pending") {
      throw new Error(`Device code sign-in failed: ${tokenRes.error_description || tokenRes.error}`);
    }
  }

  throw new Error("Timed out waiting for device code sign-in.");
}

// ── Resolve Meeting ────────────────────────────────────────────────────────────
async function resolveMeeting(token, email, url) {
  const filter   = `JoinWebUrl eq '${url.replaceAll("'", "''")}'`;
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/onlineMeetings?$filter=${encodeURIComponent(filter)}`;

  const { ok, data } = await graphGet(graphUrl, token);

  if (!ok) {
    throw new Error(
      `Meeting resolution failed (${data.error?.code}):\n  ${data.error?.message}`
    );
  }

  const meetings = data.value || [];
  if (meetings.length === 0) {
    throw new Error(
      `No online meeting matched the JoinUrl for organizer ${email}.\n` +
      `  Ensure the meeting was created by this user and the URL is correct.`
    );
  }

  return meetings[0];
}

// ── Fetch Transcripts ─────────────────────────────────────────────────────────
async function fetchTranscripts(token, email, meetingId) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;
  const { ok, data } = await graphGet(url, token);

  if (!ok) {
    throw new Error(
      `Transcript fetch failed (${data.error?.code}):\n  ${data.error?.message}`
    );
  }

  return data.value || [];
}

// ── Download VTT ──────────────────────────────────────────────────────────────
async function downloadVtt(token, email, meetingId, transcriptId) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/vtt" }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VTT download failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }

  return res.text();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const modeLabel = IS_DEV
    ? `${yellow("DEV")}  — single delegated token (Device Code)`
    : `${green("PROD")} — app token (Client Credentials) + user token (Device Code)`;

  console.log(`\n${bold("═══════════════════════════════════════════════════════")}`);
  console.log(`  ${bold("Hybrid Auth: Meeting Resolution + Transcript Retrieval")}`);
  console.log(`  Mode      : ${modeLabel}`);
  console.log(`${bold("═══════════════════════════════════════════════════════")}\n`);
  console.log(`  Organizer : ${cyan(organizerEmail)}`);
  console.log(`  Join URL  : ${cyan(joinUrl)}\n`);

  let appToken, userToken;

  if (IS_DEV) {
    // ── DEV: One sign-in, one token for everything ──────────────────────────
    console.log(`${bold("Step 1")} — Sign in once (covers meeting resolution + transcript access)...`);
    console.log(`   ${dim("Scopes: User.Read  OnlineMeetings.Read  OnlineMeetingTranscript.Read.All")}`);
    try {
      userToken = await getDevToken();
      appToken  = userToken; // same token used for both
    } catch (err) {
      console.log(`\n${red("❌ Sign-in Error:")} ${err.message}\n`);
      process.exit(1);
    }
  } else {
    // ── PROD: App token for meeting, user token for transcripts ─────────────
    console.log(`${bold("Step 1")} — Acquiring App Token (Client Credentials)...`);
    console.log(`   ${dim("→ Using Client Credentials (ECL_ENTRA_CLIENT_SECRET)")}`);
    try {
      appToken = await getAppToken();
      console.log(`   ${green("✅ App token acquired.")} ${dim("(OnlineMeetings.Read.All — Application)")}\n`);
    } catch (err) {
      console.log(`\n${red("❌ App Token Error:")} ${err.message}\n`);
      process.exit(1);
    }

    console.log(`${bold("Step 1b")} — Acquiring User Token (Device Code — for transcripts)...`);
    console.log(`   ${dim("Required for OnlineMeetingTranscript.Read.All — Delegated only")}`);
    try {
      userToken = await getProdUserToken();
    } catch (err) {
      console.log(`\n${red("❌ User Token Error:")} ${err.message}\n`);
      process.exit(1);
    }
  }

  // ── Step 2: Resolve Meeting ─────────────────────────────────────────────────
  const stepNum = IS_DEV ? "Step 2" : "Step 2";
  console.log(`${bold(stepNum)} — Resolving meeting...`);
  let meeting;
  try {
    meeting = await resolveMeeting(appToken, organizerEmail, joinUrl);
    console.log(`   ${green("✅ Meeting resolved!")}`);
    console.log(`      Meeting ID : ${cyan(meeting.id)}`);
    console.log(`      Subject    : "${bold(meeting.subject || "No Subject")}"`);
    console.log(`      Join URL   : ${dim(meeting.joinWebUrl)}\n`);
  } catch (err) {
    console.log(`\n${red("❌ Meeting Resolution Error:")} ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 3: Fetch Transcripts ───────────────────────────────────────────────
  console.log(`${bold("Step 3")} — Fetching transcripts...`);
  let transcripts;
  try {
    transcripts = await fetchTranscripts(userToken, organizerEmail, meeting.id);
    console.log(`   ${green(`✅ Found ${transcripts.length} transcript(s)`)}\n`);
  } catch (err) {
    console.log(`\n${red("❌ Transcript Fetch Error:")} ${err.message}\n`);
    process.exit(1);
  }

  if (transcripts.length === 0) {
    console.log(`   ${yellow("⚠️  No transcripts available yet.")}`);
    console.log(`   ${dim("Teams transcripts can take 2–10 minutes to process after a meeting ends.")}\n`);
    return;
  }

  transcripts.forEach((t, i) => {
    console.log(`   ${i + 1}. Transcript ID : ${cyan(t.id)}`);
    console.log(`      Created       : ${t.createdDateTime}`);
  });

  // ── Step 4: Download VTT ────────────────────────────────────────────────────
  const transcript = transcripts[0];
  console.log(`\n${bold("Step 4")} — Downloading VTT for transcript ${cyan(transcript.id)}...`);

  let vttContent;
  try {
    vttContent = await downloadVtt(userToken, organizerEmail, meeting.id, transcript.id);
    console.log(`   ${green(`✅ Downloaded (${vttContent.length} bytes)`)}\n`);
  } catch (err) {
    console.log(`\n${red("❌ VTT Download Error:")} ${err.message}\n`);
    process.exit(1);
  }

  const fs   = require("fs");
  const path = require("path");
  const outPath = path.join(__dirname, "..", "test-fixtures", "live-meeting-transcript.vtt");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, vttContent, "utf8");
  console.log(`   ${green("Saved to:")} ${cyan(outPath)}`);

  console.log(`\n${bold("─── VTT Preview (first 600 chars) ───────────────────────")}`);
  console.log(vttContent.slice(0, 600));
  console.log(`${bold("─────────────────────────────────────────────────────────")}\n`);

  console.log(`🎉 ${bold(green("Hybrid auth end-to-end succeeded!"))}\n`);
}

main().catch(err => {
  console.error(`\n${red("Unexpected Error:")}`, err);
  process.exit(1);
});
