import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readObservations, writeGuard } from "@/modules/verification/http/guard";

/**
 * The guard is a chokepoint, not a sandbox. These tests prove the chokepoint: a test process can reach the managed
 * application, cannot reach any other origin or port, and the requests it makes are recorded without credentials.
 */

let server: http.Server;
let port = 0;
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-guard-test-"));

beforeAll(async () => {
  server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

function runGuardedChild(script: string, observationsFile: string) {
  const guard = writeGuard(runtimeDir);
  return new Promise<{ error: Error | null; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", guard.url, "--input-type=module", "-e", script],
      {
        env: {
          PATH: process.env.PATH ?? "",
          NODE_ENV: "test",
          VERIFICATION_BASE_URL: `http://127.0.0.1:${port}`,
          VERIFICATION_OBSERVATIONS_FILE: observationsFile,
        },
        encoding: "utf8",
        timeout: 20_000,
      },
      (error: Error | null, stdout: string, stderr: string) => resolve({ error, stdout, stderr }),
    );
  });
}

const SCRIPT = `
const base = process.env.VERIFICATION_BASE_URL;
const ok = await fetch(base + "/health", { headers: { cookie: "session=SECRET-COOKIE-VALUE" } });
console.log("allowed:" + ok.status);
try {
  await fetch("http://127.0.0.1:1/elsewhere");
  console.log("foreign-fetch:allowed");
} catch (error) {
  console.log("foreign-fetch:" + error.message);
}
const net = await import("node:net");
await new Promise((resolve) => {
  const socket = net.connect(1, "127.0.0.1");
  socket.on("error", (error) => {
    console.log("foreign-tcp:" + error.message);
    resolve();
  });
});
`;

describe("verification guard", () => {
  it("lets a test reach the managed application, refuses every other origin and port, and records only method, path and status", async () => {
    const observationsFile = path.join(runtimeDir, "observations-allowed.jsonl");
    const run = await runGuardedChild(SCRIPT, observationsFile);

    expect(run.error).toBeNull();
    expect(run.stdout).toContain("allowed:200");
    expect(run.stdout).toContain("foreign-fetch:Verification guard refused");
    expect(run.stdout).toContain("foreign-tcp:Verification guard refused");

    const observations = readObservations(observationsFile);
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ method: "GET", path: "/health", status: 200 });
    // The cookie sent by the test must never reach the evidence.
    expect(fs.readFileSync(observationsFile, "utf8")).not.toContain("SECRET-COOKIE-VALUE");
  });

  it("reports refused requests to the test output so they are classified as infrastructure, not product failures", async () => {
    const observationsFile = path.join(runtimeDir, "observations-refused.jsonl");
    const run = await runGuardedChild(`await fetch("http://example.invalid/resource");`, observationsFile);
    expect(run.error).not.toBeNull();
    expect(`${run.stdout}${run.stderr}`).toContain("Verification guard refused");
    expect(readObservations(observationsFile)).toEqual([]);
  });
});

describe("readObservations", () => {
  it("skips malformed lines and keeps only the expected fields", () => {
    const file = path.join(runtimeDir, "malformed.jsonl");
    fs.writeFileSync(
      file,
      [
        "not json",
        JSON.stringify({ method: "POST", path: "/api/x", status: 201, ms: 2, at: "t", extra: "dropped" }),
        JSON.stringify({ method: "GET", path: "/missing-status" }),
        "",
      ].join("\n"),
    );
    expect(readObservations(file)).toEqual([{ method: "POST", path: "/api/x", status: 201, ms: 2, at: "t" }]);
  });

  it("returns nothing when the observations file was never written", () => {
    expect(readObservations(path.join(runtimeDir, "never-written.jsonl"))).toEqual([]);
  });
});
