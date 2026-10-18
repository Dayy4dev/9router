// Changelog source selection self-check.
// Run: node src/shared/components/changelogSourcesSelfCheck.mjs
// No framework, no deps.
import {
  CHANGELOG_SOURCES,
  DAYY4DEV_SOURCE,
  SERENHOPE_SOURCE,
  DECOLUA_SOURCE,
  DEFAULT_CHANGELOG_SOURCE,
  availableChangelogSources,
  pickChangelogSource,
} from "./changelogSources.js";

const results = [];
function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
  }
}
const assert = {
  equal(a, b, msg) { if (a !== b) throw new Error(`${msg || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  ok(v, msg) { if (!v) throw new Error(msg || "expected truthy"); },
  no(v, msg) { if (v) throw new Error(msg || "expected falsy"); },
};

const ALL_THREE = { dayy4dev: "<p>dayy</p>", serenhope: "<p>seren</p>", decolua: "<p>deco</p>" };
const ONLY_DAYY = { dayy4dev: "<p>dayy</p>", serenhope: "", decolua: "" };
const ONLY_SEREN = { dayy4dev: "", serenhope: "<p>seren</p>", decolua: "" };
const ONLY_DECO = { dayy4dev: "", serenhope: "", decolua: "<p>deco</p>" };
const NEITHER = { dayy4dev: "", serenhope: "", decolua: "" };

run("there are three sources, dayy4dev first", () => {
  assert.equal(CHANGELOG_SOURCES.length, 3, "three sources");
  assert.equal(CHANGELOG_SOURCES[0].id, "dayy4dev", "dayy4dev listed first");
  assert.equal(CHANGELOG_SOURCES[1].id, "serenhope", "serenhope second");
  assert.equal(CHANGELOG_SOURCES[2].id, "decolua", "decolua third");
  assert.equal(DAYY4DEV_SOURCE.id, "dayy4dev", "exported id");
  assert.equal(SERENHOPE_SOURCE.id, "serenhope", "exported id");
  assert.equal(DECOLUA_SOURCE.id, "decolua", "exported id");
});

run("all three sources are offered when all have content", () => {
  const available = availableChangelogSources(ALL_THREE);
  assert.equal(available.length, 3, "all three offered");
  assert.equal(available[0].id, "dayy4dev", "order preserved");
  assert.equal(available[1].id, "serenhope", "order preserved");
  assert.equal(available[2].id, "decolua", "order preserved");
});

run("dayy4dev opens first by default", () => {
  assert.equal(DEFAULT_CHANGELOG_SOURCE, "dayy4dev", "default is dayy4dev");
  assert.equal(pickChangelogSource(ALL_THREE, DEFAULT_CHANGELOG_SOURCE), "dayy4dev", "default shows dayy4dev");
});

run("choosing serenhope or upstream source is honoured", () => {
  assert.equal(pickChangelogSource(ALL_THREE, "serenhope"), "serenhope", "switched to serenhope");
  assert.equal(pickChangelogSource(ALL_THREE, "decolua"), "decolua", "switched to decolua");
});

run("a source with no content is not offered as a tab", () => {
  assert.equal(availableChangelogSources(ONLY_DAYY).length, 1, "one tab");
  assert.equal(availableChangelogSources(ONLY_DAYY)[0].id, "dayy4dev", "the one with content");
  assert.equal(availableChangelogSources(ONLY_SEREN).length, 1, "one tab");
  assert.equal(availableChangelogSources(ONLY_SEREN)[0].id, "serenhope", "the one with content");
  assert.equal(availableChangelogSources(ONLY_DECO)[0].id, "decolua", "same the other way");
  assert.equal(availableChangelogSources(NEITHER).length, 0, "no tabs when none loaded");
});

run("a selection pointing at an empty source falls back to what exists", () => {
  assert.equal(pickChangelogSource(ONLY_SEREN, "dayy4dev"), "serenhope", "falls back to serenhope");
  assert.equal(pickChangelogSource(ONLY_DECO, "dayy4dev"), "decolua", "falls back to decolua");
});

run("with nothing loaded at all it still names a source", () => {
  assert.equal(pickChangelogSource(NEITHER, "decolua"), DEFAULT_CHANGELOG_SOURCE, "never undefined");
  assert.ok(pickChangelogSource(null, null), "null input still resolves");
  assert.ok(pickChangelogSource(undefined, undefined), "undefined input still resolves");
  assert.equal(availableChangelogSources(null).length, 0, "null offers nothing");
});

run("an unknown source id is not trusted", () => {
  assert.equal(pickChangelogSource(ALL_THREE, "someone-else"), "dayy4dev", "falls back rather than rendering nothing");
});

run("whitespace-only content counts as empty", () => {
  assert.equal(availableChangelogSources({ dayy4dev: "   ", serenhope: "   ", decolua: "<p>x</p>" }).length, 1, "blank ignored");
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.name}${r.err ? ` - ${r.err}` : ""}`);
}

console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
