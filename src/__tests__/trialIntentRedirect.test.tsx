// @vitest-environment jsdom
//
// v173.2: the landing component inside Protected's verified branch. A
// verified free account with a stored trial intent is sent on to Billing
// from wherever verification dropped it; everyone else is left exactly
// where they are.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { User } from "../lib/api";

const auth = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, loading: false, sessionExpired: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import { TrialIntentRedirect } from "../App";
import { rememberTrialIntent } from "../lib/trialIntent";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  window.localStorage.clear();
  auth.user = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function renderAt(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<><TrialIntentRedirect /><p>app home</p></>} />
          <Route path="/app/billing" element={<><TrialIntentRedirect /><p>billing page</p></>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}

const verifiedFree: User = { id: "u1", email: "me@gmail.com", emailVerified: true, plan: "free" };

describe("TrialIntentRedirect", () => {
  it("sends a verified free account with trial intent from the app home to Billing", async () => {
    auth.user = verifiedFree;
    rememberTrialIntent("me@gmail.com");
    await renderAt("/app");
    expect(container.textContent).toContain("billing page");
    expect(container.textContent).not.toContain("app home");
  });

  it("leaves a verified free account with no stored intent where it is", async () => {
    auth.user = verifiedFree;
    await renderAt("/app");
    expect(container.textContent).toContain("app home");
  });

  it("never sends a founding account to Billing, even with a stray intent", async () => {
    auth.user = { ...verifiedFree, plan: "founding" };
    rememberTrialIntent("me@gmail.com");
    await renderAt("/app");
    expect(container.textContent).toContain("app home");
  });

  it("does nothing while the account is still unverified", async () => {
    auth.user = { ...verifiedFree, emailVerified: false };
    rememberTrialIntent("me@gmail.com");
    await renderAt("/app");
    expect(container.textContent).toContain("app home");
    expect(window.localStorage.getItem("tasketra.trialIntent")).not.toBeNull();
  });

  it("stays put when the account is already on Billing, and consumes the intent", async () => {
    auth.user = verifiedFree;
    rememberTrialIntent("me@gmail.com");
    await renderAt("/app/billing");
    expect(container.textContent).toContain("billing page");
    expect(window.localStorage.getItem("tasketra.trialIntent")).toBeNull();
  });
});
