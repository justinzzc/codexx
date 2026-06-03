#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline/promises");

const {
  buildResumeCommand,
  defaultCodexHome,
  findSessions,
  formatSession,
  loadSessionIndex,
} = require("../src/session-store");

function printUsage() {
  console.log(`Usage:
  codexx resume [options]

Options:
  --cwd <path>                Directory to match. Defaults to the current directory.
  --provider <name>           Optional provider filter.
  --latest                    Resume the most recently updated matching session.
  --dry-run                   Print the codex command instead of running it.
  --no-provider-override      Do not pass the session provider to codex.
  --codex-command <command>   Codex executable to invoke. Defaults to codex.
  --codex-home <path>         Codex home. Defaults to CODEX_HOME or ~/.codex.
  -h, --help                  Show this help.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    cwd: process.cwd(),
    provider: "",
    latest: false,
    dryRun: false,
    noProviderOverride: false,
    codexCommand: "codex",
    codexHome: defaultCodexHome(),
    help: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--latest") {
      options.latest = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-provider-override") {
      options.noProviderOverride = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--cwd" || arg === "--provider" || arg === "--codex-command" || arg === "--codex-home") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === "--cwd") {
        options.cwd = value;
      } else if (arg === "--provider") {
        options.provider = value;
      } else if (arg === "--codex-command") {
        options.codexCommand = value;
      } else {
        options.codexHome = value;
      }
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function chooseSession(sessions) {
  for (const [index, session] of sessions.entries()) {
    console.log(formatSession(index + 1, session));
  }
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question("Select session number: ");
    const selectedIndex = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > sessions.length) {
      return null;
    }
    return sessions[selectedIndex - 1];
  } finally {
    rl.close();
  }
}

function commandToString(command) {
  return command.map((part) => {
    if (!/[ \t"]/.test(part)) {
      return part;
    }
    return `"${part.replaceAll('"', '\\"')}"`;
  }).join(" ");
}

async function resume(options) {
  const codexHome = path.resolve(options.codexHome);
  const sessionIndex = await loadSessionIndex(codexHome);
  const sessions = await findSessions({
    codexHome,
    cwd: options.cwd,
    sessionIndex,
    provider: options.provider,
  });

  if (sessions.length === 0) {
    console.error(`No Codex sessions found for cwd: ${options.cwd}`);
    return 1;
  }

  const session = options.latest ? sessions[0] : await chooseSession(sessions);
  if (!session) {
    console.error("No session selected.");
    return 1;
  }

  const command = buildResumeCommand({
    sessionId: session.id,
    provider: session.provider,
    codexCommand: options.codexCommand,
    useSessionProvider: !options.noProviderOverride,
  });

  if (options.dryRun) {
    console.log(commandToString(command));
    return 0;
  }

  return await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printUsage();
    return 1;
  }

  if (options.help || !options.command) {
    printUsage();
    return 0;
  }
  if (options.command !== "resume") {
    console.error(`Unknown command: ${options.command}`);
    printUsage();
    return 1;
  }

  return await resume(options);
}

main().then((code) => {
  process.exitCode = code;
});
