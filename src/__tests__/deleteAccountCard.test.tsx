// @vitest-environment jsdom
//
// The "Delete your account" card on the Account page.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const m = vi.hoisted(() => ({ deleteMyAccount: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import { DeleteAccountCard } from "../components/DeleteAccountCard";

const EMAIL = "me@example.com";
let container: HTMLDivElement;
let root: Root;
const onDeleted = vi.fn();
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  m.deleteMyAccount.mockReset();
  onDeleted.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderCard() {
  await act(async () => { root.render(<DeleteAccountCard email={EMAIL} onDeleted={onDeleted} />); });
}
const openForm = async () => {
  const open = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Delete my account")) as HTMLButtonElement;
  await act(async () => { open.click(); });
};
const fields = () => Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
const submitBtn = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;
async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("DeleteAccountCard", () => {
  it("starts closed, showing only the button", async () => {
    await renderCard();
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(container.textContent).toContain("can't be undone");
  });

  it("opens to a password field and an email confirmation, with the confirm button disabled", async () => {
    await renderCard();
    await openForm();
    expect(fields().length).toBe(2);
    expect(submitBtn().disabled).toBe(true);
  });

  it("enables the confirm button only when a password is entered and the email matches (any case, spaces ok)", async () => {
    await renderCard();
    await openForm();
    const [pw, email] = fields();
    await typeInto(email, EMAIL);
    expect(submitBtn().disabled).toBe(true);
    await typeInto(pw, "secret-password");
    expect(submitBtn().disabled).toBe(false);
    await typeInto(email, "  ME@Example.com ");
    expect(submitBtn().disabled).toBe(false);
    await typeInto(email, "someone-else@example.com");
    expect(submitBtn().disabled).toBe(true);
  });

  it("deletes with the password and email, then calls onDeleted", async () => {
    m.deleteMyAccount.mockResolvedValue({ ok: true });
    await renderCard();
    await openForm();
    const [pw, email] = fields();
    await typeInto(pw, "secret-password");
    await typeInto(email, EMAIL);
    await act(async () => { submitBtn().click(); });
    expect(m.deleteMyAccount).toHaveBeenCalledWith("secret-password", EMAIL);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message and does not continue when deletion is refused", async () => {
    m.deleteMyAccount.mockRejectedValue(new Error("You have an active subscription. Cancel it from the Billing page first, then delete your account."));
    await renderCard();
    await openForm();
    const [pw, email] = fields();
    await typeInto(pw, "secret-password");
    await typeInto(email, EMAIL);
    await act(async () => { submitBtn().click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("active subscription");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("cancel closes the form and clears what was typed", async () => {
    await renderCard();
    await openForm();
    await typeInto(fields()[0], "secret-password");
    const cancel = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Cancel") as HTMLButtonElement;
    await act(async () => { cancel.click(); });
    expect(container.querySelectorAll("input").length).toBe(0);
    await openForm();
    expect(fields()[0].value).toBe("");
  });
});
