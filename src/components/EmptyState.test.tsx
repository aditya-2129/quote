import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@components/EmptyState";

describe("EmptyState Component Alias Proof", () => {
  it("successfully resolves @components alias and renders EmptyState", () => {
    render(<EmptyState text="No items found" />);
    const element = screen.getByText("No items found");
    expect(element).toBeTruthy();
  });
});
