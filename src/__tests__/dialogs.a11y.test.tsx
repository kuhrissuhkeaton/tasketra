// @vitest-environment jsdom
//
// Keyboard behaviour of the shared dialogs: Escape closes them, focus goes
// back to the button that opened them, and the confirm dialog is announced as
// an alert dialog with Cancel (not the destructive button) focused first.
import { describe, it, expect, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { ConfirmProvider, useConfirm } from "../components/ConfirmDialog";
import { Drawer } from "../components/ItemDrawer";

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("ConfirmDialog", () => {
  function Demo({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <button id="opener" type="button" onClick={async () => onResult(await confirm("Delete it?"))}>
        open
      </button>
    );
  }

  it("is an alertdialog, focuses Cancel, and Escape cancels and returns focus", async () => {
    let result: boolean | null = null;
    mount(
      <ConfirmProvider>
        <Demo onResult={(v) => (result = v)} />
      </ConfirmProvider>,
    );
    const opener = document.getElementById("opener") as HTMLButtonElement;
    opener.focus();
    await act(async () => opener.click());
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await act(async () => press("Escape"));
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(result).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe("Drawer", () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    const [n, setN] = useState(0);
    return (
      <>
        <button id="opener" type="button" onClick={() => setOpen(true)}>open</button>
        {/* inline onClose + a re-render: focus must not be yanked back */}
        <Drawer open={open} onClose={() => setOpen(false)} title="Thing">
          <input id="field" value={String(n)} onChange={() => setN(n + 1)} />
        </Drawer>
      </>
    );
  }

  it("Escape closes it and focus returns to the opener", async () => {
    mount(<Demo />);
    const opener = document.getElementById("opener") as HTMLButtonElement;
    opener.focus();
    await act(async () => opener.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => press("Escape"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not steal focus from a field when the parent re-renders", async () => {
    mount(<Demo />);
    await act(async () => (document.getElementById("opener") as HTMLButtonElement).click());
    const field = document.getElementById("field") as HTMLInputElement;
    field.focus();
    await act(async () => {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.activeElement).toBe(field);
  });
});
