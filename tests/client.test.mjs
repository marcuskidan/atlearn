// Client pure-logic tests. Run in CI: node --test tests/
// The functions under test live inline in index.html (single-file app, by
// design). extractFn() brace-matches each `function name(...)` declaration out
// of the source and evaluates it in a vm sandbox — single source of truth,
// no copied code to drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const cases = JSON.parse(readFileSync(join(root, "tests", "cases.json"), "utf8"));

function extractFn(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`function ${name} not found in index.html`);
  let depth = 0;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const fns = ["esc", "flatten", "contentHash", "migrateStore", "mergeStores",
             "renderDiff", "editorMode", "applyMergedDocs"];
const script = `
let devMode=false, FIREBASE_CONFIG=null, user={provider:null,id:"guest"},
    currentRm=null, MAINTAINERS={}, ADMINS=["admin-uid"], SUPERADMINS=[];
const STORE_V=1;
${extractFn(html, "isAdmin")}
${extractFn(html, "maintains")}
${fns.map((n) => extractFn(html, n)).join("\n")}
({ esc, flatten, contentHash, migrateStore, mergeStores, renderDiff, applyMergedDocs,
   editorModeWith(o){
     devMode=o.devMode||false;
     FIREBASE_CONFIG=("FIREBASE_CONFIG" in o)?o.FIREBASE_CONFIG:null;
     user=o.user||{provider:null,id:"guest"}; currentRm=o.currentRm||null;
     MAINTAINERS=o.MAINTAINERS||{};
     return editorMode();
   } })
`;
const api = vm.runInNewContext(script, { console });

const resolve = (obj, path) =>
  path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

test("mergeStores cases", () => {
  for (const c of cases.mergeStores) {
    const out = api.mergeStores(structuredClone(c.a), structuredClone(c.b));
    assert.equal(out.v, 1, `${c.name}: output carries v:1`);
    for (const [path, want] of Object.entries(c.expect))
      assert.deepEqual(resolve(out.progress, path), want, `${c.name}: ${path}`);
  }
});

test("contentHash cases", () => {
  for (const c of cases.contentHash) {
    const h = api.contentHash(c.input);
    assert.equal(typeof h, "string");
    if (c.same) assert.equal(api.contentHash(c.same), h, c.name);
    if (c.different) assert.notEqual(api.contentHash(c.different), h, c.name);
  }
});

test("migrateStore cases", () => {
  for (const c of cases.migrateStore) {
    const out = api.migrateStore(c.input === null ? null : structuredClone(c.input));
    assert.equal(out.v, c.expectV, c.name);
    if (c.expectEmpty) assert.deepEqual(out.progress, {}, c.name);
    if (c.expectPath)
      assert.equal(resolve(out.progress, c.expectPath), c.expectValue, c.name);
  }
});

test("renderDiff escapes user-controlled HTML", () => {
  const base = { id: "t", title: "Topic", tier: "essential",
    learn: { summary: "safe", links: [] }, do: ["x"], children: [] };
  const evil = structuredClone(base);
  evil.learn.summary = '<img src=x onerror=alert(1)>';
  evil.title = '<script>bad()</script>';
  const out = api.renderDiff(base, evil);
  assert.ok(!out.includes("<img"), "img tag must be escaped");
  assert.ok(!out.includes("<script>"), "script tag must be escaped");
  assert.ok(out.includes("&lt;img"), "escaped form present");
});

test("renderDiff reports adds, removals, and field changes", () => {
  const base = { id: "t", title: "Topic", tier: "essential",
    learn: { summary: "old summary", links: [] }, do: ["a"],
    children: [{ id: "gone", title: "Gone", tier: "extra",
                 learn: { summary: "s", links: [] }, do: ["d"] }] };
  const next = { id: "t", title: "Topic", tier: "essential",
    learn: { summary: "new summary", links: [] }, do: ["a"],
    children: [{ id: "fresh", title: "Fresh", tier: "recommended",
                 learn: { summary: "s", links: [] }, do: ["d"] }] };
  const out = api.renderDiff(base, next);
  assert.ok(out.includes("Fresh"), "added child listed");
  assert.ok(out.includes("Gone"), "removed child listed");
  assert.ok(out.includes("new summary") && out.includes("old summary"), "summary diff");
});

test("editorMode role matrix", () => {
  const rm = { id: "astro" };
  const maint = { astro: { uid: "maint-uid", name: "M" } };
  const CFG = { projectId: "x" };
  assert.equal(api.editorModeWith({ devMode: true }), "dev");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: null,
    user: { provider: "google", id: "someone" } }), "export");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "admin-uid" }, currentRm: rm }), "merge");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "apple", id: "maint-uid" }, currentRm: rm,
    MAINTAINERS: maint }), "merge");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "apple", id: "maint-uid" }, currentRm: { id: "cooking" },
    MAINTAINERS: maint }), "propose");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: null, id: "guest" }, currentRm: rm }), "export");
});

test("applyMergedDocs: the five structural kinds", () => {
  const T = (id) => ({ id, title: id.toUpperCase(), tier: "essential",
    learn: { summary: "s", links: [] }, do: ["d"], children: [] });
  const topics = ["01-a.json", "02-b.json", "03-c.json"];
  const nodes = [T("a"), T("b"), T("c")];

  let r = api.applyMergedDocs(topics, nodes,
    [{ kind: "edit", file: "02-b.json", topic: { ...T("b"), title: "B2" }, at: 1 }]);
  assert.equal(r.nodes[1].title, "B2");
  assert.deepEqual(nodes.map((n) => n.title), ["A", "B", "C"], "inputs not mutated");

  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "add", file: "04-d.json", topic: T("d"), after: "01-a.json", at: 1 }]);
  assert.deepEqual(r.topics, ["01-a.json", "04-d.json", "02-b.json", "03-c.json"]);
  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "add", file: "04-d.json", topic: T("d"), after: "", at: 1 }]);
  assert.equal(r.topics[0], "04-d.json", "empty after = top of the map");
  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "add", file: "02-b.json", topic: T("x"), after: "", at: 1 }]);
  assert.deepEqual(r.topics, topics, "add of an already-landed file is a no-op");

  r = api.applyMergedDocs(topics, nodes, [{ kind: "remove", file: "02-b.json", at: 1 }]);
  assert.deepEqual(r.topics, ["01-a.json", "03-c.json"]);
  assert.deepEqual(r.nodes.map((n) => n.id), ["a", "c"]);

  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "spine", spine: ["03-c.json", "01-a.json", "02-b.json"], at: 1 }]);
  assert.deepEqual(r.nodes.map((n) => n.id), ["c", "a", "b"]);

  const src = T("a");
  const dst = { ...T("b"), children: [T("moved")] };
  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "move", file: "01-a.json", topic: src, file2: "02-b.json", topic2: dst, at: 1 }]);
  assert.equal(r.nodes[1].children[0].id, "moved");

  r = api.applyMergedDocs(topics, nodes, [
    { kind: "edit", file: "04-d.json", topic: { ...T("d"), title: "D2" }, at: 2 },
    { kind: "add", file: "04-d.json", topic: T("d"), after: "", at: 1 },
  ]);
  assert.equal(r.nodes[0].title, "D2", "docs apply in `at` order across kinds");

  const legacy = api.applyMergedDocs(topics, nodes,
    [{ file: "03-c.json", topic: { ...T("c"), title: "C2" }, at: 1 }]);
  assert.equal(legacy.nodes[2].title, "C2", "docs without kind behave as edits");
});

test("flatten and esc basics", () => {
  const rm = { nodes: [{ id: "a", children: [{ id: "b" }, { id: "c" }] },
                       { id: "d" }] };
  assert.deepEqual(api.flatten(rm).map((n) => n.id), ["a", "b", "c", "d"]);
  assert.equal(api.esc('<a b="c">&\''), "&lt;a b=&quot;c&quot;&gt;&amp;&#39;");
});
