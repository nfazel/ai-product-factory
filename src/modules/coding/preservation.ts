import {AuthorityUnavailableError} from '@/modules/verification/authority-status';
import fs from "node:fs";
import ts from "typescript";

import { hashText, isTestFile, resolveInside, weakensChecks } from "@/modules/coding/policy";

export type PreservationIssue = { path: string; reason: string };
export type ProposedFile = { path: string; action: string; content?: string };

// A token stream retains quoted values and strips comments. It never infers
// model identity from product names or accepts model output as approval.
function tokens(source: string) {
  return source.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*|--[^\n]*|[A-Za-z_$][\w$]*|[0-9]+(?:\.[0-9]+)?|[^\s]/g)
    ?.filter(token => !token.startsWith("//") && !token.startsWith("/*") && !token.startsWith("--")) ?? [];
}

/** Prisma adapter: every existing declaration/attribute must remain identical.
 * New declarations are allowed. Unsupported syntax fails closed, not partially.
 */
export function prismaDeclarations(source: string): Map<string, string> | null {
  const list = tokens(source), result = new Map<string, string>();
  let i = 0;
  while (i < list.length) {
    const kind = list[i++], name = list[i++];
    if (!["model", "enum", "type", "view", "datasource", "generator"].includes(kind) || !name || list[i++] !== "{") return null;
    const body: string[] = []; let depth = 1;
    while (i < list.length && depth) {
      const token = list[i++];
      if (token === "{") depth++;
      if (token === "}") depth--;
      if (depth) body.push(token);
    }
    if (depth) return null;
    // Configuration blocks are protected wholesale, including database provider.
    if (kind === "datasource" || kind === "generator") {
      result.set(`${kind} ${name}`, JSON.stringify(body)); continue;
    }
    result.set(`${kind} ${name}`, kind);
    let j = 0;
    while (j < body.length) {
      if (body[j] === "@" && body[j + 1] === "@") {
        const start = j; j += 2;
        if (!body[j++]) return null;
        let level = 0;
        if (body[j] === "(") {
          do { if (body[j] === "(") level++; if (body[j] === ")") level--; j++; } while (j < body.length && level);
          if (level) return null;
        }
        const signature = JSON.stringify(body.slice(start, j));
        result.set(`${kind} ${name} @@${signature}`, signature); continue;
      }
      const field = body[j++];
      if (!/^[A-Za-z_]\w*$/.test(field)) return null;
      const definition: string[] = [];
      if (kind !== "enum") {
        if (!body[j] || !/^[A-Za-z_]\w*$/.test(body[j])) return null;
        definition.push(body[j++]);
        while (body[j] === "?" || body[j] === "[" || body[j] === "]") definition.push(body[j++]);
      }
      while (body[j] === "@" && body[j + 1] !== "@") {
        definition.push(body[j++]);
        if (!body[j]) return null;
        definition.push(body[j++]);
        // @db.VarChar and other native type annotations.
        if (body[j] === ".") { definition.push(body[j++]); definition.push(body[j++]); }
        if (body[j] === "(") {
          let level = 0;
          do { const token = body[j++]; definition.push(token); if (token === "(") level++; if (token === ")") level--; } while (j < body.length && level);
          if (level) return null;
        }
      }
      const key = `${kind} ${name}.${field}`;
      if (result.has(key)) return null;
      result.set(key, JSON.stringify(definition));
    }
  }
  return result;
}

const SOURCE = /\.[cm]?[jt]sx?$/i;
const SECURITY = /auth|session|permission|access.?control|identity|jwt|csrf|jose|oauth|oidc|saml|principal|credential|keycloak|casl|verify.*(?:token|cookie|signature)|cookie.*(?:sign|verify)|require.*(?:user|role|login)|canAccess|isAllowed|bcrypt|argon|passport|clerk|supabase|cognito|firebase/i;

function syntaxInventory(file: string, source: string) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : file.endsWith("js") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const invalid = (tree as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length;
  const exports = new Set<string>(), security = new Set<string>(), assertions = new Map<string, number>();
  const imported = new Map<string, string>();
  const securityBindings = new Set<string>();
  for (const node of tree.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text, clause = node.importClause;
      if (clause?.name) imported.set(clause.name.text, moduleName);
      const binding = clause?.namedBindings;
      if (binding && ts.isNamespaceImport(binding)) imported.set(binding.name.text, moduleName);
      if (binding && ts.isNamedImports(binding)) for (const item of binding.elements) imported.set(item.name.text, moduleName + ":" + (item.propertyName?.text ?? item.name.text));
      if (SECURITY.test(moduleName)) security.add("import:" + moduleName);
    }
  }
  const collectBindings = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && SECURITY.test(node.initializer.getText(tree))) securityBindings.add(node.name.getText(tree));
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(tree);
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node)) {
      const condition = tokens(node.expression.getText(tree));
      if (condition.some(token => securityBindings.has(token)) || /(?:status\s*:\s*(?:401|403)|\b(?:unauthorized|forbidden)\b)/i.test(node.thenStatement.getText(tree))) security.add("guard:" + JSON.stringify(tokens(node.getText(tree))));
    }
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exported = modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) {
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) exports.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) exports.add(decl.name.getText(tree));
      if (modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)) exports.add("default");
    }
    if (ts.isExportAssignment(node)) {
      exports.add("default");
      if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) exports.add("callable:default");
    }
    if (ts.isFunctionDeclaration(node) && exported) exports.add("callable:" + (node.name?.text ?? "default"));
    if (ts.isVariableStatement(node) && exported) for (const declaration of node.declarationList.declarations) {
      if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) exports.add("callable:" + declaration.name.getText(tree));
    }
    if (ts.isBinaryExpression(node) && node.left.getText(tree) === "module.exports" && ts.isObjectLiteralExpression(node.right)) {
      for (const property of node.right.properties) if (property.name) exports.add(property.name.getText(tree));
    }
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) exports.add(item.name.text);
      else exports.add("reexport:" + (node.moduleSpecifier?.getText(tree) ?? "*"));
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(tree);
      const root = expression.split(/[.\[]/)[0], origin = imported.get(root) ?? "";
      if (SECURITY.test(expression) || SECURITY.test(origin)) {
        // Preserve arguments as well: swapping a validated session for a raw
        // cookie/token is not compatible merely because the callee still exists.
        security.add("call:" + JSON.stringify(tokens(node.getText(tree))));
        let ancestor: ts.Node | undefined = node.parent;
        const conditions: string[] = [];
        while (ancestor && !ts.isFunctionLike(ancestor)) {
          if (ts.isIfStatement(ancestor) || ts.isWhileStatement(ancestor)) conditions.push(ancestor.expression.getText(tree));
          if (ts.isConditionalExpression(ancestor)) conditions.push(ancestor.condition.getText(tree));
          if (ts.isBinaryExpression(ancestor) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(ancestor.operatorToken.kind)) conditions.push(ancestor.left.getText(tree));
          ancestor = ancestor.parent;
        }
        security.add("call-context:" + expression + ":" + JSON.stringify(conditions.map(value => tokens(value))));
      }
      if (/^(?:expect|assert)(?:\.|$)/.test(expression) || /node:assert|^assert(?:\/|$)/.test(origin)) {
        const signature = JSON.stringify(tokens(node.getText(tree)));
        assertions.set(signature, (assertions.get(signature) ?? 0) + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  // Exported CommonJS modules also form a public interface.
  for (const match of source.matchAll(/\b(?:module\.exports|exports)\.([A-Za-z_$][\w$]*)\s*=/g)) exports.add(match[1]);
  return { exports, security, assertions, invalid: Boolean(invalid) };
}

export function preservationViolations(file: string, before: string | null, after: string | null): string[] {
  if (before === after) return [];
  const issues: string[] = [];
  const weakening = weakensChecks(file, before ?? "", after ?? "");
  if (weakening) issues.push(weakening);
  if (after !== null && /\bignoreBuildErrors\s*:\s*true|["']strict["']\s*:\s*false|["']noEmitOnError["']\s*:\s*false/.test(after)) issues.push("Validation configuration disables required checks.");
  if (/\.prisma$/i.test(file)) {
    const old = prismaDeclarations(before ?? ""), next = prismaDeclarations(after ?? "");
    if (!old || !next) return [...issues, "Cannot safely parse this database schema; schema changes require human review."];
    for (const [key, value] of old) if (next.get(key) !== value) issues.push(`Existing database declaration changed or removed: ${key}.`);
  } else if (/\.sql$/i.test(file)) {
    if (tokens(after ?? "").length || before !== null) issues.push("Database SQL changes require review by a supported preservation adapter.");
  } else if (/(?:^|\/)(?:schema|models?)\.(?![cm]?[jt]sx?$)[^.]+$/i.test(file) && before !== null) {
    issues.push("Unsupported database schema format; cannot establish model preservation.");
  }
  if (before !== null && after === null && (SOURCE.test(file) || isTestFile(file))) issues.push("Existing application source cannot be deleted by autonomous execution.");
  if (SOURCE.test(file) && before !== null) {
    if (/(?:drizzle-orm|typeorm|mongoose|sequelize|mikro-orm|objection)/i.test(before)) issues.push("Unsupported ORM source changed; a schema preservation adapter or human review is required.");
    const old = syntaxInventory(file, before), next = syntaxInventory(file, after ?? "");
    if (old.invalid || next.invalid) issues.push("Cannot establish source preservation because syntax is invalid.");
    for (const name of old.exports) if (!next.exports.has(name)) issues.push(`Existing exported interface removed: ${name}.`);
    for (const signature of old.security) if (!next.security.has(signature)) issues.push("Existing authentication/authorization import or call changed; explicit security review is required.");
    if (isTestFile(file)) for (const [signature, count] of old.assertions) if ((next.assertions.get(signature) ?? 0) < count) issues.push("An existing regression assertion was removed or changed.");
    // Auth modules can be local and arbitrarily named: imports/calls above detect
    // recognized auth dependencies; security-related exports protect their bodies.
    if ([...old.exports].some(name => SECURITY.test(name)) && JSON.stringify(tokens(before)) !== JSON.stringify(tokens(after ?? ""))) issues.push("An existing security interface implementation changed; explicit security review is required.");
  }
  if (before !== null && /(?:^|\/)package\.json$/.test(file)) {
    try {
      const old = JSON.parse(before), next = JSON.parse(after ?? "{}");
      for (const [name, script] of Object.entries(old.scripts ?? {})) if (next.scripts?.[name] !== script) issues.push(`Existing validation/setup script changed or removed: ${name}.`);
      for (const group of ["dependencies", "devDependencies"]) for (const name of Object.keys(old[group] ?? {})) if (!(name in (next[group] ?? {}))) issues.push(`Existing dependency removed: ${name}.`);
    } catch { issues.push("Cannot parse existing package configuration safely."); }
  }
  if (before !== null && /(?:^|\/)(?:tsconfig[^/]*\.json|(?:next|vite|vitest|jest)\.config\.[cm]?[jt]s)$/.test(file) && JSON.stringify(tokens(before)) !== JSON.stringify(tokens(after ?? ""))) issues.push("Existing validation configuration changed; explicit review is required.");
  return [...new Set(issues)];
}

export function preflightPreservation(root: string, operations: ProposedFile[], reads: Record<string, string>): PreservationIssue[] {
  const issues: PreservationIssue[] = [], seen = new Set<string>();
  for (const operation of operations) {
    const located = resolveInside(root, operation.path, { allowMissingParents: true });
    if (!located.ok) { issues.push({ path: operation.path, reason: located.reason }); continue; }
    if (seen.has(located.relative)) { issues.push({ path: located.relative, reason: "Repeated file operations must be consolidated into one reviewable replacement." }); continue; }
    seen.add(located.relative);
    const exists = fs.existsSync(located.absolute);
    if (exists && !fs.statSync(located.absolute).isFile()) { issues.push({ path: located.relative, reason: "The write target is not a regular file." }); continue; }
    const before = exists ? fs.readFileSync(located.absolute, "utf8") : null;
    if (operation.action === "CREATE_FILE" && exists) issues.push({ path: located.relative, reason: "CREATE_FILE cannot overwrite an existing file." });
    if (before !== null && reads[located.relative] !== hashText(before)) issues.push({ path: located.relative, reason: "Complete current file content was not supplied, or it changed since it was read. Read the whole file before modifying it." });
    const after = operation.action === "DELETE_FILE" ? null : operation.content ?? "";
    for (const reason of preservationViolations(located.relative, before, after)) issues.push({ path: located.relative, reason });
  }
  return issues;
}

/** Compare the final tree with the immutable Git baseline, including changes
 * made by repository scripts rather than by WRITE_FILE. Never read secret files.
 */
export async function baselinePreservationIssues(root: string, baseCommit: string, strictAvailability=false): Promise<PreservationIssue[]> {
  const { runGit } = await import("@/modules/coding/git");
  const { isSecretPath } = await import("@/modules/coding/policy");
  const { isGeneratedReviewPath } = await import("@/modules/coding/generated-paths");
  if (!/^[a-f0-9]{40}$/.test(baseCommit)) return [{ path: ".", reason: "A resolved immutable Git baseline is required for preservation checks." }];
  const baseline = await runGit(root, ["cat-file", "-t", baseCommit]);
  if(strictAvailability&&(baseline.code!==0||baseline.stdout.trim()!=="commit"))throw new AuthorityUnavailableError();
  if (baseline.code !== 0 || baseline.stdout.trim() !== "commit") return [{ path: ".", reason: "The task Git baseline cannot be resolved; preservation checks cannot proceed." }];
  const changed = await runGit(root, ["diff", "--name-only", "-z", baseCommit, "--"]);
  const untracked = await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if(strictAvailability&&(changed.code!==0||untracked.code!==0))throw new AuthorityUnavailableError();
  if (changed.code !== 0 || untracked.code !== 0) return [{ path: ".", reason: "Cannot inspect the task diff for preservation." }];
  const issues: PreservationIssue[] = [];
  for (const file of new Set([...changed.stdout.split("\0"), ...untracked.stdout.split("\0")].filter(Boolean))) {
    if (isSecretPath(file) || isGeneratedReviewPath(file)) continue;
    const located = resolveInside(root, file, { allowMissingParents: true });
    if (!located.ok) { issues.push({ path: file, reason: located.reason }); continue; }
    const old = await runGit(root, ["show", `${baseCommit}:${file}`]);
    const exists = fs.existsSync(located.absolute);
    const after = exists && fs.statSync(located.absolute).isFile() ? fs.readFileSync(located.absolute, "utf8") : null;
    for (const reason of preservationViolations(file, old.code === 0 ? old.stdout : null, after)) issues.push({ path: file, reason });
  }
  return issues;
}
