// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { SESSION_EXPIRED_EVENT } from "../lib/sessionEvents";
import Login from "../pages/Login";

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

async function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(ui); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function Probe() {
  const { user, sessionExpired } = useAuth();
  return <p id="probe">{user ? "in" : "out"}-{sessionExpired ? "expired" : "ok"}</p>;
}

describe("session expiry", () => {
  it("a 401 on a normal request announces an expiry, a wrong password does not", async () => {
    stubFetch(401, { error: "nope" });
    let heard = 0;
    const listen = () => { heard += 1; };
    window.addEventListener(SESSION_EXPIRED_EVENT, listen);
    await api.getMyActivity().catch(() => {});
    expect(heard).toBe(1);
    await api.login("a@example.com", "wrong").catch(() => {});
    expect(heard).toBe(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listen);
  });

  it("signs a signed-in person out and flags it when the session expires", async () => {
    stubFetch(200, { user: { id: "u1", email: "a@example.com" } });
    await mount(<AuthProvider><Probe /></AuthProvider>);
    expect(container.querySelector("#probe")?.textContent).toBe("in-ok");
    await act(async () => { window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)); });
    expect(container.querySelector("#probe")?.textContent).toBe("out-expired");
  });

  it("ignores the signal when nobody was signed in", async () => {
    stubFetch(200, { user: null });
    await mount(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)); });
    expect(container.querySelector("#probe")?.textContent).toBe("out-ok");
  });

  it("sign-in page shows the note only after an expiry redirect", async () => {
    stubFetch(200, { user: null });
    const page = (url: string) => (
      <AuthProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes><Route path="/login" element={<Login />} /></Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    await mount(page("/login?expired=1"));
    expect(container.textContent).toContain("Time for a quick re-baseline.");
    act(() => root!.unmount());
    container.remove();
    await mount(page("/login"));
    expect(container.textContent).not.toContain("Time for a quick re-baseline.");
  });
});
