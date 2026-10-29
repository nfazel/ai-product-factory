import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { hashText } from "@/modules/coding/policy";
import { baselinePreservationIssues, preflightPreservation, preservationViolations, prismaDeclarations } from "@/modules/coding/preservation";
import { preflightRepositoryBatch, type ToolContext } from "@/modules/coding/tools";
import { sourceDependencies } from "@/modules/coding/source-context";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root() { const value = fs.mkdtempSync(path.join(os.tmpdir(), "preservation-")); roots.push(value); return value; }
const schema = `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
enum ReviewState { NEW APPROVED }
model Account {
 id String @id @default(uuid())
 entries Entry[] @relation("AccountEntries")
 state ReviewState @default(NEW)
 @@map("accounts")
}
model Entry {
 id String @id
 accountId String
 account Account @relation("AccountEntries", fields: [accountId], references: [id], onDelete: Cascade)
 @@unique([id, accountId])
}`;

describe("generic deterministic preservation", () => {
  it("parses multiline Prisma declarations and allows additive fields/models", () => {
    expect(prismaDeclarations(schema)?.has("model Entry.account")).toBe(true);
    expect(preservationViolations("database/catalog.prisma", schema, schema.replace(" state ReviewState", " nickname String?\n state ReviewState") + '\nmodel Extra { id String @id }')).toEqual([]);
  });
  it.each([
    ["model removal", schema.replace(/model Entry \{[\s\S]*?\n\}/, "")],
    ["field removal", schema.replace(" state ReviewState @default(NEW)", "")],
    ["relationship replacement", schema.replace('onDelete: Cascade', 'onDelete: Restrict')],
    ["field type change", schema.replace('accountId String', 'accountId Int')],
    ["enum value removal", schema.replace('NEW APPROVED', 'NEW')],
    ["uniqueness removal", schema.replace(' @@unique([id, accountId])', '')],
    ["database mapping replacement", schema.replace('@@map("accounts")', '@@map("users")')],
    ["provider replacement", schema.replace('"postgresql"', '"mysql"')],
  ])("blocks %s independent of application names", (_, after) => {
    expect(preservationViolations("db/records.prisma", schema, after).length).toBeGreaterThan(0);
  });
  it("fails closed on unsupported schema syntax and destructive SQL", () => {
    expect(preservationViolations("db.prisma", schema, "not valid Prisma")[0]).toMatch(/parse/);
    expect(preservationViolations("migration.sql", null, "DROP TABLE accounts;")[0]).toMatch(/SQL/);
    expect(preservationViolations("db/schema.rb", "old", "new")[0]).toMatch(/Unsupported/);
  });
  it("fails closed for recognized unsupported ORM models at arbitrary source paths", () => {
    const before = `import { pgTable, text } from 'drizzle-orm/pg-core'; export const objects = pgTable('objects', { id: text('id'), label: text('label') });`;
    expect(preservationViolations("backend/inventory.ts", before, before.replace(", label: text('label')", "")).join(" ")).toMatch(/Unsupported ORM/);
  });
  it("protects aliased auth imports, authorization guards and call arguments", () => {
    const before = `import { validateSession as inspect } from "session-provider";
export function GET(req) { const principal = inspect(req.cookie); if (!principal) return { status: 401 }; return list(); }`;
    for (const after of [
      before.replace('inspect(req.cookie)', 'req.cookie'),
      before.replace('inspect(req.cookie)', 'inspect(req.raw)'),
      before.replace('if (!principal) return { status: 401 };', ''),
      before.replace('const principal = inspect(req.cookie);', 'let principal; if(false) { principal = inspect(req.cookie); }'),
    ]) expect(preservationViolations("routes/data.ts", before, after).join(" ")).toMatch(/authentication|security/i);
  });
  it("allows extending a guarded route without changing its existing auth checks", () => {
    const before = `import { getSession } from './identity'; export function GET() { const session = getSession(); if (!session) return { status: 401 }; return load(); }`;
    expect(preservationViolations("routes/data.ts", before, before.replace('return load();', 'return filter(load());'))).toEqual([]);
  });
  it("blocks deleting exported behavior and bypassing independent assertions", () => {
    expect(preservationViolations("claims.ts", 'export function submit() { return 1 }', '').join(" ")).toMatch(/exported/);
    expect(preservationViolations("ledger.test.ts", `import verify from 'node:assert/strict'; verify.equal(actual, expected);`, 'console.log("pass")').join(" ")).toMatch(/assertion/);
  });
  it("protects check scripts and validation configuration", () => {
    expect(preservationViolations("package.json", '{"scripts":{"build":"next build"}}', '{"scripts":{"build":"true"}}').join(" ")).toMatch(/script/);
    expect(preservationViolations("next.config.ts", null, 'export default { typescript: { ignoreBuildErrors: true } }').join(" ")).toMatch(/disables/);
  });
  it("requires a complete, current read and enforces CREATE_FILE semantics", () => {
    const dir = root(), file = "code.ts", content = 'export const value = 1;'; fs.writeFileSync(path.join(dir, file), content);
    const operation = { action: "WRITE_FILE", path: file, content: 'export const value = 2;' };
    expect(preflightPreservation(dir, [operation], {}).join()).toBeTruthy();
    expect(preflightPreservation(dir, [operation], { [file]: hashText(content) })).toEqual([]);
    fs.writeFileSync(path.join(dir, file), 'export const value = 3;');
    expect(preflightPreservation(dir, [operation], { [file]: hashText(content) })[0].reason).toMatch(/changed/);
    expect(preflightPreservation(dir, [{ ...operation, action: "CREATE_FILE" }], {})[0].reason).toMatch(/overwrite/);
  });
  it("preflights the whole batch before any write and denies late scope violations", () => {
    const dir = root();
    const context: ToolContext = { workspaceId: "test", productId: "test", workspacePath: dir, allowedPaths: ["src/"], restrictedPaths: [], allowFileDelete: false, maxFiles: 8, policyCommands: [], stale: false, completeReads: {} };
    const issues = preflightRepositoryBatch(context, [
      { action: "CREATE_FILE", path: "src/allowed.ts", content: "export const kept = 1;" },
      { action: "CREATE_FILE", path: "outside.ts", content: "export const denied = 2;" },
    ]);
    expect(issues.some(issue => issue.path === "outside.ts")).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/allowed.ts"))).toBe(false);
  });
  it("counts earlier writes in the batch file limit before any new mutation", () => {
    const dir = root();
    const context: ToolContext = { workspaceId: "test", productId: "test", workspacePath: dir, allowedPaths: ["src/"], restrictedPaths: [], allowFileDelete: false, maxFiles: 1, policyCommands: [], stale: false, completeReads: {} };
    const issues = preflightRepositoryBatch(context, [{ action: "CREATE_FILE", path: "src/second.ts", content: "export const second = 2;" }], ["src/first.ts"]);
    expect(issues.some(issue => issue.reason.includes("file limit"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "src/second.ts"))).toBe(false);
  });
  it("discovers project aliases without a fixed source directory", () => {
    const dir = root(); fs.mkdirSync(path.join(dir, "backend/security"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "~app/*": ["backend/*"] } } }));
    fs.writeFileSync(path.join(dir, "backend/security/gate.ts"), "export function authenticate() {}");
    expect(sourceDependencies(dir, "routes/entry.ts", `import { authenticate } from '~app/security/gate';`)).toEqual(["backend/security/gate.ts"]);
  });
  it("detects script-induced schema changes against the immutable baseline", async () => {
    const dir = root();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git("init", "-q");fs.writeFileSync(path.join(dir, "data.prisma"), schema);git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline");
    const base = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(dir, "data.prisma"), schema.replace('onDelete: Cascade', 'onDelete: Restrict'));
    expect((await baselinePreservationIssues(dir, base)).some(issue => issue.reason.includes("Entry.account"))).toBe(true);
  });
});
