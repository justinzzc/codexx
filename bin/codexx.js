#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline/promises");
const packageJson = require("../package.json");

const {
  buildNativeResumeCommand,
  buildResumeCommand,
  defaultCodexHome,
  findSessions,
  formatProvider,
  formatResumeScope,
  formatSession,
  groupProviders,
  loadSessionIndex,
} = require("../src/session-store");

function printUsage() {
  console.log(`Usage:
  codexx resume [options]

Options:
  -v, --version               Show codexx version.
  --cwd <path>                Directory to match. Defaults to the current directory.
  --provider <name>           Optional provider filter.
  --include-subagents         Include subagent/helper threads. Hidden by default.
  --native                    Select a provider, then enter Codex's native resume picker.
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
    version: command === "-v" || command === "--version",
    cwd: process.cwd(),
    provider: "",
    includeSubagents: false,
    native: false,
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
    } else if (arg === "--native") {
      options.native = true;
    } else if (arg === "--include-subagents") {
      options.includeSubagents = true;
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

async function chooseSession(sessions, cwd) {
  console.log(formatResumeScope(cwd, sessions));
  console.log("");
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

async function chooseProvider(providers, cwd, sessions) {
  console.log(formatResumeScope(cwd, sessions));
  console.log("");
  for (const [index, provider] of providers.entries()) {
    console.log(formatProvider(index + 1, provider));
  }
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question("Select provider number: ");
    const selectedIndex = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > providers.length) {
      return null;
    }
    return providers[selectedIndex - 1];
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
    includeSubagents: options.includeSubagents,
  });

  if (sessions.length === 0) {
    console.error(`No Codex sessions found for cwd: ${options.cwd}`);
    return 1;
  }

  if (options.native) {
    const providers = groupProviders(sessions);
    const selectedProvider = options.provider
      ? providers.find((provider) => provider.provider === options.provider)
      : await chooseProvider(providers, options.cwd, sessions);
    if (!selectedProvider) {
      console.error("No provider selected.");
      return 1;
    }

    const command = buildNativeResumeCommand({
      provider: selectedProvider.provider,
      codexCommand: options.codexCommand,
    });

    if (options.dryRun) {
      console.log(commandToString(command));
      return 0;
    }

    return await runCommand(command);
  }

  const session = options.latest ? sessions[0] : await chooseSession(sessions, options.cwd);
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

  return await runCommand(command);
}

async function runCommand(command) {
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

  if (options.version) {
    console.log(packageJson.version);
    return 0;
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
