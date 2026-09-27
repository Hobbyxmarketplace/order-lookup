import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const { loadSql } = await import("../server/db/read-sql.js");

describe("loadSql", () => {
  it("loads lookup-invoice.sql and strips SQL comments", () => {
    const sql = loadSql("lookup-invoice");
    expect(sql).toContain("FROM psa_certOwners");
    expect(sql).not.toContain("-- ");
    expect(sql.endsWith(";")).toBe(false);
  });

  it("caches subsequent reads", () => {
    const a = loadSql("lookup-invoice");
    const b = loadSql("lookup-invoice");
    expect(a).toBe(b);
  });

  it("loads list-ready-for-pickup-all.sql", () => {
    const sql = loadSql("list-ready-for-pickup-all");
    expect(sql).toContain("psa_hobbyx_order_pickup");
    expect(sql).not.toContain("LIMIT");
  });

  it("throws for missing file", () => {
    expect(() => loadSql("does-not-exist")).toThrow();
  });
});
