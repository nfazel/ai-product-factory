import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env" });

vi.mock("server-only", () => ({}));
