#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const artifactDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../generated/ECL-MS-02");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(artifactDirectory, name), "utf8"));
}

const flow = readJson("flow-definition.json");
const deployment = readJson("deployment-settings.template.json");
const manifest = readJson("artifact-manifest.json");
const definition = flow.properties?.definition;

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(flow.properties?.state === "Stopped", "Generated flow must be disabled by default.");
check(definition?.triggers?.When_an_item_is_created_or_modified, "SharePoint trigger is missing.");
check(definition?.actions?.Try, "Try scope is missing.");
check(definition?.actions?.Catch, "Catch scope is missing.");
check(definition?.actions?.Catch?.runAfter?.Try?.includes("Failed"), "Catch must run after Try failure.");

const serialized = JSON.stringify(flow);
for (const expected of [
  "ecl_shared_sharepointonline",
  "ecl_shared_graphgateway",
  "ResolveMeeting",
  "ListTranscripts",
  "GetTranscriptContent",
  "TranscriptUnavailable",
  "TRANSCRIPT_FLOW_FAILED"
]) {
  check(serialized.includes(expected), `Missing required contract value: ${expected}`);
}

check(!/client[_-]?secret|access[_-]?token|x-functions-key/i.test(serialized), "Flow contains a secret-like field.");
check(
  deployment.ConnectionReferences?.every((entry) => entry.ConnectionId.startsWith("REPLACE_WITH_")),
  "Deployment settings must not contain live connection IDs."
);
check(manifest.status === "implemented-draft-awaiting-graph-gateway", "Artifact status is misleading.");

if (failures.length) {
  console.error(`Generated Flow 02 validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Generated Flow 02 artifact validation passed.");
