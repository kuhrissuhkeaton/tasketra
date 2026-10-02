// Every <input>, <select> and <textarea> in the app must have an accessible
// name: wrapped in a <label>, tied to one with htmlFor/id, or given an
// aria-label / aria-labelledby / title. A visible <label> sitting next to a
// field is NOT enough on its own (screen readers announce "edit text, blank").
// This reads the source with the TypeScript compiler, so a new unlabelled
// field fails here instead of reaching a screen-reader user.
import { describe, it, expect } from "vitest";
import ts from "typescript";

// Every component and page source file, as text (tests excluded).
const SOURCES = Object.entries(
  import.meta.glob(["../**/*.tsx", "!../__tests__/**"], { query: "?raw", import: "default", eager: true }),
) as [string, string][];

const isEl = (n: ts.Node): n is ts.JsxOpeningElement | ts.JsxSelfClosingElement =>
  ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n);

function unlabelled(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const attrsOf = (n: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    const a: Record<string, string> = {};
    for (const p of n.attributes.properties) if (ts.isJsxAttribute(p)) a[p.name.getText()] = p.initializer ? p.initializer.getText() : "true";
    return a;
  };
  const htmlFor = new Set<string>();
  const visit1 = (n: ts.Node) => {
    if (isEl(n) && n.tagName.getText() === "label") {
      const a = attrsOf(n);
      if (a.htmlFor) htmlFor.add(a.htmlFor.replace(/[{}`"']/g, ""));
    }
    ts.forEachChild(n, visit1);
  };
  visit1(sf);
  const bad: string[] = [];
  const visit2 = (n: ts.Node) => {
    if (isEl(n) && ["input", "select", "textarea"].includes(n.tagName.getText())) {
      const a = attrsOf(n);
      const spread = n.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p));
      let wrapped = false;
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === "label") { wrapped = true; break; }
      }
      const named = wrapped || spread || a["aria-label"] || a["aria-labelledby"] || a.title ||
        (a.id && htmlFor.has(a.id.replace(/[{}`"']/g, "")));
      if (!named && !/hidden|submit/.test(a.type ?? "")) {
        bad.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} <${n.tagName.getText()}>`);
      }
    }
    ts.forEachChild(n, visit2);
  };
  visit2(sf);
  return bad;
}

describe("form fields have accessible names", () => {
  it("no input, select or textarea is missing a name", () => {
    expect(SOURCES.length).toBeGreaterThan(20);
    const bad = SOURCES.flatMap(([file, src]) => unlabelled(file, src));
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
