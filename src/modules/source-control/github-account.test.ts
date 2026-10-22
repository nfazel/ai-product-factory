import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { decryptSecret } from "@/modules/ai/credential-crypto";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { assertInstallationOperational, installationContentsCanPush } from "@/modules/source-control/github";
import {
  assignProductRepository,
  checkInstallationRepository,
  installationRepositoriesFrom,
  listInstallationRepositories,
  nextInstallationPage,
  parseGitHubRemote,
  revalidateProductRepositoryAccess,
  setGitHubAccountClientForTests,
  setInstallationDirectoryForTests,
  validateGitHubIdentity,
  type GitHubAccountClient,
  type InstallationRepository,
} from "@/modules/source-control/github-account";
import {
  getGitHubConnectionView,
  removeGitHubCredential,
  saveGitHubCredential,
} from "@/modules/source-control/github-credentials";

const TOKEN = "github_pat_testtokenvalue_do_not_use_123456";
const REPLACEMENT = "github_pat_replacementtoken_do_not_use_999999";
const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nTESTONLYNOTAREALKEY\n-----END PRIVATE KEY-----";
const ENCRYPTION_KEY = randomBytes(32).toString("base64");

const products: string[] = [];
const repos: string[] = [];
let previousConnection: Awaited<ReturnType<typeof db.sourceControlConnection.findUnique>> = null;
const originalKey = process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
const originalApp = {
  id: process.env.GITHUB_APP_ID,
  installation: process.env.GITHUB_APP_INSTALLATION_ID,
  key: process.env.GITHUB_APP_PRIVATE_KEY,
  token: process.env.GITHUB_TOKEN,
};

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-github-account-"));
  repos.push(dir);
  fs.writeFileSync(path.join(dir, "README.md"), "local product\n");
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

async function productWithRepo() {
  const repo = makeRepo();
  const product = await db.product.create({
    data: {
      name: `GitHub ${crypto.randomUUID()}`,
      description: "Temporary",
      vision: "A product.",
      problemStatement: "Needs a repository.",
      targetUsers: "People",
      status: "ACTIVE",
      currentStage: "BUILD",
    },
  });
  products.push(product.id);
  await db.repository.create({
    data: {
      productId: product.id,
      name: "local",
      provider: "LOCAL",
      localPath: repo,
      defaultBranch: "main",
      status: "CONFIGURED",
    },
  });
  return { product, repo };
}

function fakeClient(patch?: Partial<GitHubAccountClient> & { calls?: string[] }): GitHubAccountClient & { calls: string[] } {
  const calls: string[] = [];
  const client: GitHubAccountClient & { calls: string[] } = {
    calls,
    async identify() {
      calls.push("identify");
      return { login: "octocat" };
    },
    async repositoryAccess(_token, owner, name) {
      calls.push(`access:${owner}/${name}`);
      return {
        url: `https://github.com/${owner}/${name}`,
        defaultBranch: "main",
        canPush: true,
        empty: true,
        headSha: "",
      };
    },
    ...patch,
  };
  client.calls = calls;
  return client;
}

async function useInstallation(repositories: InstallationRepository[], installationId = "4242") {
  await db.sourceControlConnection.update({
    where: { id: "factory" },
    data: { authMode: "APP", installationId, status: "CONNECTED" },
  });
  const calls: string[] = [];
  setInstallationDirectoryForTests({
    async list(input) {
      calls.push(input.installationId);
      return repositories;
    },
  });
  return calls;
}

beforeAll(async () => {
  previousConnection = await db.sourceControlConnection.findUnique({ where: { id: "factory" } });
  await db.sourceControlConnection.deleteMany({ where: { id: "factory" } });
});

afterEach(async () => {
  setGitHubAccountClientForTests(null);
  setInstallationDirectoryForTests(null);
  if (originalKey === undefined) delete process.env.AI_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.AI_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  if (originalApp.id === undefined) delete process.env.GITHUB_APP_ID;
  else process.env.GITHUB_APP_ID = originalApp.id;
  if (originalApp.installation === undefined) delete process.env.GITHUB_APP_INSTALLATION_ID;
  else process.env.GITHUB_APP_INSTALLATION_ID = originalApp.installation;
  if (originalApp.key === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
  else process.env.GITHUB_APP_PRIVATE_KEY = originalApp.key;
  if (originalApp.token === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalApp.token;
  await db.sourceControlConnection.deleteMany({ where: { id: "factory" } });
  if (previousConnection) {
    await db.sourceControlConnection.create({ data: previousConnection });
  }
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
  while (repos.length > 0) {
    const repo = repos.pop();
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe("github connection credentials", () => {
  function isolate() {
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY = ENCRYPTION_KEY;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_TOKEN;
  }

  it("saves, replaces, and masks an encrypted token without returning it", async () => {
    isolate();
    const saved = await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    expect(saved.replaced).toBe(false);
    const first = await db.sourceControlConnection.findUniqueOrThrow({ where: { id: "factory" } });
    expect(first.encryptedCredential).not.toBe(TOKEN);
    expect(first.encryptedCredential).not.toContain(TOKEN);
    expect(first.authMode).toBe("TOKEN");
    expect(first.repositoryName).toBe("");
    const key = Buffer.from(ENCRYPTION_KEY, "base64");
    expect(decryptSecret(first, key)).toBe(TOKEN);
    const view = await getGitHubConnectionView();
    expect(view.maskedCredential).toBe(`Saved, ending ${TOKEN.slice(-4)}`);
    expect(view.stateLabel).toBe("Saved, not validated");
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(JSON.stringify(view)).not.toContain(first.encryptedCredential);

    const replaced = await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: REPLACEMENT });
    expect(replaced.replaced).toBe(true);
    const second = await db.sourceControlConnection.findUniqueOrThrow({ where: { id: "factory" } });
    expect(second.encryptedCredential).not.toBe(first.encryptedCredential);
    expect(decryptSecret(second, key)).toBe(REPLACEMENT);
    expect(second.status).toBe("UNAVAILABLE");
    expect(second.login).toBe("");
    const listed = JSON.stringify(await db.activity.findMany());
    expect(listed).not.toContain(TOKEN);
    expect(listed).not.toContain(REPLACEMENT);
  });

  it("stores a GitHub App private key encrypted and does not return it", async () => {
    isolate();
    await saveGitHubCredential({
      actor: "Local user",
      mode: "APP",
      appId: "12345",
      installationId: "67890",
      privateKey: PRIVATE_KEY,
    });
    const row = await db.sourceControlConnection.findUniqueOrThrow({ where: { id: "factory" } });
    expect(row.authMode).toBe("APP");
    expect(row.appId).toBe("12345");
    expect(row.encryptedCredential).not.toContain("PRIVATE KEY");
    const view = await getGitHubConnectionView();
    expect(view.authMode).toBe("APP");
    expect(view.maskedCredential).toBe("Saved");
    expect(JSON.stringify(view)).not.toContain(PRIVATE_KEY);
    expect(JSON.stringify(view)).not.toContain("BEGIN PRIVATE KEY");
  });

  it("records invalid credentials and insufficient repository permissions", async () => {
    isolate();
    const { product, repo } = await productWithRepo();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    setGitHubAccountClientForTests({
      ...fakeClient(),
      async identify() {
        throw new SourceControlFailure("GitHub authentication failed.", "AUTH");
      },
    });
    await expect(validateGitHubIdentity("Local user")).rejects.toThrow(/Invalid credentials/);
    const invalid = await db.sourceControlConnection.findUniqueOrThrow({ where: { id: "factory" } });
    expect(invalid.status).toBe("UNAVAILABLE");
    expect(invalid.message).toBe("Invalid credentials.");
    expect(invalid.login).toBe("");
    expect(invalid.encryptedCredential).not.toContain(TOKEN);
    expect(JSON.stringify(await getGitHubConnectionView())).not.toContain(TOKEN);

    setGitHubAccountClientForTests(fakeClient());
    await validateGitHubIdentity("Local user");
    await useInstallation([{ owner: "octocat", name: "private", canPush: false }]);
    await expect(
      assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "private", actor: "Local user" }),
    ).rejects.toThrow(/Insufficient permissions/);
    const mapped = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(mapped.connectionStatus).toBe("MISCONFIGURED");
    expect(mapped.connectionMessage).toMatch(/Insufficient permissions/);
    expect(mapped.localPath).toBe(repo);
    expect(git(repo, ["remote"]).trim()).toBe("");
    expect(await db.publishedChange.count({ where: { productId: product.id } })).toBe(0);
    expect(JSON.stringify(mapped)).not.toContain(TOKEN);
  });

  it("maps each product to its own repository and detects remote history without pushing", async () => {
    isolate();
    const first = await productWithRepo();
    const second = await productWithRepo();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    const client = fakeClient();
    setGitHubAccountClientForTests(client);
    await validateGitHubIdentity("Local user");
    await useInstallation([
      { owner: "octocat", name: "alpha", canPush: true },
      { owner: "other", name: "beta", canPush: true },
    ]);
    await assignProductRepository({ productId: first.product.id, owner: "octocat", repositoryName: "alpha", actor: "Local user" });
    await assignProductRepository({ productId: second.product.id, owner: "other", repositoryName: "beta", actor: "Local user" });
    const rows = await db.repository.findMany({
      where: { productId: { in: [first.product.id, second.product.id] } },
      orderBy: { repositoryName: "asc" },
    });
    expect(rows.map((row) => `${row.owner}/${row.repositoryName}`)).toEqual(["octocat/alpha", "other/beta"]);
    expect(rows.every((row) => row.connectionStatus === "CONNECTED")).toBe(true);
    expect(client.calls).not.toContain("create");
    expect(git(first.repo, ["remote"]).trim()).toBe("");
    expect(git(second.repo, ["remote"]).trim()).toBe("");
    expect(fs.readFileSync(path.join(first.repo, "README.md"), "utf8")).not.toContain(TOKEN);

    const conflict = fakeClient();
    conflict.repositoryAccess = async (_token, owner, name) => ({
      url: `https://github.com/${owner}/${name}`,
      defaultBranch: "main",
      canPush: true,
      empty: false,
      headSha: "a".repeat(40),
    });
    setGitHubAccountClientForTests(conflict);
    const result = await assignProductRepository({
      productId: first.product.id,
      owner: "octocat",
      repositoryName: "alpha",
      actor: "Local user",
    });
    expect(result.conflict).toBe(true);
    expect(result.message).toMatch(/will not overwrite/);
    const updated = await db.repository.findUniqueOrThrow({ where: { productId: first.product.id } });
    expect(updated.connectionStatus).toBe("MISCONFIGURED");
    expect(git(first.repo, ["remote"]).trim()).toBe("");
    expect(git(first.repo, ["status", "--porcelain"]).trim()).toBe("");
    expect(await db.publishedChange.count({ where: { productId: first.product.id } })).toBe(0);
    const activities = await db.activity.findMany({ where: { productId: first.product.id } });
    expect(JSON.stringify(activities)).not.toContain(TOKEN);
    expect(JSON.stringify(activities)).not.toContain("BEGIN PRIVATE KEY");
    const listed = await listInstallationRepositories("Local user");
    expect(listed.map((repository) => `${repository.owner}/${repository.name}`)).toEqual(["octocat/alpha", "other/beta"]);
  });

  it("removes the credential and rejects an agent", async () => {
    isolate();
    const { product } = await productWithRepo();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    setGitHubAccountClientForTests(fakeClient());
    await validateGitHubIdentity("Local user");
    await useInstallation([{ owner: "octocat", name: "alpha", canPush: true }]);
    await assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "alpha", actor: "Local user" });
    await removeGitHubCredential({ actor: "Local user", confirm: "remove" });
    const row = await db.sourceControlConnection.findUniqueOrThrow({ where: { id: "factory" } });
    expect(row.encryptedCredential).toBe("");
    expect(row.authMode).toBe("");
    expect(row.login).toBe("");
    expect(row.status).toBe("UNAVAILABLE");
    expect(row.message).toBe("GitHub connection removed.");
    const mapping = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(mapping.owner).toBe("octocat");
    expect(mapping.repositoryName).toBe("alpha");
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    await expect(saveGitHubCredential({ actor: "Coding Agent", mode: "TOKEN", token: TOKEN })).rejects.toThrow(/agent cannot/);
    await expect(removeGitHubCredential({ actor: "Local user", confirm: "no" })).rejects.toThrow(/Confirm removal/);
  });

  it("lists only the repositories on the GitHub App installation", async () => {
    isolate();
    const { product } = await productWithRepo();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    process.env.GITHUB_TOKEN = "github_pat_accountwide_do_not_use_0000";
    const calls = await useInstallation([{ owner: "octocat", name: "betmyfriend", canPush: true }], "5150");
    setGitHubAccountClientForTests(fakeClient());
    await db.sourceControlConnection.update({ where: { id: "factory" }, data: { status: "CONNECTED" } });
    const listed = await listInstallationRepositories("Local user");
    expect(listed).toEqual([{ owner: "octocat", name: "betmyfriend", canPush: true }]);
    expect(calls).toEqual(["5150"]);
    expect(JSON.stringify(listed)).not.toContain("github_pat_accountwide");
    await expect(
      assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "other-repo", actor: "Local user" }),
    ).rejects.toThrow(/not accessible to the GitHub App installation/);
    const row = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(row.owner).toBe("");
    expect(row.repositoryName).toBe("");
    await assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "betmyfriend", actor: "Local user" });
    const mapped = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(`${mapped.owner}/${mapped.repositoryName}`).toBe("octocat/betmyfriend");
  });

  it("returns every repository the installation allows and no account-wide list", async () => {
    isolate();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    await useInstallation([
      { owner: "octocat", name: "betmyfriend", canPush: true },
      { owner: "octocat", name: "notes", canPush: true },
    ]);
    await db.sourceControlConnection.update({ where: { id: "factory" }, data: { status: "CONNECTED" } });
    const listed = await listInstallationRepositories("Local user");
    expect(listed.map((repository) => repository.name)).toEqual(["betmyfriend", "notes"]);
  });

  it("refreshes installation access and blocks a repository that lost permission", async () => {
    isolate();
    const { product } = await productWithRepo();
    setGitHubAccountClientForTests(fakeClient());
    let repositories: InstallationRepository[] = [
      { owner: "octocat", name: "betmyfriend", canPush: true },
      { owner: "octocat", name: "notes", canPush: true },
    ];
    const calls: string[] = [];
    await db.sourceControlConnection.upsert({
      where: { id: "factory" },
      create: { id: "factory", authMode: "APP", installationId: "4242", status: "CONNECTED", provider: "GITHUB" },
      update: { authMode: "APP", installationId: "4242", status: "CONNECTED" },
    });
    setInstallationDirectoryForTests({
      async list(input) {
        calls.push(input.installationId);
        return repositories;
      },
    });
    expect((await listInstallationRepositories("Local user")).map((repository) => repository.name)).toEqual(["betmyfriend", "notes"]);
    repositories = [{ owner: "octocat", name: "betmyfriend", canPush: false }];
    const refreshed = await listInstallationRepositories("Local user");
    expect(refreshed).toEqual([{ owner: "octocat", name: "betmyfriend", canPush: false }]);
    expect(calls).toHaveLength(2);
    await expect(
      assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "notes", actor: "Local user" }),
    ).rejects.toThrow(/not accessible/);
    await expect(
      assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "betmyfriend", actor: "Local user" }),
    ).rejects.toThrow(/Insufficient permissions/);
    const access = await checkInstallationRepository("octocat", "notes");
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.message).toMatch(/cannot access this repository/);
  });

  it("does not list repositories with a personal access token", async () => {
    isolate();
    await saveGitHubCredential({ actor: "Local user", mode: "TOKEN", token: TOKEN });
    await db.sourceControlConnection.update({ where: { id: "factory" }, data: { status: "CONNECTED" } });
    const calls: string[] = [];
    setInstallationDirectoryForTests({
      async list() {
        calls.push("listed");
        return [{ owner: "octocat", name: "everything", canPush: true }];
      },
    });
    await expect(listInstallationRepositories("Local user")).rejects.toThrow(/GitHub App installation/);
    expect(calls).toEqual([]);
  });

  it("allows an installation token with contents write when repository push is false", () => {
    const body = {
      repositories: [{
        full_name: "nfazel/betmyfriend",
        permissions: { admin: false, maintain: false, push: false, triage: false, pull: false },
      }],
    };
    expect(installationRepositoriesFrom(body, { contents: "write", metadata: "read", pull_requests: "write" })).toEqual([
      { owner: "nfazel", name: "betmyfriend", canPush: true },
    ]);
    expect(installationContentsCanPush({ contents: "write" })).toBe(true);
  });

  it("blocks an installation token with contents read or without a contents permission", () => {
    const body = {
      repositories: [{ full_name: "nfazel/betmyfriend", permissions: { push: true } }],
    };
    expect(installationRepositoriesFrom(body, { contents: "read", metadata: "read" })[0]?.canPush).toBe(false);
    expect(installationRepositoriesFrom(body, { metadata: "read", pull_requests: "write" })[0]?.canPush).toBe(false);
    expect(installationContentsCanPush(undefined)).toBe(false);
    expect(installationContentsCanPush({})).toBe(false);
  });

  it("rejects the AI Product Builder repository and an account-wide payload", () => {
    expect(installationRepositoriesFrom({
      repositories: [{ full_name: "octocat/betmyfriend", permissions: { push: true } }],
    }, { contents: "write" })).toEqual([{ owner: "octocat", name: "betmyfriend", canPush: true }]);
    expect(() => installationRepositoriesFrom([{ full_name: "octocat/everything" }], { contents: "write" })).toThrow(/GitHub App installation/);
    expect(nextInstallationPage('<https://api.github.com/user/repos?page=2>; rel="next"')).toBeNull();
    expect(nextInstallationPage('<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"')).toBe(
      "/installation/repositories?per_page=100&page=2",
    );
  });

  it("rejects the factory repository even when the installation returns it", async () => {
    isolate();
    const { product } = await productWithRepo();
    setGitHubAccountClientForTests(fakeClient());
    await db.sourceControlConnection.upsert({
      where: { id: "factory" },
      create: { id: "factory", authMode: "APP", installationId: "4242", status: "CONNECTED", provider: "GITHUB" },
      update: { authMode: "APP", installationId: "4242", status: "CONNECTED" },
    });
    const factory = parseGitHubRemote(git(process.cwd(), ["remote", "get-url", "origin"]).trim());
    expect(factory).not.toBeNull();
    setInstallationDirectoryForTests({
      async list() {
        return [
          { owner: factory?.owner ?? "", name: factory?.name ?? "", canPush: true },
          { owner: "octocat", name: "betmyfriend", canPush: true },
        ];
      },
    });
    await expect(
      assignProductRepository({
        productId: product.id,
        owner: factory?.owner ?? "",
        repositoryName: factory?.name ?? "",
        actor: "Local user",
      }),
    ).rejects.toThrow(/AI Product Builder repository/);
    const unchanged = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(unchanged.repositoryName).toBe("");
    await assignProductRepository({ productId: product.id, owner: "octocat", repositoryName: "betmyfriend", actor: "Local user" });
    const mapped = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(`${mapped.owner}/${mapped.repositoryName}`).toBe("octocat/betmyfriend");
  });

  it("restores a misconfigured mapping when contents write is granted and does not publish", async () => {
    isolate();
    const { product, repo } = await productWithRepo();
    await db.sourceControlConnection.upsert({
      where: { id: "factory" },
      create: { id: "factory", authMode: "APP", installationId: "4242", status: "CONNECTED", provider: "GITHUB" },
      update: { authMode: "APP", installationId: "4242", status: "CONNECTED" },
    });
    await db.repository.update({
      where: { productId: product.id },
      data: {
        provider: "GITHUB",
        owner: "octocat",
        repositoryName: "betmyfriend",
        connectionStatus: "MISCONFIGURED",
        connectionMessage: "Insufficient permissions. The GitHub App installation cannot push to this repository.",
        status: "CONFIGURED",
      },
    });
    process.env.GITHUB_TOKEN = "github_pat_accountwide_do_not_use_0000";
    setInstallationDirectoryForTests({
      async list() {
        return [{ owner: "octocat", name: "betmyfriend", canPush: true }];
      },
    });
    const restored = await revalidateProductRepositoryAccess(product.id);
    expect(restored).toMatchObject({ connectionStatus: "CONNECTED", status: "CONFIGURED" });
    const mapping = await db.repository.findUniqueOrThrow({ where: { productId: product.id } });
    expect(mapping.connectionMessage).toMatch(/Nothing was created, pushed, or merged/);
    expect(git(repo, ["remote"]).trim()).toBe("");
    expect(await db.publishedChange.count({ where: { productId: product.id } })).toBe(0);
    expect(await db.pullRequestRecord.count({ where: { productId: product.id } })).toBe(0);
    expect(JSON.stringify(mapping)).not.toContain("github_pat_accountwide");
    setInstallationDirectoryForTests({
      async list() {
        return [];
      },
    });
    const revoked = await checkInstallationRepository("octocat", "betmyfriend");
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.message).toMatch(/cannot access this repository/);
    expect(() => assertInstallationOperational({ suspended_at: "2026-10-21T00:00:00Z" })).toThrow(/suspended/);
    expect(() => assertInstallationOperational({ suspended_at: null })).not.toThrow();
  });
});
