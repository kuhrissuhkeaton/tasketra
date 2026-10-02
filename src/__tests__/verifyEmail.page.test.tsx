// @vitest-environment jsdom
//
// The "check your email" gate and the page the emailed link opens.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

const refresh = vi.fn(async () => {});
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "me@gmail.co", emailVerified: false }, loading: false, refresh, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = { resend: vi.fn(), change: vi.fn(), verify: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      resendVerification: () => calls.resend(),
      changeUnverifiedEmail: (e: string) => calls.change(e),
      verifyEmail: (t: string) => calls.verify(t),
    },
  };
});

import { VerifyEmailGate } from "../components/VerifyEmailGate";
import VerifyEmail from "../pages/VerifyEmail";
import { ApiError } from "../lib/api";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  refresh.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe("VerifyEmailGate", () => {
  it("names the address and can resend the link", async () => {
    calls.resend.mockResolvedValue({ ok: true, email: "me@gmail.co" });
    await act(async () => { root.render(<MemoryRouter><VerifyEmailGate /></MemoryRouter>); });
    expect(container.textContent).toContain("me@gmail.co");
    await act(async () => { button("Send it again").click(); });
    await flush();
    expect(calls.resend).toHaveBeenCalled();
    expect(container.textContent).toContain("We sent a new link");
  });

  it("offers the suggested fix when the new address looks like a typo", async () => {
    calls.change.mockRejectedValue(new ApiError("That email address looks like a typo. Did you mean me@gmail.com?", 400, false, "me@gmail.com"));
    await act(async () => { root.render(<MemoryRouter><VerifyEmailGate /></MemoryRouter>); });
    await act(async () => { button("Change it").click(); });
    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "me@gmail.co");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
    expect(button("Use me@gmail.com")).toBeTruthy();
  });
});

describe("VerifyEmail page", () => {
  it("confirms the token and says so", async () => {
    calls.verify.mockResolvedValue({ ok: true, email: "me@gmail.com", founding: true });
    await act(async () => { root.render(<MemoryRouter initialEntries={["/verify-email?token=abc"]}><VerifyEmail /></MemoryRouter>); });
    await flush();
    expect(calls.verify).toHaveBeenCalledWith("abc");
    expect(container.textContent).toContain("Your email is confirmed");
    expect(container.textContent).toContain("founding member");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the reason when the link is bad", async () => {
    calls.verify.mockRejectedValue(new Error("This confirmation link is invalid or has expired."));
    await act(async () => { root.render(<MemoryRouter initialEntries={["/verify-email?token=bad"]}><VerifyEmail /></MemoryRouter>); });
    await flush();
    expect(container.textContent).toContain("couldn't confirm");
    expect(container.textContent).toContain("invalid or has expired");
  });
});
