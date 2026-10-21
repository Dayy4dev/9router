import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// process.cwd() in a test run is tests/, so anchor on the file instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { buildUnifiedModelRows } = await import(path.join(ROOT, "src/shared/utils/freeModelRows.js"));

describe("buildUnifiedModelRows", () => {
  it("merges builtin, custom and catalogue rows by id with custom winning", () => {
    const result = buildUnifiedModelRows({
      builtinModels: [{ id: "beam-free", name: "Beam Free" }, { id: "union-alpha", name: "Union Alpha Free" }],
      customRows: [{ id: "union-alpha", name: "Union Alpha (renamed)" }],
      catalogue: [{ id: "beam-free", name: "beam-free" }, { id: "mimo-v2-free", name: "Mimo Free" }],
    });
    const union = result.rows.find((row) => row.id === "union-alpha");
    expect(union.source).toBe("custom");
    expect(union.name).toBe("Union Alpha (renamed)");
    expect(result.total).toBe(3); // beam, union, mimo - no duplicates
    expect(result.active.map((row) => row.id).sort()).toEqual(["beam-free", "mimo-v2-free", "union-alpha"]);
  });

  it("keeps every id visible: disabled ids land in the disabled list, nothing vanishes", () => {
    const result = buildUnifiedModelRows({
      builtinModels: [{ id: "muse-spark-1.2-free" }, { id: "union-alpha" }],
      catalogue: [{ id: "beam-free" }, { id: "muse-spark-1.3-free" }],
      disabledIds: ["muse-spark-1.2-free", "muse-spark-1.3-free"],
    });
    expect(result.active.map((row) => row.id)).toEqual(["union-alpha", "beam-free"]);
    expect(result.disabled.map((row) => row.id).sort()).toEqual(["muse-spark-1.2-free", "muse-spark-1.3-free"]);
    expect(result.disabledCount).toBe(2);
    expect(result.activeCount).toBe(2);
    expect(result.total).toBe(4);
  });

  it("sorts the disabled list alphabetically as a restore list", () => {
    const result = buildUnifiedModelRows({
      catalogue: [{ id: "zeta-free" }, { id: "alpha-free" }, { id: "mike-free" }],
      disabledIds: ["zeta-free", "alpha-free", "mike-free"],
    });
    expect(result.disabled.map((row) => row.id)).toEqual(["alpha-free", "mike-free", "zeta-free"]);
  });

  it("tolerates empty inputs and junk rows", () => {
    const result = buildUnifiedModelRows({ builtinModels: [null, { name: "no id" }], catalogue: [], disabledIds: ["x"] });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

describe("free-catalogue UI contract", () => {
  const page = readFileSync(
    path.join(ROOT, "src/app/(dashboard)/dashboard/providers/[id]/page.js"),
    "utf8",
  );
  const modelRow = readFileSync(
    path.join(ROOT, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js"),
    "utf8",
  );
  const picker = readFileSync(path.join(ROOT, "src/shared/components/ModelSelectModal.js"), "utf8");

  it("a free no-auth provider renders its catalogue as rows in one list", () => {
    // The old UI split the same ids across a suggested-chip row and a disabled-chip
    // row, since the live catalogue never reached the row list at all.
    expect(page).toContain("buildUnifiedModelRows");
    expect(page).toMatch(/unifiedFreeRows\?\.active/);
    expect(page).toMatch(/unifiedFreeRows\?\.disabled/);
    expect(page).toContain("onRestore={() => handleEnableModel(row.id)}");
  });

  it("the add-me and restore chip rows only exist for providers that gate their catalogue", () => {
    // A gated provider (paid catalogues) still needs the "add me" affordance; a free
    // no-auth provider must not re-show the ids it just rendered as rows.
    expect(page).toContain("!isFreeNoAuth && (suggestedModels.length > 0 || suggestedModelsError)");
    expect(page).toContain("!isFreeNoAuth && disabledDisplayModels.length > 0");
  });

  it("ModelRow carries the disabled and free states the unified list needs", () => {
    expect(modelRow).toMatch(/isDisabled\s*\?\s*"opacity-60"/);
    expect(modelRow).toMatch(/isDisabled\s*\?\s*"visibility_off"/);
    expect(modelRow).toContain("onRestore");
    expect(modelRow).toMatch(/isFree && \(/); // FREE badge
  });

  it("the picker says how many models it is hiding", () => {
    expect(picker).toMatch(/disabledCountFor/);
    expect(picker).toMatch(/·\s*\{disabledCountFor/);
  });
});
