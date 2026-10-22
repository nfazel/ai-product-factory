import fs from "node:fs";
import path from "node:path";

export type PlannedVerificationCommand = {
  command: string;
  applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";
  kind?: "SETUP" | "VALIDATION";
};

export type VerificationCheckKind = "EXISTING_REGRESSION" | "PLAN_CHECK" | "SETUP";
export type VerificationCheckDisposition = "RUN" | "NOT_APPLICABLE" | "UNAVAILABLE";

export type VerificationCheck = {
  command: string;
  kind: VerificationCheckKind;
  disposition: VerificationCheckDisposition;
  reason: string;
};

const NPM_PLACEHOLDER = /no test specified/i;

export function commandUnavailable(output: string, exitCode: number | null) {
  if (exitCode === 127) return true;
  return /missing script|no test specified|command not found|not recognized as an internal or external command|\bENOENT\b/i.test(output);
}

export function sameVerificationCommand(left: string, right: string) {
  return canonicalCommand(left) === canonicalCommand(right);
}

export function detectRepositoryTestCommands(root: string) {
  const found: { command: string; reason: string }[] = [];
  const packagePath = path.join(root, "package.json");
  if (fs.existsSync(packagePath)) {
    const scripts = packageScripts(packagePath);
    for (const [name, script] of Object.entries(scripts)) {
      if (!/^test(?::|$)/.test(name) || NPM_PLACEHOLDER.test(script)) continue;
      found.push({
        command: name === "test" ? "npm test" : `npm run ${name}`,
        reason: `package.json defines scripts.${name}.`,
      });
    }
  }
  if (fs.existsSync(path.join(root, "go.mod"))) {
    found.push({ command: "go test ./...", reason: "go.mod is present." });
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) {
    found.push({ command: "cargo test", reason: "Cargo.toml is present." });
  }
  if (pythonTestsConfigured(root)) {
    found.push({ command: "pytest", reason: "Python test configuration is present." });
  }
  const composer = readJson(path.join(root, "composer.json"));
  if (typeof composer?.scripts?.test === "string" && composer.scripts.test.trim()) {
    found.push({ command: "composer test", reason: "composer.json defines scripts.test." });
  }
  if (fs.existsSync(path.join(root, "pom.xml"))) {
    found.push({ command: "mvn test", reason: "pom.xml is present." });
  }
  if (fs.existsSync(path.join(root, "build.gradle")) || fs.existsSync(path.join(root, "build.gradle.kts"))) {
    found.push({ command: "gradle test", reason: "A Gradle build file is present." });
  }
  return dedupe(found);
}

export function selectVerificationChecks(input: {
  workspacePath: string;
  planned: PlannedVerificationCommand[];
}): VerificationCheck[] {
  const detected = detectRepositoryTestCommands(input.workspacePath);
  const checks: VerificationCheck[] = [];
  const seen = new Set<string>();

  for (const planned of input.planned) {
    const command = planned.command.trim().replace(/\s+/g, " ");
    if (!command) continue;
    const key = canonicalCommand(command);
    if (planned.applicability === "NOT_APPLICABLE") {
      checks.push({
        command,
        kind: "PLAN_CHECK",
        disposition: "NOT_APPLICABLE",
        reason: "The approved implementation plan marks this check not applicable.",
      });
      seen.add(key);
      continue;
    }
    const setup = planned.kind === "SETUP";
    const available = setup ? setupCommandAvailable(command, input.workspacePath) : commandAvailable(command, detected, input.workspacePath);
    checks.push({
      command,
      kind: setup ? "SETUP" : detected.some((item) => sameVerificationCommand(item.command, command)) ? "EXISTING_REGRESSION" : "PLAN_CHECK",
      disposition: available ? "RUN" : "UNAVAILABLE",
      reason: available
        ? setup
          ? "The approved implementation plan uses this setup command."
          : "The approved implementation plan requires this check."
        : "The repository does not provide this command.",
    });
    seen.add(key);
  }

  for (const item of detected) {
    const key = canonicalCommand(item.command);
    if (seen.has(key)) continue;
    checks.push({
      command: item.command,
      kind: "EXISTING_REGRESSION",
      disposition: "RUN",
      reason: item.reason,
    });
    seen.add(key);
  }
  return checks;
}

function commandAvailable(
  command: string,
  detected: { command: string }[],
  root: string,
) {
  if (detected.some((item) => sameVerificationCommand(item.command, command))) return true;
  if (command === "npm test" || command === "npm run test" || /^npm run test:/.test(command)) return false;
  if (command === "npm run build") return scriptExists(root, "build");
  if (command === "npm run lint") return scriptExists(root, "lint");
  if (command === "npm run typecheck") return scriptExists(root, "typecheck");
  if (command === "npx prisma validate" || command === "npx prisma generate") {
    return fs.existsSync(path.join(root, "package.json"));
  }
  return detected.some((item) => item.command === command);
}

function setupCommandAvailable(command: string, root: string) {
  if (command === "npm install") return fs.existsSync(path.join(root, "package.json"));
  if (command === "npx prisma generate") return fs.existsSync(path.join(root, "package.json"));
  return true;
}

function scriptExists(root: string, name: string) {
  return typeof packageScripts(path.join(root, "package.json"))[name] === "string";
}

function packageScripts(packagePath: string) {
  const parsed = readJson(packagePath);
  const scripts = parsed?.scripts;
  if (!scripts || typeof scripts !== "object") return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(scripts).flatMap(([name, script]) => (typeof script === "string" ? [[name, script]] : [])),
  );
}

function pythonTestsConfigured(root: string) {
  if (fs.existsSync(path.join(root, "pytest.ini"))) return true;
  const pyproject = path.join(root, "pyproject.toml");
  if (!fs.existsSync(pyproject)) return false;
  return /pytest/i.test(fs.readFileSync(pyproject, "utf8"));
}

function readJson(filePath: string): { scripts?: Record<string, unknown> } | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { scripts?: Record<string, unknown> };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalCommand(command: string) {
  const trimmed = command.trim().replace(/\s+/g, " ");
  return trimmed === "npm run test" ? "npm test" : trimmed;
}

function dedupe(commands: { command: string; reason: string }[]) {
  const seen = new Set<string>();
  return commands.filter((item) => {
    const key = canonicalCommand(item.command);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
