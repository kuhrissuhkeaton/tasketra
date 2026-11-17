// @vitest-environment jsdom
//
// The risk matrix (v160, F-17): the 3x3 band grid stays, but its axes name
// the 1-5 score ranges the bands cover and its chips carry the numeric
// scores, so the visual agrees with the register's P x I scoring. Chips
// never render a (truncatable) title; the title is the tooltip.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { RiskMatrix } from "../components/RiskMatrix";

let container: HTMLDivElement; let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const RISKS = [
  // Scored P2 x I5: bands derive to low probability / high impact.
  { title: "SSO approval slips and frees two weeks of vendor time", probability: "low" as const, impact: "high" as const, probability_score: 2, impact_score: 5 },
  // Unscored legacy risk: bands only.
  { title: "Vendor developers unavailable", probability: "high" as const, impact: "medium" as const, probability_score: null, impact_score: null },
];

describe("RiskMatrix", () => {
  it("labels both axes with the score ranges the bands cover", async () => {
    await act(async () => { root.render(<RiskMatrix risks={RISKS} />); });
    const labels = [...container.querySelectorAll(".risk-matrix-col-label, .risk-matrix-row-label")].map((e) => e.textContent);
    expect(labels).toContain("Low (1–2)");
    expect(labels).toContain("Medium (3)");
    expect(labels).toContain("High (4–5)");
  });

  it("a scored risk's chip carries its numbers in the register's format, with the title as the tooltip", async () => {
    await act(async () => { root.render(<RiskMatrix risks={RISKS} />); });
    const chips = [...container.querySelectorAll(".risk-matrix-chip")];
    const scored = chips.find((c) => c.textContent?.includes("Score"));
    expect(scored?.textContent).toBe("P2 · I5 · Score 10");
    expect(scored?.getAttribute("title")).toBe("SSO approval slips and frees two weeks of vendor time");
  });

  it("an unscored risk's chip carries its bands, never its title text", async () => {
    await act(async () => { root.render(<RiskMatrix risks={RISKS} />); });
    const chips = [...container.querySelectorAll(".risk-matrix-chip")];
    const unscored = chips.find((c) => c.getAttribute("title") === "Vendor developers unavailable");
    expect(unscored?.textContent).toBe("P High · I Medium");
    for (const c of chips) expect(c.textContent).not.toContain("Vendor developers");
  });

  it("keeps the per-cell count and the +N more rollup", async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `Risk ${i + 1}`, probability: "low" as const, impact: "low" as const,
      probability_score: 1, impact_score: 1,
    }));
    await act(async () => { root.render(<RiskMatrix risks={many} />); });
    const cell = container.querySelector(".risk-matrix-cell-low")!;
    expect(cell.querySelector(".risk-matrix-cell-count")?.textContent).toBe("6");
    const chips = [...cell.querySelectorAll(".risk-matrix-chip")];
    expect(chips).toHaveLength(5); // chipLimit 4 + the rollup
    expect(chips[4].textContent).toBe("+2 more");
  });
});
