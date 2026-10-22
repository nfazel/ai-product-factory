import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { commandFailureIsEnvironment, PRISMA_VALIDATE_PLACEHOLDER, validationProcessEnvironment } from "@/modules/coding/bootstrap";
import { safeCommandOutput } from "@/modules/coding/command-output";
import { runProcess } from "@/modules/coding/git";

const builder = "postgresql://apf:apf_dev_password@127.0.0.1:5432/ai_product_factory";

describe("verification command environment", () => {
  it("validates a Prisma schema with a process-only placeholder and does not write it", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-prisma-validate-"));
    fs.mkdirSync(path.join(root, "prisma"));
    fs.writeFileSync(
      path.join(root, "prisma/schema.prisma"),
      `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\nmodel Note {\n  id String @id\n}\n`,
    );
    const environment = validationProcessEnvironment("npx prisma validate", builder, root);
    expect(environment.env.DATABASE_URL).toBe(PRISMA_VALIDATE_PLACEHOLDER);
    expect(environment.env.DATABASE_URL).not.toBe(builder);
    expect(environment.note).not.toContain("apf_dev_password");
    expect(environment.note).not.toContain("postgresql://");
    const check = [
      "node",
      "-e",
      "const fs=require('fs'); const schema=fs.readFileSync('prisma/schema.prisma','utf8'); if(/env\\(\\s*[\"']DATABASE_URL[\"']\\s*\\)/.test(schema) && !process.env.DATABASE_URL){ console.error('Environment variable not found: DATABASE_URL.'); process.exit(1);} if(String(process.env.DATABASE_URL).includes('apf_dev_password')) process.exit(2); console.log('The schema at prisma/schema.prisma is valid');",
    ];
    const result = await runProcess(check, root, 30_000, environment.env);
    const bare = await runProcess(check, root, 30_000, {});
    expect(result.code).toBe(0);
    expect(bare.code).toBe(1);
    expect(commandFailureIsEnvironment(bare.stderr)).toBe(true);
    expect(fs.existsSync(path.join(root, ".env"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")).not.toContain(PRISMA_VALIDATE_PLACEHOLDER);
    const stored = safeCommandOutput(result.stdout, `${result.stderr}\nDATABASE_URL=${builder}`);
    expect(stored).not.toContain("apf_dev_password");
    expect(stored).not.toContain(builder);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("passes NODE_ENV=production to a Next.js build process", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-next-build-env-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { next: "14.2.3" }, scripts: { build: "next build" } }));
    const environment = validationProcessEnvironment("npm run build", builder, root);
    const result = await runProcess(["node", "-e", "process.stdout.write(process.env.NODE_ENV || '')"], root, 10_000, environment.env);
    expect(result.stdout).toBe("production");
    expect(JSON.stringify(environment.env)).not.toContain("apf_dev_password");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("classifies a missing verification environment as not an implementation defect", () => {
    expect(commandFailureIsEnvironment("error: Environment variable not found: DATABASE_URL.")).toBe(true);
    expect(commandFailureIsEnvironment('You are using a non-standard "NODE_ENV" value in your environment.')).toBe(true);
    expect(commandFailureIsEnvironment("Type error: Property missing does not exist.")).toBe(false);
  });
});
