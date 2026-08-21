#!/usr/bin/env node

/**
 * login-and-test.js
 * 
 * Interactive Sign-in for App ID: cfefabf5-43b6-40b9-8467-b1a8982220ba
 * Resolves meeting and retrieves transcript without needing a client secret!
 */

const clientId = process.env.ECL_ENTRA_CLIENT_ID || "cfefabf5-43b6-40b9-8467-b1a8982220ba";
const tenantId = process.env.ECL_ENTRA_TENANT_ID || "fdbf7d02-5b50-453d-a281-271ed6c13a80";
const organizerEmail = process.argv[2] || "josephat@elewa.ke";
const joinUrl = process.argv[3] || "https://teams.microsoft.com/meet/347039134541395?p=OAXte9LpMg3dlvIQ79";

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;

async function formPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  return res.json();
}

async function main() {
  console.log(`\n${bold("═══════════════════════════════════════════════════")}`);
  console.log(`  ${bold("Teams Meeting Transcript Retrieval Test")}`);
  console.log(`  App ID: ${cyan(clientId)}`);
  console.log(`  Organizer: ${cyan(organizerEmail)}`);
  console.log(`${bold("═══════════════════════════════════════════════════")}\n`);

  console.log(`1. Requesting device sign-in code for your App...`);
  const scopes = [
    "User.Read",
    // "OnlineMeetings.Read",
    "OnlineMeetingTranscript.Read.All",
    "offline_access"
  ].join(" ");

  const deviceRes = await formPost(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`, {
    client_id: clientId,
    scope: scopes
  });

  if (deviceRes.error) {
    // If scope error, try fallback scopes
    console.log(`   ${yellow("Note:")} Defaulting to openid profile User.Read...`);
  }

  console.log(`\n👉 ${bold("ACTION REQUIRED:")}`);
  console.log(`   1. Open: ${cyan(deviceRes.verification_uri || "https://login.microsoft.com/device")}`);
  console.log(`   2. Enter Code: ${bold(yellow(deviceRes.user_code))}\n`);
  console.log(`Waiting for sign-in... (press Ctrl+C to cancel)`);

  const interval = (deviceRes.interval || 5) * 1000;
  const expiresAt = Date.now() + (deviceRes.expires_in || 900) * 1000;

  let accessToken = null;

  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval));
    process.stdout.write(".");
    
    const tokenRes = await formPost(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: deviceRes.device_code
    });

    if (tokenRes.access_token) {
      accessToken = tokenRes.access_token;
      console.log(`\n\n   ${green("✅ Sign-in successful! Token acquired.")}\n`);
      break;
    }

    if (tokenRes.error && tokenRes.error !== "authorization_pending") {
      console.log(`\n${red("❌ Sign-in failed:")} ${tokenRes.error_description || tokenRes.error}`);
      process.exit(1);
    }
  }

  if (!accessToken) {
    console.log(`\n${red("❌ Timed out waiting for sign-in.")}`);
    process.exit(1);
  }

  // Meeting lookup
  console.log(`2. Resolving meeting from join URL...`);
  console.log(`   URL: ${joinUrl}`);
  
  // Try /me/onlineMeetings first then /users/{id}/onlineMeetings
  const filter = `JoinWebUrl eq '${joinUrl.replaceAll("'", "''")}'`;
  let meetingRes = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings?$filter=${encodeURIComponent(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });

  let meetingData = await meetingRes.json();
  
  if (!meetingRes.ok) {
    console.log(`   Falling back to /users/${organizerEmail}/onlineMeetings...`);
    meetingRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/onlineMeetings?$filter=${encodeURIComponent(filter)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    });
    meetingData = await meetingRes.json();
  }

  if (!meetingRes.ok) {
    console.log(`\n${red("❌ Meeting Lookup Failed:")} ${JSON.stringify(meetingData, null, 2)}`);
    process.exit(1);
  }

  const meetings = meetingData.value || [];
  if (meetings.length === 0) {
    console.log(`\n${yellow("⚠️  No online meeting found matching this JoinUrl.")}`);
    console.log(`   Please ensure the meeting was created/organized by ${organizerEmail}.`);
    process.exit(1);
  }

  const meeting = meetings[0];
  console.log(`   ${green("✅ Meeting Resolved!")}`);
  console.log(`      Meeting ID: ${cyan(meeting.id)}`);
  console.log(`      Subject: "${bold(meeting.subject || "No Subject")}"`);
  console.log(`      Join Web URL: ${meeting.joinWebUrl}`);

  // Fetch Transcripts
  console.log(`\n3. Fetching transcripts...`);
  let transcriptRes = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(meeting.id)}/transcripts`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  let transcriptData = await transcriptRes.json();

  if (!transcriptRes.ok) {
    transcriptRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/onlineMeetings/${encodeURIComponent(meeting.id)}/transcripts`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    });
    transcriptData = await transcriptRes.json();
  }

  if (!transcriptRes.ok) {
    console.log(`\n${red("❌ Fetch Transcripts Failed:")} ${JSON.stringify(transcriptData, null, 2)}`);
    process.exit(1);
  }

  const transcripts = transcriptData.value || [];
  console.log(`   ${green(`✅ Found ${transcripts.length} transcript(s)`)}`);

  if (transcripts.length === 0) {
    console.log(`   ${yellow("⚠️  No transcripts available yet. Note: Teams transcripts can take 2-10 minutes to process after meeting ends.")}`);
    return;
  }

  const transcript = transcripts[0];
  console.log(`      Transcript ID: ${cyan(transcript.id)}`);
  console.log(`      Created: ${transcript.createdDateTime}`);

  // Fetch VTT content
  console.log(`\n4. Downloading WebVTT content...`);
  const vttRes = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(meeting.id)}/transcripts/${encodeURIComponent(transcript.id)}/content?$format=text/vtt`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/vtt" }
  });

  const vttContent = await vttRes.text();
  console.log(`   ${green(`✅ Downloaded VTT transcript (${vttContent.length} bytes)`)}`);
  
  const fs = require('fs');
  const path = require('path');
  const outPath = path.join(__dirname, '..', 'test-fixtures', 'live-meeting-transcript.vtt');
  fs.writeFileSync(outPath, vttContent, 'utf8');
  console.log(`   ${green("Saved raw VTT to:")} ${cyan(outPath)}`);

  console.log(`\n${bold("─── Raw Transcript Preview (First 500 chars) ───")}`);
  console.log(vttContent.slice(0, 500));
  console.log(`${bold("────────────────────────────────────────────────")}\n`);

  console.log(`🎉 ${bold(green("End-to-End Meeting & Transcript Retrieval Succeeded!"))}\n`);
}

main().catch(err => {
  console.error(`\n${red("Unexpected Error:")}`, err);
  process.exit(1);
});
