import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const {
  parseServiceLevel,
  extractCompany,
  extractService,
  extractQuantity,
  formatItems,
} = await import("../server/lib/serviceLevel.js");
const { buildShipmentFromGroup } = await import("../server/lib/shipment.js");

describe("parseServiceLevel — company", () => {
  it("extracts PSA", () => {
    expect(extractCompany("PSA - Value Bulk (Amount: 285.00 HKD, Quantity: 1)")).toBe("PSA");
  });
  it("extracts BGS", () => {
    expect(extractCompany("BGS - Standard (Subgrades) (Amount: 520.00 HKD, Quantity: 1)")).toBe("BGS");
  });
  it("extracts CGC", () => {
    expect(extractCompany("CGC - Economy (Amount: 170.00 HKD, Quantity: 1)")).toBe("CGC");
  });
  it("extracts GEA", () => {
    expect(extractCompany("GEA - Bulk (Amount: 100.00 HKD, Quantity: 1)")).toBe("GEA");
  });
  it("returns Unknown when the string has no ' - ' delimiter", () => {
    expect(extractCompany("TCG Bulk (Amount: 230.00 HKD, Quantity: 1)")).toBe("Unknown");
  });
  it("returns Unknown for null / empty", () => {
    expect(extractCompany(null)).toBe("Unknown");
    expect(extractCompany("")).toBe("Unknown");
    expect(extractCompany("Total: 0.00")).toBe("Unknown");
  });
  it("only reads the first line (multi-line orders share the same company)", () => {
    expect(extractCompany("BGS - Base (...)\nBGS - Standard (...)")).toBe("BGS");
  });
});

describe("parseServiceLevel — service name", () => {
  it("extracts single word", () => {
    expect(extractService("PSA - Regular (Amount: 900.00 HKD)")).toBe("Regular");
  });
  it("extracts multi-word", () => {
    expect(extractService("PSA - Value Bulk Special (Amount: 210.00 HKD)")).toBe("Value Bulk Special");
  });
  it("extracts service with parens in the name", () => {
    expect(extractService("BGS - Standard (Subgrades) (Amount: 520.00 HKD)")).toBe("Standard");
    // Note: everything before the FIRST '(' — Subgrades is dropped. Consistent
    // with the plan (name displayed cleanly on the card).
  });
  it("extracts CJK names", () => {
    expect(extractService("GEA - Kouki Saitou 春天 (Amount: 200.00 HKD)")).toBe("Kouki Saitou 春天");
  });
  it("returns null when no delimiter", () => {
    expect(extractService("Total: 0.00")).toBe(null);
    expect(extractService(null)).toBe(null);
  });
});

describe("parseServiceLevel — quantity", () => {
  it("English Quantity: 1", () => {
    expect(extractQuantity("PSA - Value Bulk (Amount: 285.00 HKD, Quantity: 1)\nTotal: 285.00 HKD")).toBe(1);
  });
  it("English Quantity: 47", () => {
    expect(extractQuantity("PSA - Value Bulk (Amount: 285.00 HKD, Quantity: 47)")).toBe(47);
  });
  it("Special Quantity variant", () => {
    expect(extractQuantity("PSA - Reholder (Amount: 580.00 HKD, Special Quantity: 3)")).toBe(3);
  });
  it("Chinese 數量", () => {
    expect(extractQuantity("PSA - Reholder 100000 (Amount: 3,580.00 HKD, 數量: 2)")).toBe(2);
  });
  it("Chinese 數量 with full-width colon", () => {
    expect(extractQuantity("PSA - Reholder 100000 (Amount: 3,580.00 HKD, 數量:2)")).toBe(2);
  });
  it("multi-line sums quantities", () => {
    const raw =
      "PSA - Value Bulk (Amount: 260.00, Quantity: 4)\n" +
      "PSA - Value Plus (Amount: 520.00, Quantity: 1)\n" +
      "Total: 1560.00 HKD";
    expect(extractQuantity(raw)).toBe(5);
  });
  it("returns null when no quantity present", () => {
    expect(extractQuantity("Total: 0.00")).toBe(null);
    expect(extractQuantity(null)).toBe(null);
    expect(extractQuantity("")).toBe(null);
  });
});

describe("parseServiceLevel — combined", () => {
  it("returns all three fields for a typical BGS row", () => {
    const raw = "BGS - Standard (Subgrades) (Amount: 520.00 HKD, Quantity: 3)\nTotal: 1560.00 HKD";
    expect(parseServiceLevel(raw)).toEqual({
      company: "BGS",
      service: "Standard",
      quantity: 3,
    });
  });
  it("degrades gracefully for the empty-total row", () => {
    expect(parseServiceLevel("Total: 0.00")).toEqual({
      company: "Unknown",
      service: null,
      quantity: null,
    });
  });
});

describe("formatItems", () => {
  it("pluralizes correctly", () => {
    expect(formatItems(0)).toBe("0 items");
    expect(formatItems(1)).toBe("1 item");
    expect(formatItems(2)).toBe("2 items");
    expect(formatItems(303)).toBe("303 items");
    expect(formatItems(null)).toBe("— items");
    expect(formatItems(undefined as any)).toBe("— items");
  });
});

describe("buildShipmentFromGroup", () => {
  it("numeric 1..3 -> ordinal shipment", () => {
    expect(buildShipmentFromGroup("#1", 2026, 8)).toBe("Aug 26 - 1st Shipment");
    expect(buildShipmentFromGroup("#2", 2026, 8)).toBe("Aug 26 - 2nd Shipment");
    expect(buildShipmentFromGroup("#3", 2026, 8)).toBe("Aug 26 - 3rd Shipment");
  });
  it("accepts code without leading #", () => {
    expect(buildShipmentFromGroup("1", 2025, 12)).toBe("Dec 25 - 1st Shipment");
  });
  it("decimal -> Special Shipment", () => {
    expect(buildShipmentFromGroup("#1.5", 2026, 6)).toBe("Jun 26 - Special Shipment");
  });
  it("named codes pass through", () => {
    expect(buildShipmentFromGroup("#Grade10", 2026, 11)).toBe("Nov 26 - Grade10");
    expect(buildShipmentFromGroup("#Comic Con", 2026, 8)).toBe("Aug 26 - Comic Con");
  });
  it("empty / invalid inputs -> empty string", () => {
    expect(buildShipmentFromGroup(null, 2026, 8)).toBe("");
    expect(buildShipmentFromGroup("#1", null, 8)).toBe("");
    expect(buildShipmentFromGroup("#1", 2026, null)).toBe("");
    expect(buildShipmentFromGroup("#1", 2026, 13)).toBe("");
    expect(buildShipmentFromGroup("", 2026, 8)).toBe("");
    expect(buildShipmentFromGroup("#", 2026, 8)).toBe("");
  });
});
