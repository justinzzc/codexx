const { mkdir, mkdtemp, readFile, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildResumeCommand,
  findSessions,
  loadSessionIndex,
} = require("../src/session-store");

async function writeSession(root, day, sessionId, cwd, provider, timestamp) {
  const sessionDir = path.join(root, "sessions", "2026", "06", day);
  await mkdir(sessionDir, { recursive: true });
  const safeTimestamp = timestamp.replaceAll(":", "-");
  const sessionPath = path.join(sessionDir, `rollout-${safeTimestamp}-${sessionId}.jsonl`);
  const meta = {
    timestamp,
    type: "session_meta",
    payload: {
      id: sessionId,
      timestamp,
      cwd,
      model_provider: provider,
    },
  };
  await writeFile(sessionPath, `${JSON.stringify(meta)}\n`, "utf8");
  return sessionPath;
}

async function writeSessionWithMessages(root, sessionId, messages) {
  const sessionPath = await writeSession(root, "01", sessionId, "C:\\work\\project", "openai", "2026-06-01T10:00:00Z");
  const lines = messages.map((message) => JSON.stringify({
    timestamp: "2026-06-01T10:01:00Z",
    type: "event_msg",
    payload: {
      type: "user_message",
      message,
    },
  }));
  await writeFile(sessionPath, `${await readFile(sessionPath, "utf8")}${lines.join("\n")}\n`, "utf8");
  return sessionPath;
}

test("findSessions filters by cwd without filtering provider", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codexx-"));
  const cwd = "C:\\work\\project";
  await writeSession(codexHome, "01", "openai-id", cwd, "openai", "2026-06-01T10:00:00Z");
  await writeSession(codexHome, "02", "custom-id", cwd, "custom", "2026-06-02T10:00:00Z");
  await writeSession(codexHome, "03", "other-id", "C:\\work\\other", "openai", "2026-06-03T10:00:00Z");

  const sessions = await findSessions({ codexHome, cwd });

  assert.deepEqual(
    sessions.map((session) => session.id),
    ["custom-id", "openai-id"],
  );
  assert.deepEqual(
    sessions.map((session) => session.provider),
    ["custom", "openai"],
  );
});

test("session index names are added when present", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codexx-"));
  await writeSession(codexHome, "01", "session-id", "C:\\work\\project", "openai", "2026-06-01T10:00:00Z");
  await writeFile(
    path.join(codexHome, "session_index.jsonl"),
    `${JSON.stringify({
      id: "session-id",
      thread_name: "Resume all providers",
      updated_at: "2026-06-01T11:00:00Z",
    })}\n`,
    "utf8",
  );

  const index = await loadSessionIndex(codexHome);
  const sessions = await findSessions({ codexHome, cwd: "C:\\work\\project", sessionIndex: index });

  assert.equal(sessions[0].threadName, "Resume all providers");
  assert.equal(sessions[0].updatedAt, "2026-06-01T11:00:00Z");
});

test("session title falls back to first real user message", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codexx-"));
  await writeSessionWithMessages(codexHome, "session-id", [
    "# AGENTS.md instructions for C:\\work\\project\n<INSTRUCTIONS>...</INSTRUCTIONS>",
    "分析下当前架构，是什么样的，还有业务是怎么串联的",
  ]);

  const sessions = await findSessions({ codexHome, cwd: "C:\\work\\project" });

  assert.equal(sessions[0].threadName, "分析下当前架构，是什么样的，还有业务是怎么串联的");
});

test("buildResumeCommand uses session provider by default", () => {
  const command = buildResumeCommand({ sessionId: "abc-123", provider: "custom", codexCommand: "codex" });

  assert.deepEqual(command, ["codex", "-c", 'model_provider="custom"', "resume", "abc-123"]);
});
