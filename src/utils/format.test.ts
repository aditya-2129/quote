import { describe, it, expect } from "vitest";
import { fmtINR, fmtMin } from "@utils/format";

describe("format utilities", () => {
  it("formats Indian Rupees with currency symbol and correct decimals", () => {
    const formatted = fmtINR(100);
    expect(formatted).toContain("₹");
    expect(formatted).toContain("100.00");
  });

  it("formats minutes", () => {
    const formatted = fmtMin(5.5);
    expect(formatted).toBe("5.5");
  });
});
