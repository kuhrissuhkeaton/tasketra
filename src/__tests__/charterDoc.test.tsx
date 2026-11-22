// @vitest-environment jsdom
//
// v172 CharterTab document view: the charter reads as a document with
// per-section editing, not as one long form.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const m = vi.hoisted(() => ({ getCharterApproval: vi.fn(), updateProject: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import { CharterTab } from "../components/CharterTab";
import type { Charter } from "../lib/charter";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  m.getCharterApproval.mockReset();
  m.updateProject.mockReset();
  m.getCharterApproval.mockResolvedValue({ approval: null });
  m.updateProject.mockResolvedValue({ project: { charter: {} } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(charter: Charter, isOwner = true) {
  await act(async () => {
    root.render(
      <CharterTab
        projectId="p1"
        projectName="Clinic"
        charter={charter}
        isOwner={isOwner}
        size="full"
        showAll
        okrsVisible={false}
        onSaved={vi.fn()}
        onOpenTab={vi.fn()}
      />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

describe("CharterTab document view (v172)", () => {
  it("reads as a document: prose sections and objectives as a list", async () => {
    await mount({
      purpose: "Replace the clinic's intake system.",
      objectives: "Cut check-in time\nFewer no-shows",
      scope_in: "Intake and scheduling",
      sponsor: "Dr. Patel",
    });
    expect(container.querySelector(".charter-doc")).not.toBeNull();
    expect(container.textContent).toContain("Replace the clinic's intake system.");
    const list = container.querySelector(".charter-objectives-list");
    expect(list?.querySelectorAll("li").length).toBe(2);
    // No form fields in read mode.
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector(".charter-card input")).toBeNull();
    // Empty sections say so quietly.
    expect(container.textContent).toContain("Not written yet.");
  });

  it("Edit opens just that section's field, and Cancel restores it", async () => {
    await mount({ purpose: "Old purpose", objectives: "One goal", scope_in: "X", sponsor: "Sam" });
    const editBtn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Edit") as HTMLButtonElement;
    await act(async () => editBtn.click());
    const area = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(area).not.toBeNull();
    expect(area.value).toBe("Old purpose");
    const cancel = [...container.querySelectorAll("button")].find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    await act(async () => cancel.click());
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Old purpose");
    expect(m.updateProject).not.toHaveBeenCalled();
  });

  it("non-owners get the document without edit controls", async () => {
    await mount({ purpose: "Read only purpose" }, false);
    expect(container.textContent).toContain("Read only purpose");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Edit" || b.textContent === "Add")).toBe(false);
  });
});
