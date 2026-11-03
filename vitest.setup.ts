import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env" });
process.env.AI_SELECTION_DISABLE_STORE = "1";
// Local proof-of-concept switches in .env must not change what tests expect: operator confirmation is required by default.
delete process.env.OPERATOR_CONFIRMATION;
delete process.env.APF_RUNTIME_IDENTITY;

vi.mock("server-only", () => ({}));
