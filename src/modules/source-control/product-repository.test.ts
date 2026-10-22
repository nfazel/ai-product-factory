import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { factoryRoot } from "@/modules/coding/config";
import { runGit } from "@/modules/coding/git";
import {
  assertSafeRepositoryPath,
  connectExistingRepository,
  createRemoteRepository,
  getProductRepositoryView,
  initializeGreenfieldRepository,
  productRepositoryDirectory,
  resolveProductRepository,
} from "@/modules/source-control/product-repository";

const products: string[] = [];
const directories: string[] = [];
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-product-workspaces-"));
directories.push(workspaceRoot);
const originalWorkspace = process.env.PRODUCT_WORKSPACE_ROOT;
const originalRoot = process.env.PRODUCT_REPOSITORY_ROOT;
const originalAppId = process.env.GITHUB_APP_ID;
const originalInstallation = process.env.GITHUB_APP_INSTALLATION_ID;
const originalKey = process.env.GITHUB_APP_PRIVATE_KEY;

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-existing-"));
  directories.push(dir);
  fs.writeFileSync(path.join(dir, "README.md"), "Existing\n");
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "pipe" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["add", "README.md"]);
  git(["commit", "-m", "init"]);
  return dir;
}

async function product(context: "GREENFIELD" | "EXISTING_SYSTEM") {
  const created = await db.product.create({
    data: {
      name: `Repository ${crypto.randomUUID()}`,
      description: "Temporary",
      vision: "A customer can find a friend.",
      problemStatement: "Discovery is fragmented.",
      targetUsers: "Customers",
      status: "ACTIVE",
      currentStage: "BUILD",
      developmentContext: context,
    },
  });
  products.push(created.id);
  return created;
}

afterAll(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (products.length > 0) {
    await db.product.deleteMany({ where: { id: { in: products.splice(0) } } });
  }
  if (originalWorkspace === undefined) delete process.env.PRODUCT_WORKSPACE_ROOT;
  else process.env.PRODUCT_WORKSPACE_ROOT = originalWorkspace;
  if (originalRoot === undefined) delete process.env.PRODUCT_REPOSITORY_ROOT;
  else process.env.PRODUCT_REPOSITORY_ROOT = originalRoot;
  if (originalAppId === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = originalAppId;
  if (originalInstallation === undefined) delete process.env.GITHUB_APP_INSTALLATION_ID;
  else process.env.GITHUB_APP_INSTALLATION_ID = originalInstallation;
  if (originalKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
  else process.env.GITHUB_APP_PRIVATE_KEY = originalKey;
});

describe("product repository", () => {
  it("rejects the builder source tree, unsafe paths, and unsafe product ids", () => {
    expect(() => assertSafeRepositoryPath(factoryRoot())).toThrow(/AI Product Builder source repository/);
    expect(() => assertSafeRepositoryPath("relative/repo")).toThrow(/absolute path/);
    expect(() => assertSafeRepositoryPath(`${os.tmpdir()}/../etc`)).toThrow(/not allowed/);
    expect(() => productRepositoryDirectory("../etc")).toThrow(/directory name/);
    const link = path.join(workspaceRoot, `factory-link-${crypto.randomUUID()}`);
    fs.symlinkSync(factoryRoot(), link);
    expect(() => assertSafeRepositoryPath(link)).toThrow(/AI Product Builder source repository/);
    fs.unlinkSync(link);
  });

  it("refuses to initialise a product repository inside the builder source tree", async () => {
    process.env.PRODUCT_WORKSPACE_ROOT = factoryRoot();
    const created = await product("GREENFIELD");
    await expect(initializeGreenfieldRepository(created.id)).rejects.toThrow(/AI Product Builder source repository/);
    expect(fs.existsSync(path.join(factoryRoot(), created.id))).toBe(false);
  });

  it("initialises a greenfield repository, persists it, and records activity", async () => {
    process.env.PRODUCT_WORKSPACE_ROOT = workspaceRoot;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    const created = await product("GREENFIELD");
    const other = gitRepo();
    process.env.PRODUCT_REPOSITORY_ROOT = other;
    const saved = await initializeGreenfieldRepository(created.id);
    expect(saved.status).toBe("CONFIGURED");
    expect(saved.localPath.startsWith(fs.realpathSync(workspaceRoot))).toBe(true);
    expect(saved.provider).toBe("LOCAL");
    expect(fs.existsSync(path.join(saved.localPath, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(saved.localPath, "src"))).toBe(false);
    const again = await getProductRepositoryView(created.id);
    expect(again?.localReady).toBe(true);
    expect(again?.localLabel).toBe("Ready");
    expect(again?.gitLabel).toBe("Initialised");
    expect(again?.remoteLabel).toBe("Not connected");
    const resolved = await resolveProductRepository(created.id);
    expect(resolved.source).toBe("product");
    expect(resolved.localPath).toBe(saved.localPath);
    expect(resolved.localPath).not.toBe(fs.realpathSync(other));
    const activity = await db.activity.findFirst({
      where: { productId: created.id, type: "REPOSITORY_INITIALISED" },
    });
    expect(activity?.description).toMatch(/No remote repository was created/);
    await expect(
      createRemoteRepository(created.id, { name: "find-a-friend", visibility: "private", defaultBranch: "main", confirmed: false }),
    ).rejects.toThrow(/explicit confirmation/);
    await expect(
      createRemoteRepository(created.id, { name: "find-a-friend", visibility: "private", defaultBranch: "main", confirmed: true }),
    ).rejects.toThrow(/GitHub App/);
    const remote = await runGit(saved.localPath, ["remote"]);
    expect(remote.stdout).not.toContain("origin");
    const source = fs.readFileSync(path.join(process.cwd(), "src/modules/source-control/product-repository.ts"), "utf8");
    expect(source).not.toContain("pushRef");
    expect(source).not.toContain('["push"');
  });

  it("connects an existing repository and keeps the legacy environment fallback for products without one", async () => {
    const existing = await product("EXISTING_SYSTEM");
    const repo = gitRepo();
    const connected = await connectExistingRepository(existing.id, repo);
    expect(connected.localPath).toBe(fs.realpathSync(repo));
    expect(connected.defaultBranch).toBe("main");
    const activity = await db.activity.findFirst({ where: { productId: existing.id, type: "REPOSITORY_CONNECTED" } });
    expect(activity).toBeTruthy();
    const reread = await db.repository.findUnique({ where: { productId: existing.id } });
    expect(reread?.status).toBe("CONFIGURED");

    const greenfield = await product("GREENFIELD");
    const fallback = gitRepo();
    process.env.PRODUCT_REPOSITORY_ROOT = fallback;
    const resolved = await resolveProductRepository(greenfield.id);
    expect(resolved.source).toBe("legacy");
    expect(resolved.localPath).toBe(fs.realpathSync(fallback));
    delete process.env.PRODUCT_REPOSITORY_ROOT;
    await expect(resolveProductRepository(greenfield.id)).rejects.toThrow(/does not have a repository yet/);
    await expect(connectExistingRepository(greenfield.id, repo)).rejects.toThrow(/existing application/);
  });
});
