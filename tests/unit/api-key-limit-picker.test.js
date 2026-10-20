import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const page = readFileSync(
  resolve(root, "src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js"),
  "utf8"
);

// The option table is plain data, so it can be evaluated out of the source exactly as
// written; the picker component around it is JSX and is checked by assertion below.
const options = new Function(
  page.slice(page.indexOf("const LIMIT_KIND_OPTIONS"), page.indexOf("function LimitKindPicker")) +
    "\nreturn LIMIT_KIND_OPTIONS;"
)();

describe("key editor: limit type is a coloured three-way picker, not a dropdown", () => {
  it("offers all three budgets with their own accent", () => {
    expect(options.map((o) => o.value)).toEqual(["tokens", "cost", "requests"]);
    for (const key of ["tone", "tint", "border", "icon", "desc"]) {
      expect(new Set(options.map((o) => o[key])).size).toBe(3);
    }
  });

  it("uses an icon per kind, so the choice is not read by text alone", () => {
    expect(options.map((o) => o.icon)).toEqual(["data_usage", "payments", "bolt"]);
  });

  it("renders as a radiogroup whose options carry their own selected state", () => {
    expect(page).toMatch(/role="radiogroup" aria-label="Limit Type"/);
    expect(page).toMatch(/role="radio"/);
    expect(page).toMatch(/aria-checked=\{selected\}/);
  });

  it("paints the selected option instead of leaving it white", () => {
    expect(page).toMatch(/selected\s*\?\s*`\$\{opt\.tint\} \$\{opt\.border\} shadow-\[var\(--elev-2\)\]`/);
    expect(page).toMatch(/selected \? opt\.tone : "text-text-muted"/);
  });

  it("replaces the dropdown in both modals", () => {
    expect(page).toMatch(/<LimitKindPicker value=\{newKeyLimitKind\} onChange=\{setNewKeyLimitKind\} \/>/);
    expect(page).toMatch(/<LimitKindPicker value=\{editLimitKind\} onChange=\{setEditLimitKind\} \/>/);
    expect(page).not.toMatch(/<Select\s+label="Limit Type"/);
  });
});
