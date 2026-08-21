#!/usr/bin/env node

/**
 * test-graph-app-auth.js
 * 
 * Verifies Microsoft Graph authentication and tests meeting resolution & transcript lookup.
 * Supports multiple auth methods:
 *   1. Azure CLI (`az account get-access-token`)
 *   2. Client Secret (Client Credentials)
 *   3. Pre-existing Bearer token (ECL_GRAPH_ACCESS_TOKEN)
 * 
 * Usage:
 *   node scripts/test-graph-app-auth.js [organizerEmail] [joinUrl]
 */

const { execSync } = require('child_process');

let clientId = process.env.ECL_ENTRA_CLIENT_ID;
let tenantId = process.env.ECL_ENTRA_TENANT_ID;
const clientSecret = process.env.ECL_ENTRA_CLIENT_SECRET;
let rawToken = process.env.ECL_GRAPH_ACCESS_TOKEN;

const organizerEmail = process.argv[2];
const joinUrl = process.argv[3];

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

async function getAccessToken() {
  // 1. Direct environment variable token
  if (rawToken && !rawToken.startsWith("${")) {
    console.log(`   ${green("→")} Using token from ${yellow("ECL_GRAPH_ACCESS_TOKEN")}`);
    return rawToken;
  }

  // 2. Client Secret / Client Credentials Flow
  if (clientId && tenantId && clientSecret && !clientId.startsWith("${") && !clientSecret.startsWith("${")) {
    console.log(`   ${green("→")} Acquiring token via Client Secret (Client Credentials)...`);
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default"
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Client credentials error: ${data.error_description || data.error}`);
    }
    return data.access_token;
  }

  // 3. Azure CLI (az account get-access-token)
  console.log(`   ${green("→")} Attempting to acquire token from Azure CLI (${yellow("az account get-access-token")})...`);
  try {
    const cmd = tenantId && !tenantId.startsWith("${")
      ? `az account get-access-token --resource-type ms-graph --tenant "${tenantId}" -o json`
      : `az account get-access-token --resource-type ms-graph -o json`;
    const azOut = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const parsed = JSON.parse(azOut);
    console.log(`   ${green("✅ Acquired token from Azure CLI!")}`);
    return parsed.accessToken;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(
      `Could not get token from Azure CLI. (Run 'az login' first)\nDetails: ${stderr.trim()}`
    );
  }
}

async function main() {
  console.log(`\n${bold("═══════════════════════════════════════════════════")}`);
  console.log(`  ${bold("Microsoft Graph Authentication & Meeting Test")}`);
  console.log(`${bold("═══════════════════════════════════════════════════")}\n`);

  console.log(`1. Authenticating to Microsoft Graph...`);
  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.log(`\n${red("❌ Authentication Failed:")}\n${err.message}\n`);
    console.log(`Tips:`);
    console.log(`  - Run: ${yellow("az login --tenant fdbf7d02-5b50-453d-a281-271ed6c13a80")}`);
    console.log(`  - Or provide: ${yellow("ECL_ENTRA_CLIENT_SECRET")}\n`);
    process.exit(1);
  }

  console.log(`   ${green("✅ Success! Token acquired.")}`);

  // Test /me or user query
  console.log(`\n2. Verifying Graph connectivity...`);
  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  
  if (profileRes.ok) {
    const profile = await profileRes.json();
    console.log(`   ${green("✅ Connected as User:")} ${profile.displayName} (${profile.userPrincipalName || profile.id})`);
  } else {
    console.log(`   ${yellow("ℹ️  Note:")} Token is an Application / Service Principal token (no /me context).`);
  }

  if (!organizerEmail || !joinUrl) {
    console.log(`\n${yellow("ℹ️  Skipping meeting resolution test (no organizerEmail and joinUrl provided).")}`);
    console.log(`   To test a specific meeting & transcript, pass:`);
    console.log(`   node scripts/test-graph-app-auth.js <organizerEmail> "<joinUrl>"\n`);
    return;
  }

  console.log(`\n3. Resolving meeting for ${yellow(organizerEmail)}...`);
  const filter = `JoinWebUrl eq '${joinUrl.replaceAll("'", "''")}'`;
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/onlineMeetings?$filter=${encodeURIComponent(filter)}`;

  const meetingRes = await fetch(graphUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const meetingData = await meetingRes.json();
  if (!meetingRes.ok) {
    console.log(`\n${red("❌ Graph Meeting API Error:")} ${JSON.stringify(meetingData, null, 2)}\n`);
    process.exit(1);
  }

  const meetings = meetingData.value || [];
  if (meetings.length === 0) {
    console.log(`   ${yellow("⚠️  No online meeting matched the provided JoinUrl.")}`);
    return;
  }

  const meeting = meetings[0];
  console.log(`   ${green("✅ Meeting Found!")} ID: ${meeting.id}, Subject: "${meeting.subject || "No Subject"}"`);

  console.log(`\n4. Checking transcripts for meeting ${yellow(meeting.id)}...`);
  const transcriptUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/onlineMeetings/${encodeURIComponent(meeting.id)}/transcripts`;
  const transcriptRes = await fetch(transcriptUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const transcriptData = await transcriptRes.json();
  if (!transcriptRes.ok) {
    console.log(`\n${red("❌ Transcript API Error:")} ${JSON.stringify(transcriptData, null, 2)}\n`);
    process.exit(1);
  }

  const transcripts = transcriptData.value || [];
  console.log(`   ${green("✅ Transcripts returned:")} ${transcripts.length} transcript(s) found.`);
  transcripts.forEach(t => console.log(`      - Transcript ID: ${t.id} (Created: ${t.createdDateTime})`));
  console.log(`\n${green("🎉 All tests passed successfully!")}\n`);
}

main().catch(err => {
  console.error(`\n${red("Unexpected Error:")}`, err);
  process.exit(1);
});
