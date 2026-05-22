import { describe, it, expect } from "vitest";
import { convertStockShape } from "./stock";
import type { Stock } from "./quoteTypes";

describe("convertStockShape", () => {
  it("converts rect to round, sizing the diameter from the cross-section", () => {
    const round = convertStockShape(
      { shape: "rect", dims: { L: 200, W: 90, H: 90 } },
      "round",
    );
    expect(round.shape).toBe("round");
    expect(round.dims).toMatchObject({ D: 90, L: 200 });
  });

  it("never shrinks a new dimension to a hardcoded default", () => {
    // Regression: a Ø-less rect blank used to be reset to a tiny D=30,
    // making the stock smaller than the part (utilization > 100%).
    const round = convertStockShape(
      { shape: "rect", dims: { L: 50, W: 85, H: 60 } },
      "round",
    );
    expect(round.dims.D).toBe(85); // max(W, H) — not the old 30 default
  });

  it("converts round to rect with a square cross-section", () => {
    const rect = convertStockShape(
      { shape: "round", dims: { D: 50, L: 120 } },
      "rect",
    );
    expect(rect.shape).toBe("rect");
    expect(rect.dims).toMatchObject({ L: 120, W: 50, H: 50 });
  });

  it("converts hex to round, carrying across-flats into the diameter", () => {
    const round = convertStockShape(
      { shape: "hex", dims: { AF: 24, L: 80 } },
      "round",
    );
    expect(round.dims).toMatchObject({ D: 24, L: 80 });
  });

  it("retains a non-square rectangle across rect → round → rect", () => {
    // Round/hex have a single cross-section dimension, but rect's W and H
    // live on distinct keys that ride along, so the toggle is lossless.
    const rect: Stock = { shape: "rect", dims: { L: 200, W: 90, H: 40 } };
    const back = convertStockShape(convertStockShape(rect, "round"), "rect");
    expect(back.shape).toBe("rect");
    expect(back.dims).toMatchObject({ L: 200, W: 90, H: 40 });
  });

  it("retains app-detected round dimensions across round → rect → round", () => {
    const detected: Stock = { shape: "round", dims: { D: 85.4, L: 49.93 } };
    const back = convertStockShape(
      convertStockShape(detected, "rect"),
      "round",
    );
    expect(back.dims).toMatchObject({ D: 85.4, L: 49.93 });
  });

  it("retains values across any shape path (rect → round → hex → rect)", () => {
    const rect: Stock = { shape: "rect", dims: { L: 200, W: 90, H: 40 } };
    const back = convertStockShape(
      convertStockShape(convertStockShape(rect, "round"), "hex"),
      "rect",
    );
    expect(back.dims).toMatchObject({ L: 200, W: 90, H: 40 });
  });

  it("keeps a user-edited dimension across a shape round trip", () => {
    // App detects rect; the user edits H to a custom value, then toggles
    // the shape away and back — the edited value must survive.
    const edited: Stock = { shape: "rect", dims: { L: 200, W: 90, H: 55 } };
    const back = convertStockShape(
      convertStockShape(edited, "hex"),
      "rect",
    );
    expect(back.dims).toMatchObject({ L: 200, W: 90, H: 55 });
  });
});
