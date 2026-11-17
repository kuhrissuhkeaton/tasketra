// @vitest-environment jsdom
//
// The v164 shared visual kit (src/components/charts/): the gauge, donut and
// variance bars the dashboard phases share. These pin the kit rules --
// every percent carries words, red/amber only on over items, categorical
// colors on the donut -- at the component level.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { Gauge } from "../components/charts/Gauge";
import { Donut } from "../components/charts/Donut";
import { VarianceBars } from "../components/charts/VarianceBars";
import { categoricalColor, CATEGORICAL_PALETTE } from "../components/charts/palette";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(el: React.ReactNode) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
}

describe("Gauge", () => {
  it("shows the label, the big number and the x-of-y words, with the arc at the given percent", async () => {
    await render(<Gauge label="Portfolio completion" percent={25} tone="brand" value="25%" words="3 of 12 tasks done" />);
    expect(container.textContent).toContain("Portfolio completion");
    expect(container.textContent).toContain("25%");
    expect(container.textContent).toContain("3 of 12 tasks done");
    const arc = container.querySelectorAll("path")[1];
    expect(arc.getAttribute("stroke-dasharray")).toBe("25 100");
    // The accessible name carries the words too, never a bare number.
    expect(container.querySelector(".kit-gauge")?.getAttribute("aria-label")).toBe("Portfolio completion: 25%, 3 of 12 tasks done");
  });

  it("clamps the arc at 100 while the number stays honest", async () => {
    await render(<Gauge label="Budget used" percent={115} tone="crit" value="115%" words="$9,200 of $8,000 spent" />);
    const arc = container.querySelectorAll("path")[1];
    expect(arc.getAttribute("stroke-dasharray")).toBe("100 100");
    expect(arc.getAttribute("stroke")).toBe("var(--chart-crit)");
    expect(container.textContent).toContain("115%");
  });
});

describe("Donut", () => {
  it("lists every segment with its count and percent in words", async () => {
    await render(
      <Donut
        segments={[{ label: "On track", value: 3 }, { label: "At risk", value: 1 }]}
        colors={[categoricalColor(0), categoricalColor(1)]}
        centerValue="4"
        centerLabel="projects"
        ariaLabel="Projects by status"
      />
    );
    expect(container.textContent).toContain("3 of 4 · 75%");
    expect(container.textContent).toContain("1 of 4 · 25%");
    expect(container.textContent).toContain("projects");
  });

  it("uses the categorical palette, which shares no color with the status triad", () => {
    for (const c of CATEGORICAL_PALETTE) {
      expect(["#0ca30c", "#fab219", "#d03b3b"]).not.toContain(c.toLowerCase());
    }
    expect(categoricalColor(CATEGORICAL_PALETTE.length)).toBe(CATEGORICAL_PALETTE[0]);
  });
});

describe("VarianceBars", () => {
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;

  it("words carry planned, actual and the over amount; only over rows get the warning colors", async () => {
    await render(
      <VarianceBars
        formatValue={money}
        actualWord="Spent"
        rows={[
          { id: "a", label: "Under project", planned: 1000, actual: 900, href: "/app/projects/a?tab=budget" },
          { id: "b", label: "Slightly over", planned: 1000, actual: 1050 },
          { id: "c", label: "Well over", planned: 1000, actual: 1300 },
        ]}
      />
    );
    expect(container.textContent).toContain("Planned $1,000 · Spent $900");
    expect(container.textContent).toContain("Planned $1,000 · Spent $1,050 · $50 over");
    expect(container.textContent).toContain("Planned $1,000 · Spent $1,300 · $300 over");
    const bars = [...container.querySelectorAll(".kit-variance-bar-actual")];
    expect(bars[0].className).not.toContain("kit-variance-over");
    expect(bars[1].className).toContain("kit-variance-over");
    expect(bars[1].className).not.toContain("over-hard");
    expect(bars[2].className).toContain("kit-variance-over-hard");
  });

  it("a row with an href links through to the owning surface", async () => {
    await render(
      <VarianceBars formatValue={money} rows={[{ id: "a", label: "Website", planned: 100, actual: 90, href: "/app/projects/a?tab=budget" }]} />
    );
    const link = container.querySelector('a[href="/app/projects/a?tab=budget"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("aria-label")).toContain("Website");
    expect(link?.getAttribute("aria-label")).toContain("Planned $100");
  });
});
