import { describe, expect, it } from "vitest";

import { assertTestDatabaseName, databaseName, resolveTestDatabaseUrl } from "./test-database";

const MAIN = "postgresql://apf:secret@127.0.0.1:5433/ai_product_factory?schema=public";

describe("the separate test database", () => {
  it("is derived from the builder database by adding _test, keeping host, role and options", () => {
    const url = resolveTestDatabaseUrl({ DATABASE_URL: MAIN });
    expect(databaseName(url)).toBe("ai_product_factory_test");
    expect(url).toContain("127.0.0.1:5433");
    expect(url).toContain("apf:secret@");
    expect(url).toContain("schema=public");
  });
  it("is stable: a URL that already names a test database is kept, not suffixed again", () => {
    const once = resolveTestDatabaseUrl({ DATABASE_URL: MAIN });
    expect(databaseName(resolveTestDatabaseUrl({ DATABASE_URL: once }))).toBe("ai_product_factory_test");
  });
  it("uses TEST_DATABASE_URL when it is set and named as a test database", () => {
    const explicit = "postgresql://apf:secret@127.0.0.1:5433/other_test";
    expect(resolveTestDatabaseUrl({ DATABASE_URL: MAIN, TEST_DATABASE_URL: explicit })).toBe(explicit);
    expect(databaseName(resolveTestDatabaseUrl({ DATABASE_URL: MAIN, TEST_DATABASE_URL: "postgresql://a:b@h/apf_bmf_clone" }))).toBe("apf_bmf_clone");
  });
  it("refuses the builder database, any name without the test suffix, and a missing name", () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: MAIN, TEST_DATABASE_URL: MAIN })).toThrow(/Refusing to run tests/);
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgresql://a:b@h:5433/products" })).toThrow(/Refusing/);
    expect(() => assertTestDatabaseName("ai_product_factory")).toThrow(/ending in _test/);
    expect(() => assertTestDatabaseName("")).toThrow(/Refusing/);
    expect(() => assertTestDatabaseName("my_test_data")).toThrow();
  });
  it("is what every test in this run actually uses, never the builder database", () => {
    expect(databaseName(process.env.DATABASE_URL ?? "")).toMatch(/(?:_test|_clone)$/);
    expect(databaseName(process.env.DATABASE_URL ?? "")).not.toBe("ai_product_factory");
  });
  it("needs some database to locate", () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
