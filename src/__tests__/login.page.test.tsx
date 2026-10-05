// @vitest-environment jsdom
//
// The sign-up page, once per offer the pricing page links to.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = { register: vi.fn(), login: vi.fn(), foundingStatus: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      register: (...a: unknown[]) => calls.register(...a),
      login: (...a: unknown[]) => calls.login(...a),
      foundingStatus: () => calls.foundingStatus(),
    },
  };
});

const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import Login from "../pages/Login";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  calls.foundingStatus.mockResolvedValue({ cap: 100, claimed: 63, remaining: 37, full: false });
  calls.register.mockResolvedValue({ user: { id: "u1", email: "a@b.co" } });
  track.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}

async function render(url: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}

const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;
const headline = () => container.querySelector("h1")?.textContent;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const OLD_BANNERS = ["Going for a founding member spot", "if one's still open", "you'll land on Billing"];

describe("register page, by plan", () => {
  it("free (no plan)", async () => {
    await render("/login?mode=register");
    expect(headline()).toBe("Start your first project free");
    expect(container.textContent).toContain("3 projects free. WBS, RAID log, budget and roadmap included. No credit card.");
    expect(submitButton().textContent).toBe("Create free account");
    expect(container.querySelector(".form-success")).toBeNull();
    expect(calls.foundingStatus).not.toHaveBeenCalled();
  });

  it("founding, with the spots left", async () => {
    await render("/login?mode=register&plan=founding");
    expect(headline()).toBe("Claim a founding member spot");
    expect(container.textContent).toContain("Free Pro forever for the first 100 accounts.");
    expect(container.textContent).toContain("37 of 100 spots left.");
    expect(container.textContent).toContain("Your spot is confirmed once you confirm your email.");
    expect(submitButton().textContent).toBe("Claim my founding spot");
    for (const old of OLD_BANNERS) expect(container.textContent).not.toContain(old);
    expect(container.querySelector(".form-success")).toBeNull();
  });

  it("founding leaves the count out when it can't be fetched", async () => {
    calls.foundingStatus.mockRejectedValue(new Error("offline"));
    await render("/login?mode=register&plan=founding");
    expect(container.textContent).not.toContain("spots left");
    expect(container.textContent).toContain("Free Pro forever for the first 100 accounts.");
  });

  it("pro", async () => {
    await render("/login?mode=register&plan=pro");
    expect(headline()).toBe("Start your 14-day Pro trial");
    expect(container.textContent).toContain("14 days free. A card is needed to start the trial and you won't be charged until it ends. Cancel anytime.");
    expect(submitButton().textContent).toBe("Create account and start trial");
    for (const old of OLD_BANNERS) expect(container.textContent).not.toContain(old);
    expect(container.querySelector(".form-success")).toBeNull();
  });

  it("keeps the helper text, the founder note and the terms line", async () => {
    await render("/login?mode=register");
    expect(container.textContent).toContain("At least 8 characters. One email, one account.");
    expect(container.textContent).toContain("Built by a PM with 20+ years in the field. Reply to any email from us and I read it.");
    expect(container.textContent).toContain("Terms of Service");
    const note = container.querySelector(".auth-founder-note")!;
    const consent = container.querySelector(".auth-consent")!;
    expect(note.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sign-in mode keeps Sign in and no offer", async () => {
    await render("/login?plan=founding");
    expect(submitButton().textContent).toBe("Sign in");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).not.toContain("Built by a PM");
  });
});

describe("password field", () => {
  it("has an accessible show/hide toggle", async () => {
    await render("/login?mode=register");
    const input = container.querySelector("#f-login-75") as HTMLInputElement;
    const toggle = container.querySelector(".password-toggle") as HTMLButtonElement;
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(input.type).toBe("password");
    await act(async () => { toggle.click(); });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(input.type).toBe("text");
    await act(async () => { toggle.click(); });
    expect(input.type).toBe("password");
  });
});

describe("after sign-up", () => {
  async function signUp(url: string) {
    await render(url);
    const [email, password] = container.querySelectorAll("input");
    await act(async () => { (email as HTMLInputElement).focus(); });
    await act(async () => { type(email as HTMLInputElement, "a@b.co"); type(password as HTMLInputElement, "longenough1"); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
  }

  it("founding goes to the app, not Billing", async () => {
    await signUp("/login?mode=register&plan=founding");
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app");
    expect(track).toHaveBeenCalledWith("signup_started", { plan: "founding" });
    expect(track).toHaveBeenCalledWith("signup_completed", { plan: "founding" });
  });

  it("pro goes to Billing to start the trial", async () => {
    await signUp("/login?mode=register&plan=pro");
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app/billing");
    expect(track).toHaveBeenCalledWith("signup_completed", { plan: "pro" });
  });

  it("free goes to the app and reports plan none, once per visit", async () => {
    await signUp("/login?mode=register");
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app");
    expect(track.mock.calls.filter((c) => c[0] === "signup_started")).toHaveLength(1);
    expect(track).toHaveBeenCalledWith("signup_completed", { plan: "none" });
  });
});
