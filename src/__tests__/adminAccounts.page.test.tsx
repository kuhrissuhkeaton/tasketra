// @vitest-environment jsdom
//
// The admin Founding members page: lists accounts, flags possible duplicates,
// and removes an account or only its founding status. Mounts the real page
// with the api calls answered by stubs.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u-admin", email: "admin@example.com", isAdmin: true, tour_completed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = {
  list: vi.fn(),
  preview: vi.fn(),
  removeFounding: vi.fn(),
  del: vi.fn(),
};

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListAccounts: (scope: string) => calls.list(scope),
      adminPreviewRemoval: (id: string) => calls.preview(id),
      adminRemoveFounding: (id: string) => calls.removeFounding(id),
      adminDeleteAccount: (id: string, email: string) => calls.del(id, email),
    },
  };
});

import AdminFoundingMembers from "../pages/AdminFoundingMembers";

const base = {
  display_name: null, job_title: null, created_at: "2026-09-01T00:00:00Z", founding_member: true,
  project_count: 0, subscription_status: null, is_you: false, possible_duplicates: [] as string[],
};
const ACCOUNTS = [
  { ...base, id: "u-admin", email: "admin@example.com", is_you: true, project_count: 3 },
  { ...base, id: "u-real", email: "karissa@gmail.com", display_name: "Karissa", project_count: 2, possible_duplicates: ["karissa+test@gmail.com"] },
  { ...base, id: "u-test", email: "karissa+test@gmail.com", possible_duplicates: ["karissa@gmail.com"] },
];

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(async () => {
  Object.values(calls).forEach((c) => c.mockReset());
  calls.list.mockResolvedValue({ accounts: ACCOUNTS, summary: { foundingClaimed: 3, cap: 100, totalAccounts: 3 } });
  calls.preview.mockResolvedValue({
    preview: { user: { id: "u-test", email: "karissa+test@gmail.com", display_name: null, founding_member: true }, projects: 0, documents: 0, subscriptionStatus: null, sharedProjects: [], blockers: [] },
  });
  calls.removeFounding.mockResolvedValue({ ok: true });
  calls.del.mockResolvedValue({ ok: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter><AdminFoundingMembers /></MemoryRouter>);
  });
  await act(async () => {});
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

const buttons = (label: string) => Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === label) as HTMLButtonElement[];

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Founding members admin page", () => {
  it("lists the accounts, the spot count, and flags possible duplicates", () => {
    expect(host.textContent).toContain("3 of 100 spots claimed");
    expect(host.textContent).toContain("karissa@gmail.com");
    expect(host.textContent).toContain("Possible duplicate of karissa+test@gmail.com");
    expect(host.textContent).toContain("You");
    expect(calls.list).toHaveBeenCalledWith("founding");
  });

  it("offers no remove buttons on your own row", () => {
    // two other accounts, each with a Delete button; none for the admin's own row
    expect(buttons("Delete account").length).toBe(2);
    expect(host.textContent).toContain("Your account");
  });

  it("asks for every account when the toggle is on", async () => {
    const toggle = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { toggle.click(); });
    await act(async () => {});
    expect(calls.list).toHaveBeenLastCalledWith("all");
  });

  it("delete needs the exact email typed before the button works", async () => {
    await act(async () => { buttons("Delete account")[1].click(); });
    await act(async () => {});
    expect(calls.preview).toHaveBeenCalledWith("u-test");
    const dialog = document.querySelector('[role="alertdialog"]')!;
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Delete account") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const input = dialog.querySelector("input") as HTMLInputElement;
    await type(input, "karissa@gmail.com");
    expect(confirm.disabled).toBe(true); // a different account's email is not enough

    await type(input, "karissa+test@gmail.com");
    expect(confirm.disabled).toBe(false);
    await act(async () => { confirm.click(); });
    await act(async () => {});
    expect(calls.del).toHaveBeenCalledWith("u-test", "karissa+test@gmail.com");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.textContent).toContain("Deleted karissa+test@gmail.com");
    expect(calls.list.mock.calls.length).toBeGreaterThan(1); // list reloaded
  });

  it("shows blockers and does not allow the delete", async () => {
    calls.preview.mockResolvedValue({
      preview: { user: { id: "u-real", email: "karissa@gmail.com", display_name: "Karissa", founding_member: true }, projects: 2, documents: 0, subscriptionStatus: "active", sharedProjects: [], blockers: [{ code: "subscription", message: "This account has a active subscription. Cancel it in Stripe first." }] },
    });
    await act(async () => { buttons("Delete account")[0].click(); });
    await act(async () => {});
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain("Cancel it in Stripe first");
    expect(dialog.querySelector("input")).toBeNull();
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Delete account") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("removing only the founding status keeps the account and calls the right action", async () => {
    await act(async () => { buttons("Remove founding status")[1].click(); });
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain("keeps working and keeps its data");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Remove founding status") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    await act(async () => {});
    expect(calls.removeFounding).toHaveBeenCalledWith("u-test");
    expect(calls.del).not.toHaveBeenCalled();
  });

  it("Escape closes the dialog without doing anything", async () => {
    await act(async () => { buttons("Remove founding status")[0].click(); });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(calls.removeFounding).not.toHaveBeenCalled();
  });

  it("shows the server's message when a delete fails and keeps the dialog open", async () => {
    calls.del.mockRejectedValue(new Error("Not authorized"));
    await act(async () => { buttons("Delete account")[1].click(); });
    await act(async () => {});
    const dialog = document.querySelector('[role="alertdialog"]')!;
    await type(dialog.querySelector("input") as HTMLInputElement, "karissa+test@gmail.com");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Delete account") as HTMLButtonElement;
    await act(async () => { confirm.click(); });
    await act(async () => {});
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Not authorized");
  });
});
