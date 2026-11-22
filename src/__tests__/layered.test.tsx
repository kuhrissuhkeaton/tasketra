// @vitest-environment jsdom
//
// v172 layered primitives: summary cards, collapsible groups with
// remembered state, the teaching disclosure, and the density preference.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { StatCards, StatCard, LayerGroup, HowItWorks, TeachEmpty } from "../components/Layered";
import { readDensity, writeDensity, initDensity } from "../lib/density";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(node: React.ReactNode) {
  act(() => {
    root?.render(<MemoryRouter>{node}</MemoryRouter>);
  });
}

describe("Layered primitives", () => {
  it("renders stat cards with label, value and sub", () => {
    render(
      <StatCards>
        <StatCard label="High" value="6" sub="Needs attention" tone="bad" />
      </StatCards>,
    );
    expect(host?.textContent).toContain("6");
    expect(host?.textContent).toContain("Needs attention");
  });

  it("collapses a layer group and remembers it", () => {
    render(
      <LayerGroup id="test-group" title="Medium" count={11}>
        <p>group body</p>
      </LayerGroup>,
    );
    expect(host?.textContent).toContain("group body");
    const btn = host?.querySelector(".layer-group-btn") as HTMLButtonElement;
    act(() => btn.click());
    expect(host?.textContent).not.toContain("group body");
    expect(window.localStorage.getItem("tasketra:layer:test-group")).toBe("0");
  });

  it("keeps teaching text hidden until the disclosure is opened", () => {
    render(
      <HowItWorks label="How risks work" article="risks">
        <p>The quiet explanation.</p>
      </HowItWorks>,
    );
    expect(host?.textContent).not.toContain("The quiet explanation.");
    const btn = host?.querySelector(".layer-how-btn") as HTMLButtonElement;
    act(() => btn.click());
    expect(host?.textContent).toContain("The quiet explanation.");
    expect(host?.querySelector(".layer-how-link")?.getAttribute("href")).toBe(
      "/app/resources?article=risks",
    );
  });

  it("teaching empty state offers its action", () => {
    const onAction = vi.fn();
    render(
      <TeachEmpty
        title="No risks yet"
        body="A risk is something that might happen."
        actionLabel="Add your first risk"
        onAction={onAction}
      />,
    );
    expect(host?.textContent).toContain("No risks yet");
    const btn = [...(host?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes("Add your first risk"),
    ) as HTMLButtonElement;
    act(() => btn.click());
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe("density preference", () => {
  it("defaults to comfortable and persists compact", () => {
    expect(readDensity()).toBe("comfortable");
    writeDensity("compact");
    expect(readDensity()).toBe("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(initDensity()).toBe("compact");
    writeDensity("comfortable");
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });
});
