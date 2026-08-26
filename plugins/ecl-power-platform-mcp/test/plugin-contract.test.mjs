import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pluginRoot = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, pluginRoot), "utf8"));
}

test("plugin manifest exposes the MCP configuration", async () => {
  const manifest = await readJson(".codex-plugin/plugin.json");

  assert.equal(manifest.name, "ecl-power-platform-mcp");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.match(manifest.version, /^0\.2\.0(?:\+codex\.[A-Za-z0-9._-]+)?$/);
});

test("MCP server uses the reviewed upstream release", async () => {
  const configuration = await readJson(".mcp.json");
  const server = configuration.mcpServers?.["powerautomate-mcp"];

  assert.equal(server?.command, "npx");
  assert.deepEqual(server?.args, ["-y", "powerautomate-mcp@0.16.12"]);
  assert.equal(server?.env, undefined, "credentials must not be committed in the plugin config");
});

test("lifecycle scripts stay pinned to the MCP release", async () => {
  const packageJson = await readJson("package.json");
  const lifecycleScripts = ["setup", "doctor", "validate", "version:upstream"];

  for (const name of lifecycleScripts) {
    assert.match(packageJson.scripts[name], /powerautomate-mcp@0\.16\.12/);
    assert.doesNotMatch(packageJson.scripts[name], /@latest/);
  }
});
