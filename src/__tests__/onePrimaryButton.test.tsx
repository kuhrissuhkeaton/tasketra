// @vitest-environment jsdom
//
// B1 one-primary-button rule: the stage checklist shows exactly one lime
// (btn-primary) button, on the first unfinished item; the rest are outlined.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

const { items } = vi.hoisted(() => ({ items: [
  { id: "a", title: "A", meta: "", status: "done", tab: "charter", action: "View" },
  { id: "b", title: "B", meta: "", status: "todo", tab: "tasks", action: "Add tasks" },
  { id: "c", title: "C", meta: "", status: "partial", tab: "risks", action: "Log risks" },
  { id: "d", title: "D", meta: "", status: "todo", tab: "budget", action: "Set budget" },
] }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getStage: vi.fn().mockResolvedValue({
        stage: "planning",
        gatesEnabled: false,
        checklist: { title: "Next up", items, done: 1, total: 4, optionalNote: null },
        band: { state: "quiet", message: "" },
      }),
    },
  };
});
import { StageRail } from "../components/StageRail";

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

describe("one primary button per checklist", () => {
  it("only the first unfinished item is lime; later unfinished items are outlined", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    cleanup = () => { act(() => root.unmount()); el.remove(); };
    await act(async () => {
      root.render(<StageRail projectId="p" isOwner onStageChange={() => {}} onOpenTab={() => {}} />);
    });
    await act(async () => { await Promise.resolve(); });
    const cta = (label: string) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === label)!;
    expect(cta("Add tasks").className).toContain("btn-primary");
    expect(cta("Log risks").className).toContain("btn-ghost");
    expect(cta("Set budget").className).toContain("btn-ghost");
    expect(cta("View").className).toContain("stage-item-link");
    expect(el.querySelectorAll(".stage-item-cta.btn-primary").length).toBe(1);
  });
});
