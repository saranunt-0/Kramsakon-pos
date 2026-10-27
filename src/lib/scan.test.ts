import { describe, expect, it } from "vitest";
import { KEDMANEE, normalizeScan } from "./scan";

describe("normalizeScan", () => {
  it("leaves normal scans alone apart from trimming and upper-casing", () => {
    expect(normalizeScan(" ks000123\n")).toBe("KS000123");
    expect(normalizeScan("KS-SCARF-1")).toBe("KS-SCARF-1");
    expect(normalizeScan("8850123456789")).toBe("8850123456789");
  });

  it("undoes the Thai keyboard layout", () => {
    // KS000123 typed with the Thai layout active (shift held for K and S)
    expect(normalizeScan("ษฆจจจๅ/-")).toBe("KS000123");
    // an EAN-13 barcode typed in Thai mode
    expect(normalizeScan("คคถจๅ/-ภถุึคต")).toBe("8850123456789");
    // lower-case letters come out unshifted
    expect(normalizeScan("าหจจๅ")).toBe("KS001");
    // dashes in our codes come from the "-" key, which is "ข" in Thai mode
    expect(normalizeScan("ษฆขฆฉฟฮ")).toBe("KS-SCAV");
  });

  it("has a one-to-one key table", () => {
    const thai = KEDMANEE.map(([t]) => t);
    const us = KEDMANEE.map(([, u]) => u);
    expect(new Set(thai).size).toBe(thai.length);
    expect(new Set(us).size).toBe(us.length);
  });
});
