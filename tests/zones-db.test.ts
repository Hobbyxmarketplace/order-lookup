import { describe, it, expect, beforeAll } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();

const {
  bootstrapDefaultZoneIfEmpty,
  createZone,
  listZones,
  getZone,
  getDefaultZone,
  renameZone,
  setDefaultZone,
  deleteZoneWithMigration,
  assignInvoice,
  assignInvoicesBulk,
  getZoneForInvoice,
  getZonesForInvoices,
} = await import("../server/db/zones.js");

beforeAll(() => {
  bootstrapDefaultZoneIfEmpty();
});

describe("zones bootstrap", () => {
  it("seeds a single default 'Zone A'", () => {
    const zs = listZones();
    expect(zs).toHaveLength(1);
    expect(zs[0].name).toBe("Zone A");
    expect(zs[0].is_default).toBe(1);
    expect(zs[0].invoice_count).toBe(0);
  });

  it("bootstrap is idempotent", () => {
    bootstrapDefaultZoneIfEmpty();
    expect(listZones()).toHaveLength(1);
  });
});

describe("zones CRUD", () => {
  it("creates a new zone", () => {
    const z = createZone("Zone B");
    expect(z.name).toBe("Zone B");
    expect(z.is_default).toBe(0);
    expect(listZones()).toHaveLength(2);
  });

  it("rejects blank names", () => {
    expect(() => createZone("   ")).toThrow(/required/i);
    expect(() => createZone("")).toThrow(/required/i);
  });

  it("rejects names > 60 chars", () => {
    expect(() => createZone("A".repeat(61))).toThrow(/too long/i);
  });

  it("enforces case-insensitive uniqueness", () => {
    expect(() => createZone("zone b")).toThrow(/UNIQUE|constraint/i);
    expect(() => createZone("ZONE B")).toThrow(/UNIQUE|constraint/i);
  });

  it("renames a zone", () => {
    const b = listZones().find((z) => z.name === "Zone B")!;
    renameZone(b.id, "Back shelf");
    expect(getZone(b.id)!.name).toBe("Back shelf");
  });

  it("renameZone throws for unknown id", () => {
    expect(() => renameZone(999, "x")).toThrow(/not found/i);
  });
});

describe("default zone singleton", () => {
  it("setDefaultZone flips default atomically", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    setDefaultZone(back.id);
    const zs = listZones();
    const defaults = zs.filter((z) => z.is_default === 1);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Back shelf");
    expect(getDefaultZone().name).toBe("Back shelf");
  });

  it("setting default on unknown id throws", () => {
    expect(() => setDefaultZone(999)).toThrow(/not found/i);
  });

  it("restores default to Zone A for later tests", () => {
    const a = listZones().find((z) => z.name === "Zone A")!;
    setDefaultZone(a.id);
    expect(getDefaultZone().name).toBe("Zone A");
  });
});

describe("invoice assignment", () => {
  it("unassigned invoice resolves to default", () => {
    const z = getZoneForInvoice("H999999");
    expect(z.name).toBe("Zone A");
  });

  const CTX = { actorUser: "test", actorIp: "127.0.0.1", userAgent: "vitest" };

  it("assignInvoice writes and reads back", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    assignInvoice("H136260", back.id, CTX);
    expect(getZoneForInvoice("H136260").name).toBe("Back shelf");
  });

  it("assignInvoice is case-insensitive on invoice number", () => {
    expect(getZoneForInvoice("h136260").name).toBe("Back shelf");
  });

  it("assignInvoice upserts (moving an invoice)", () => {
    const a = listZones().find((z) => z.name === "Zone A")!;
    assignInvoice("H136260", a.id, CTX);
    expect(getZoneForInvoice("H136260").name).toBe("Zone A");
  });

  it("assignInvoice throws on invalid zone", () => {
    expect(() => assignInvoice("H1", 999, CTX)).toThrow(/not found/i);
  });

  it("assignInvoicesBulk moves many at once", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    const r = assignInvoicesBulk(
      ["H100001", "H100002", "H100003"],
      back.id,
      CTX
    );
    expect(r.updated).toBe(3);
    const map = getZonesForInvoices(["H100001", "H100002", "H100003"]);
    expect(map.size).toBe(3);
    for (const z of map.values()) expect(z.name).toBe("Back shelf");
  });

  it("bulk assignment updates invoice_count on listZones", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    expect(back.invoice_count).toBe(3);
  });
});

describe("delete with migration", () => {
  it("refuses to delete default zone", () => {
    const a = listZones().find((z) => z.name === "Zone A")!;
    const back = listZones().find((z) => z.name === "Back shelf")!;
    expect(() => deleteZoneWithMigration(a.id, back.id)).toThrow(
      /default/i
    );
  });

  it("refuses if migration target = deleted zone", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    expect(() => deleteZoneWithMigration(back.id, back.id)).toThrow(/differ/i);
  });

  it("refuses if migration target missing", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    expect(() => deleteZoneWithMigration(back.id, 999)).toThrow(/not found/i);
  });

  it("migrates invoices then deletes the zone (atomic)", () => {
    const back = listZones().find((z) => z.name === "Back shelf")!;
    const a = listZones().find((z) => z.name === "Zone A")!;
    deleteZoneWithMigration(back.id, a.id);

    // zone gone
    expect(getZone(back.id)).toBeUndefined();

    // 3 invoices now in Zone A
    const map = getZonesForInvoices(["H100001", "H100002", "H100003"]);
    for (const z of map.values()) expect(z.name).toBe("Zone A");
  });

  it("allows recreating a zone with the same name after hard delete", () => {
    const z = createZone("Back shelf");
    expect(z.name).toBe("Back shelf");
  });
});
