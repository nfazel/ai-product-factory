import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env" });
process.env.AI_SELECTION_DISABLE_STORE = "1";

vi.mock("server-only", () => ({}));
