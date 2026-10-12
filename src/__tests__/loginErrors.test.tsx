// @vitest-environment jsdom
//
// Batch C: a failed sign-in keeps focus in the form, and a stale error does not
// follow you to the other tab.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
const login = vi.fn();
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, login: (...a: unknown[]) => login(...a), foundingStatus: async () => ({ cap: 100, claimed: 1, remaining: 99, full: false }) } };
});
vi.mock("../lib/analytics", () => ({ track: () => {} }));
import Login from "../pages/Login";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  login.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("login errors", () => {
  it("announces a failed sign-in, puts focus on the password, and clears the error when switching tabs", async () => {
    login.mockRejectedValue(new Error("Incorrect email or password."));
    await act(async () => { root.render(<MemoryRouter initialEntries={["/login"]}><Login /></MemoryRouter>); });
    await flush();
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = container.querySelector<HTMLInputElement>("#f-login-75")!;
    act(() => { type(email, "a@b.co"); type(password, "wrongwrong1"); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    const err = container.querySelector(".form-error")!;
    expect(err.textContent).toBe("Incorrect email or password.");
    expect(err.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(password);

    const tabs = container.querySelectorAll<HTMLButtonElement>(".auth-tabs button");
    expect(tabs[0].getAttribute("aria-pressed")).toBe("true");
    act(() => tabs[1].click());
    expect(container.querySelector(".form-error")).toBeNull();
    expect(tabs[1].getAttribute("aria-pressed")).toBe("true");
    expect(tabs[0].getAttribute("aria-pressed")).toBe("false");
  });
});
