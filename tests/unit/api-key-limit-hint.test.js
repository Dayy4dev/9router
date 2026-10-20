import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const page = readFileSync(
  resolve(root, "src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js"),
  "utf8"
);

// Sliced rather than imported: the page is a JSX client component, so the helper is
// pulled out of the source the same way the changelog tests reach into the modal.
const slice = page.slice(
  page.indexOf("function limitHint"),
  page.indexOf("function limitPlaceholder")
);
const limitHint = new Function(slice + "\nreturn limitHint;")();

describe("key editor: the limit hint explains the selected unit", () => {
  it("explains the token window and its counter", () => {
    expect(limitHint("tokens")).toMatch(/prompt \+ completion tokens/);
    expect(limitHint("tokens")).toMatch(/reset window/);
    expect(limitHint("tokens")).toMatch(/429/);
  });

  it("explains that cost is priced per request and rolls over at midnight UTC", () => {
    expect(limitHint("cost")).toMatch(/per request/);
    expect(limitHint("cost")).toMatch(/00:00 UTC/);
  });

  it("explains that a request is counted once per logged call", () => {
    expect(limitHint("requests")).toMatch(/once per request/);
    expect(limitHint("requests")).toMatch(/whichever model/);
  });

  it("keeps the only unit-agnostic sentence: zero means unlimited", () => {
    for (const kind of ["tokens", "cost", "requests"]) {
      expect(limitHint(kind)).toMatch(/0 = unlimited/);
    }
  });

  it("names the creator's ceiling on the token kind only", () => {
    expect(limitHint("tokens", 88000000)).toContain("88,000,000 tokens");
    expect(limitHint("cost", 88000000)).not.toMatch(/maximum is/);
    expect(limitHint("requests", 88000000)).not.toMatch(/maximum is/);
  });

  it("is what both modals render, and the generic line is gone", () => {
    expect(page).toMatch(/hint=\{limitHint\(newKeyLimitKind, creatorTokenLimit\)\}/);
    expect(page).toMatch(/hint=\{limitHint\(editLimitKind, creatorTokenLimit\)\}/);
    expect(page).not.toContain("0 or leave empty for unlimited");
    expect(page).not.toContain("(0: unlimited)");
  });
});
