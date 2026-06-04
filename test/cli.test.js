const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const packageJson = require("../package.json");

function runCodexx(args) {
  return spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "codexx.js"), ...args], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
}

test("--version prints package version", () => {
  const result = runCodexx(["--version"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), packageJson.version);
  assert.equal(result.stderr.trim(), "");
});

test("-v prints package version", () => {
  const result = runCodexx(["-v"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), packageJson.version);
  assert.equal(result.stderr.trim(), "");
});
