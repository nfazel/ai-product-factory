import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { describeAIConfiguration, rememberAISelection } from "@/modules/ai/config";
import { saveAISelection, selectionId } from "@/modules/ai/selection";

const SECRET = "sk-live-openai-secret-value-xyz";
const ENDPOINT_SECRET = "http://admin:secret-token@10.1.1.1:11434";

describe("AI selection store", () => {
  const previousFlag = process.env.AI_SELECTION_DISABLE_STORE;
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  };
  let previous: { provider: string; model: string; updatedBy: string } | null = null;
  let existingChangeIds: string[] = [];
  let manageSelection = false;

  afterEach(async () => {
    process.env.AI_SELECTION_DISABLE_STORE = previousFlag;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (manageSelection) {
      const current = await db.aiSelectionChange.findMany({ select: { id: true } });
      const created = current.map((row) => row.id).filter((id) => !existingChangeIds.includes(id));
      if (created.length > 0) {
        await db.aiSelectionChange.deleteMany({ where: { id: { in: created } } });
      }
      if (previous) {
        await db.aiSelection.upsert({
          where: { id: selectionId() },
          create: { id: selectionId(), ...previous },
          update: previous,
        });
      } else {
        await db.aiSelection.delete({ where: { id: selectionId() } }).catch(() => undefined);
      }
    }
    manageSelection = false;
    previous = null;
    existingChangeIds = [];
    rememberAISelection(null);
  });

  async function enableStore() {
    manageSelection = true;
    previous = await db.aiSelection.findUnique({
      where: { id: selectionId() },
      select: { provider: true, model: true, updatedBy: true },
    });
    existingChangeIds = (await db.aiSelectionChange.findMany({ select: { id: true } })).map((row) => row.id);
    delete process.env.AI_SELECTION_DISABLE_STORE;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
  }

  it("records a human provider and model change without credentials", async () => {
    await enableStore();
    process.env.OPENAI_API_KEY = SECRET;
    const saved = await saveAISelection({ provider: "openai", model: "gpt-4.1-mini", actor: "Local user" });
    expect(saved.recorded).toBe(true);
    const row = await db.aiSelection.findUnique({ where: { id: selectionId() } });
    expect(row).toMatchObject({ provider: "OPENAI", model: "gpt-4.1-mini", updatedBy: "Local user" });
    expect(JSON.stringify(row)).not.toContain(SECRET);
    const changes = await db.aiSelectionChange.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
    expect(JSON.stringify(changes)).not.toContain(SECRET);

    const again = await saveAISelection({ provider: "OLLAMA", model: "llama3.2", actor: "Local user" });
    expect(again.recorded).toBe(true);
    const history = await db.aiSelectionChange.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
    const descriptions = history.map((change) => change.description);
    expect(descriptions).toContain("AI provider changed from OpenAI to Ollama");
    expect(descriptions).toContain("AI model changed from gpt-4.1-mini to llama3.2");
    expect(describeAIConfiguration()).toMatchObject({ providerId: "OLLAMA", model: "llama3.2", source: "settings" });
  });

  it("ignores browser attempts to set an endpoint or a key", async () => {
    await enableStore();
    process.env.OPENAI_API_KEY = SECRET;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    const submitted = {
      provider: "OPENAI",
      model: "gpt-4.1-mini",
      apiKey: SECRET,
      baseUrl: ENDPOINT_SECRET,
      endpoint: ENDPOINT_SECRET,
    };
    await saveAISelection({
      provider: submitted.provider,
      model: submitted.model,
      actor: "Local user",
    });
    expect(process.env.OPENAI_API_KEY).toBe(SECRET);
    expect(process.env.OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434");
    const row = await db.aiSelection.findUnique({ where: { id: selectionId() } });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(ENDPOINT_SECRET);
    expect(serialized).not.toContain("baseUrl");
    const action = readFileSync(path.join(process.cwd(), "src/server/actions/ai-configuration.ts"), "utf8");
    expect(action).toMatch(/provider: values\.provider/);
    expect(action).toMatch(/model: values\.model/);
    expect(action).not.toMatch(/values\.(apiKey|baseUrl|endpoint|key|secret)/);
    expect(action).not.toMatch(/process\.env\.[A-Z0-9_]+\s*=/);
  });
});
