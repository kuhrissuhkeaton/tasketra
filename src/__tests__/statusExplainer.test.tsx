// @vitest-environment jsdom
//
// The stated-vs-evidence explainer (v159, F-03): one line, dismissible,
// and the dismissal is remembered per user in this browser.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "karissa@x.co", display_name: "Karissa Keaton", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import { StatusExplainer } from "../components/StatusExplainer";
import { STATUS_EXPLAINER_TEXT } from "../lib/statusExplainer";

let container: HTMLDivElement; let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("StatusExplainer", () => {
  it("shows the line, dismisses on click, and stays dismissed on remount", async () => {
    await act(async () => { root.render(<StatusExplainer />); });
    expect(container.textContent).toContain(STATUS_EXPLAINER_TEXT);
    const close = container.querySelector<HTMLButtonElement>(".status-explainer-close")!;
    await act(async () => { close.click(); });
    expect(container.querySelector(".status-explainer")).toBeNull();
    expect(localStorage.getItem("tasketra:status-explainer-dismissed:u1")).toBe("1");
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { root.render(<StatusExplainer />); });
    expect(container.querySelector(".status-explainer")).toBeNull();
  });
});
