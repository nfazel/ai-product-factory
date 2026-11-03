import { config } from "dotenv";
import { vi } from "vitest";

import { resolveTestDatabaseUrl } from "./src/test-support/test-database";

config({ path: ".env" });
// The suite creates and deletes records freely, so it never runs against the builder database: it gets its own, and refuses any other.
process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);
process.env.AI_SELECTION_DISABLE_STORE = "1";
// Local proof-of-concept switches in .env must not change what tests expect: operator confirmation is required by default.
delete process.env.OPERATOR_CONFIRMATION;
delete process.env.APF_RUNTIME_IDENTITY;

vi.mock("server-only", () => ({}));
