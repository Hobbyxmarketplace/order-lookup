import { describe, it, expect } from "vitest";
import { primeEnv } from "./helpers/setup";

primeEnv();
const { formatShipmentLabel } = await import("../server/lib/shipment.js");

describe("formatShipmentLabel", () => {
  describe("numeric PSA labels", () => {
    it("PSA #1 6/2026 → Jun 26 - 1st Shipment", () => {
      expect(formatShipmentLabel("PSA #1 6/2026")).toBe(
        "Jun 26 - 1st Shipment"
      );
    });
    it("PSA #2 6/2026 → Jun 26 - 2nd Shipment", () => {
      expect(formatShipmentLabel("PSA #2 6/2026")).toBe(
        "Jun 26 - 2nd Shipment"
      );
    });
    it("PSA #3 6/2026 → Jun 26 - 3rd Shipment", () => {
      expect(formatShipmentLabel("PSA #3 6/2026")).toBe(
        "Jun 26 - 3rd Shipment"
      );
    });
    it("PSA #11 6/2026 → Jun 26 - 11th Shipment", () => {
      expect(formatShipmentLabel("PSA #11 6/2026")).toBe(
        "Jun 26 - 11th Shipment"
      );
    });
    it("PSA #21 6/2026 → Jun 26 - 21st Shipment", () => {
      expect(formatShipmentLabel("PSA #21 6/2026")).toBe(
        "Jun 26 - 21st Shipment"
      );
    });
    it("bare #1 6/2026 → Jun 26 - 1st Shipment", () => {
      expect(formatShipmentLabel("#1 6/2026")).toBe("Jun 26 - 1st Shipment");
    });
    it("decimal shipment number → Special Shipment", () => {
      expect(formatShipmentLabel("PSA #1.5 6/2026")).toBe(
        "Jun 26 - Special Shipment"
      );
    });
  });

  describe("grade labels (Grade path)", () => {
    it("PSA #Grade10 11/2025 → Nov 25 - Grade10", () => {
      expect(formatShipmentLabel("PSA #Grade10 11/2025")).toBe(
        "Nov 25 - Grade10"
      );
    });
    it("PSA #Grade9 4/2026 → Apr 26 - Grade9", () => {
      expect(formatShipmentLabel("PSA #Grade9 4/2026")).toBe("Apr 26 - Grade9");
    });
  });

  describe("named PSA labels", () => {
    it("PSA #ComicCon 6/2026 → Jun 26 - ComicCon", () => {
      expect(formatShipmentLabel("PSA #ComicCon 6/2026")).toBe(
        "Jun 26 - ComicCon"
      );
    });
    it("#ComicCon 6/2026 → Jun 26 - ComicCon", () => {
      expect(formatShipmentLabel("#ComicCon 6/2026")).toBe("Jun 26 - ComicCon");
    });
    it("ComicCon 6/2026 → Jun 26 - ComicCon", () => {
      expect(formatShipmentLabel("ComicCon 6/2026")).toBe("Jun 26 - ComicCon");
    });
  });

  describe("month-year first format", () => {
    it("6/2026 - Comic Con → Jun 26 - Comic Con", () => {
      expect(formatShipmentLabel("6/2026 - Comic Con")).toBe(
        "Jun 26 - Comic Con"
      );
    });
    it("12/2025 - Special Event → Dec 25 - Special Event", () => {
      expect(formatShipmentLabel("12/2025 - Special Event")).toBe(
        "Dec 25 - Special Event"
      );
    });
  });

  describe("already-formatted (pass-through with month abbrev)", () => {
    it("June 26 - 1st Shipment → Jun 26 - 1st Shipment", () => {
      expect(formatShipmentLabel("June 26 - 1st Shipment")).toBe(
        "Jun 26 - 1st Shipment"
      );
    });
    it("September 26 - Comic Con → Sep 26 - Comic Con", () => {
      expect(formatShipmentLabel("September 26 - Comic Con")).toBe(
        "Sep 26 - Comic Con"
      );
    });
  });

  describe("edge cases", () => {
    it("empty string returns empty", () => {
      expect(formatShipmentLabel("")).toBe("");
      expect(formatShipmentLabel(null)).toBe("");
      expect(formatShipmentLabel(undefined)).toBe("");
    });
    it("whitespace-only returns empty", () => {
      expect(formatShipmentLabel("   ")).toBe("");
    });
    it("trims outer whitespace", () => {
      expect(formatShipmentLabel("  PSA #1 6/2026  ")).toBe(
        "Jun 26 - 1st Shipment"
      );
    });
    it("normalizes internal whitespace in named labels", () => {
      expect(formatShipmentLabel("PSA #Comic  Con 6/2026")).toBe(
        "Jun 26 - Comic Con"
      );
    });
    it("strips trailing 'Shipment' from named", () => {
      expect(formatShipmentLabel("6/2026 - Comic Con Shipment")).toBe(
        "Jun 26 - Comic Con"
      );
    });
    it("returns opaque strings unchanged (best-effort)", () => {
      expect(formatShipmentLabel("random garbage")).toBe("random garbage");
    });
  });

  describe("month coverage", () => {
    const cases: Array<[string, string]> = [
      ["PSA #1 1/2026", "Jan 26 - 1st Shipment"],
      ["PSA #1 2/2026", "Feb 26 - 1st Shipment"],
      ["PSA #1 3/2026", "Mar 26 - 1st Shipment"],
      ["PSA #1 4/2026", "Apr 26 - 1st Shipment"],
      ["PSA #1 5/2026", "May 26 - 1st Shipment"],
      ["PSA #1 6/2026", "Jun 26 - 1st Shipment"],
      ["PSA #1 7/2026", "Jul 26 - 1st Shipment"],
      ["PSA #1 8/2026", "Aug 26 - 1st Shipment"],
      ["PSA #1 9/2026", "Sep 26 - 1st Shipment"],
      ["PSA #1 10/2026", "Oct 26 - 1st Shipment"],
      ["PSA #1 11/2026", "Nov 26 - 1st Shipment"],
      ["PSA #1 12/2026", "Dec 26 - 1st Shipment"],
    ];
    for (const [raw, want] of cases) {
      it(`${raw} → ${want}`, () => {
        expect(formatShipmentLabel(raw)).toBe(want);
      });
    }
  });
});
