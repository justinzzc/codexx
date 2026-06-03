const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline");

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function normalizePath(inputPath) {
  const text = String(inputPath || "").trim().replace(/^"|"$/g, "");
  return path.resolve(text).replace(/[\\\/]+$/, "").toLowerCase();
}

async function loadSessionIndex(codexHome) {
  const indexPath = path.join(codexHome, "session_index.jsonl");
  const entries = new Map();
  let content;

  try {
    content = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return entries;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const record = JSON.parse(line);
      if (record.id) {
        entries.set(record.id, record);
      }
    } catch {
      // Ignore malformed index lines so one bad record does not hide valid sessions.
    }
  }

  return entries;
}

function textFromResponseItemMessage(payload) {
  if (payload.type !== "message" || payload.role !== "user") {
    return "";
  }
  return (payload.content || [])
    .map((item) => item.text || "")
    .join(" ");
}

function textFromEventMessage(payload) {
  if (payload.type !== "user_message") {
    return "";
  }
  return payload.message || "";
}

function cleanTitle(message) {
  return String(message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function isSyntheticUserMessage(message) {
  const text = String(message || "").trim();
  return (
    !text ||
    text.startsWith("# AGENTS.md instructions") ||
    text.startsWith("<environment_context>") ||
    text.startsWith("<skill>") ||
    text.startsWith("<skills_instructions>") ||
    text.startsWith("<plugins_instructions>") ||
    text.startsWith("<turn_aborted>")
  );
}

function extractUserMessage(record) {
  const payload = record.payload || {};
  if (record.type === "event_msg") {
    return textFromEventMessage(payload);
  }
  if (record.type === "response_item") {
    return textFromResponseItemMessage(payload);
  }
  return "";
}

async function readSessionMeta(sessionPath) {
  let session = null;
  let inspectedMessages = 0;

  try {
    const lines = readline.createInterface({
      input: createReadStream(sessionPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (!line) {
        continue;
      }

      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      if (!session && record.type === "session_meta") {
        const payload = record.payload || {};
        if (!payload.id || !payload.cwd) {
          return null;
        }
        session = {
          id: payload.id,
          cwd: payload.cwd,
          provider: payload.model_provider || "",
          timestamp: payload.timestamp || record.timestamp || "",
          path: sessionPath,
          threadName: "",
          updatedAt: "",
        };
        continue;
      }

      if (!session) {
        continue;
      }

      const userMessage = extractUserMessage(record);
      if (!userMessage) {
        continue;
      }
      inspectedMessages += 1;
      if (!isSyntheticUserMessage(userMessage)) {
        session.threadName = cleanTitle(userMessage);
        break;
      }
      if (inspectedMessages >= 12) {
        break;
      }
    }

    return session;
  } catch {
    return null;
  }
}

async function collectSessionFiles(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSessionFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
}

async function findSessions({ codexHome, cwd, sessionIndex = new Map(), provider = "" }) {
  const targetCwd = normalizePath(cwd);
  const files = await collectSessionFiles(path.join(codexHome, "sessions"));
  const sessions = [];

  for (const file of files) {
    const session = await readSessionMeta(file);
    if (!session) {
      continue;
    }
    if (normalizePath(session.cwd) !== targetCwd) {
      continue;
    }
    if (provider && session.provider !== provider) {
      continue;
    }

    const indexed = sessionIndex.get(session.id) || {};
    sessions.push({
      ...session,
      threadName: indexed.thread_name || session.threadName || "",
      updatedAt: indexed.updated_at || "",
    });
  }

  return sessions.sort((left, right) => {
    const leftTime = left.updatedAt || left.timestamp;
    const rightTime = right.updatedAt || right.timestamp;
    return rightTime.localeCompare(leftTime);
  });
}

function buildResumeCommand({
  sessionId,
  provider,
  codexCommand = "codex",
  useSessionProvider = true,
}) {
  const command = [codexCommand];
  if (useSessionProvider && provider) {
    command.push("-c", `model_provider="${provider}"`);
  }
  command.push("resume", sessionId);
  return command;
}

function buildNativeResumeCommand({
  provider,
  codexCommand = "codex",
}) {
  const command = [codexCommand];
  if (provider && provider !== "unknown") {
    command.push("-c", `model_provider="${provider}"`);
  }
  command.push("resume");
  return command;
}

function groupProviders(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const provider = session.provider || "unknown";
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.provider.localeCompare(right.provider);
    });
}

function formatSession(index, session) {
  const provider = session.provider || "unknown";
  const title = session.threadName || "(untitled)";
  const when = session.updatedAt || session.timestamp;
  return `${String(index).padStart(2, " ")}. ${when}  [${provider}]  ${title}  ${session.id}`;
}

module.exports = {
  buildNativeResumeCommand,
  buildResumeCommand,
  defaultCodexHome,
  findSessions,
  formatSession,
  groupProviders,
  loadSessionIndex,
  normalizePath,
};
