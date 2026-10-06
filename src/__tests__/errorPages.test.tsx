// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ErrorPage } from "../components/ErrorPage";
import NotFound from "../pages/NotFound";
import Forbidden from "../pages/Forbidden";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(ui); });
}

describe("error pages", () => {
  it("shows the code, headline, message and actions", () => {
    mount(
      <ErrorPage code="500" title="That one's on us." actions={<button>Try again</button>}>
        Something broke.
      </ErrorPage>
    );
    expect(container.querySelector(".error-code")?.textContent).toBe("500");
    expect(container.querySelector("h1")?.textContent).toBe("That one's on us.");
    expect(container.querySelector(".error-text")?.textContent).toBe("Something broke.");
    expect(container.querySelector("button")?.textContent).toBe("Try again");
  });

  it("404 page offers a way back to the projects", () => {
    mount(
      <MemoryRouter initialEntries={["/app/nope"]}>
        <Routes><Route path="*" element={<NotFound />} /></Routes>
      </MemoryRouter>
    );
    expect(container.querySelector(".error-code")?.textContent).toBe("404");
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Back to my projects");
    expect(link?.getAttribute("href")).toBe("/app");
  });

  it("403 page says no access and links back", () => {
    mount(<MemoryRouter><Forbidden /></MemoryRouter>);
    expect(container.querySelector(".error-code")?.textContent).toBe("403");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/app");
  });
});
