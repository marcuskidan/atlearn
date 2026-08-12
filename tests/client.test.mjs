// Client pure-logic tests. Run in CI: node --test tests/
// The functions under test live inline in index.html (single-file app, by
// design). extractFn() — imported from tools/extract.mjs, the ONE extractor —
// brace-matches each `function name(...)` declaration out of the source and
// evaluates it in a vm sandbox: single source of truth, no copied code to drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { extractFn } from "../tools/extract.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const cases = JSON.parse(readFileSync(join(root, "tests", "cases.json"), "utf8"));

const fns = ["esc", "flatten", "contentHash", "migrateStore", "mergeStores",
             "renderDiff", "editorMode", "applyMergedDocs",
             "textDelta", "classifyEditWeight", "linkRowHTML", "stepHTML"];
const script = `
let devMode=false, FIREBASE_CONFIG=null, user={provider:null,id:"guest"},
    currentRm=null, currentFork=null, EDIT_MODE=false,
    MAINTAINERS={}, ADMINS=["admin-uid"], SUPERADMINS=[];
const STORE_V=2;
${extractFn(html, "isAdmin")}
${extractFn(html, "maintains")}
${extractFn(html, "forkOwned")}
${fns.map((n) => extractFn(html, n)).join("\n")}
({ esc, flatten, contentHash, migrateStore, mergeStores, renderDiff, applyMergedDocs,
   textDelta, classifyEditWeight, linkRowHTML, stepHTML,
   editorModeWith(o){
     devMode=o.devMode||false;
     FIREBASE_CONFIG=("FIREBASE_CONFIG" in o)?o.FIREBASE_CONFIG:null;
     user=o.user||{provider:null,id:"guest"}; currentRm=o.currentRm||null;
     currentFork=o.currentFork||null;
     EDIT_MODE=o.EDIT_MODE||false;
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
    assert.equal(out.v, 2, `${c.name}: output carries v:2`);
    for (const [path, want] of Object.entries(c.expect))
      assert.deepEqual(resolve(out.progress, path), want, `${c.name}: ${path}`);
    for (const [path, want] of Object.entries(c.expectRoot || {}))
      assert.deepEqual(JSON.parse(JSON.stringify(resolve(out, path))), want,
        `${c.name}: ${path}`);   // JSON round-trip: vm-context objects are cross-realm
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
    if (c.expectEmpty)
      assert.deepEqual(JSON.parse(JSON.stringify(out.progress)), {}, c.name);
    if (c.expectPath)
      assert.equal(resolve(out.progress, c.expectPath), c.expectValue, c.name);
    for (const [path, want] of Object.entries(c.expectRoot || {}))
      assert.deepEqual(JSON.parse(JSON.stringify(resolve(out, path))), want,
        `${c.name}: ${path}`);   // JSON round-trip: vm-context objects are cross-realm
  }
});

test("classifyEditWeight: trivial vs substantive", () => {
  const T = { id: "t", title: "Topic", tier: "essential",
    learn: { summary: "A stable, curated summary sentence for testing.", links: [
      { label: "L", url: "https://a.example/x", kind: "article" }] },
    do: ["Do the thing this week."], children: [] };
  const clone = () => structuredClone(T);

  // identical → trivial
  assert.equal(api.classifyEditWeight(T, clone()), "trivial");
  // link swap only → trivial (the succession-promotion case)
  let b = clone(); b.learn.links[0].url = "https://b.example/y";
  assert.equal(api.classifyEditWeight(T, b), "trivial");
  // link metadata stamp → trivial
  b = clone(); b.learn.links[0].verified = "2026-08-07";
  assert.equal(api.classifyEditWeight(T, b), "trivial");
  // typo-scale text change → trivial
  b = clone(); b.learn.summary = T.learn.summary.replace("stable", "stables");
  assert.equal(api.classifyEditWeight(T, b), "trivial");
  // rewritten summary → substantive
  b = clone(); b.learn.summary = "An entirely different framing of this topic.";
  assert.equal(api.classifyEditWeight(T, b), "substantive");
  // title change → substantive
  b = clone(); b.title = "Renamed Topic";
  assert.equal(api.classifyEditWeight(T, b), "substantive");
  // tier change → substantive
  b = clone(); b.tier = "extra";
  assert.equal(api.classifyEditWeight(T, b), "substantive");
  // added subtopic → substantive
  b = clone(); b.children = [{ id: "c1", title: "C", tier: "extra",
    learn: { summary: "s", links: [] }, do: ["d"] }];
  assert.equal(api.classifyEditWeight(T, b), "substantive");
  // missing sides → substantive (never default trivial)
  assert.equal(api.classifyEditWeight(null, clone()), "substantive");
});

test("textDelta: 0 for equal, grows with change", () => {
  assert.equal(api.textDelta("abc", "abc"), 0);
  assert.ok(api.textDelta("abcdefghij", "abcXefghij") <= 0.2);
  assert.ok(api.textDelta("completely", "different!") > 0.5);
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

test("drawer render escapes user-controlled HTML (fork content)", () => {
  // Fork ops carry attacker-controlled topics; the drawer renders them to
  // anyone with the link. Every injected field must arrive escaped.
  const evilLink = { kind: '"><img src=x onerror=alert(1)>',
    label: "<script>bad()</script>", url: "https://a.example/x",
    lang: "<b>xx</b>", minutes: 5 };
  const row = api.linkRowHTML(evilLink);
  assert.ok(!row.includes("<img"), "img tag must be escaped");
  assert.ok(!row.includes('"><'), "kind must not break out of the class attribute");
  assert.ok(!row.includes("<script>"), "script tag must be escaped");
  assert.ok(!row.includes("<b>"), "lang must be escaped");
  assert.ok(row.includes("&lt;script&gt;"), "escaped form present");

  const step = api.stepHTML('<img src=x onerror=alert(1)>');
  assert.ok(!step.includes("<img"), "step text must be escaped");
  assert.ok(step.includes("&lt;img"), "escaped form present");
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
  // branches: the owner saves to the branch; a stranger proposes only
  // through an opened suggestions door (Stage 5), and never dev-writes
  const branch = (over) => ({ id: "f1", owner: { uid: "owner-uid" }, ...over });
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "owner-uid" }, currentRm: rm,
    currentFork: branch() }), "fork");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "someone" }, currentRm: rm,
    currentFork: branch({ suggestions: true }) }), "propose");
  assert.equal(api.editorModeWith({ FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "someone" }, currentRm: rm,
    currentFork: branch() }), "export");
  assert.equal(api.editorModeWith({ devMode: true, FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "someone" }, currentRm: rm,
    currentFork: branch({ suggestions: true }) }), "propose");
  // edit mode: every official-map save is LOCAL, whoever you are — even
  // signed out, even on the dev server; role matters only at commit
  assert.equal(api.editorModeWith({ EDIT_MODE: true, FIREBASE_CONFIG: CFG,
    user: { provider: null, id: "guest" }, currentRm: rm }), "local");
  // …and since 2026-08-11 personal surfaces batch locally in the mode
  // too: owner and suggestions-door stranger alike commit at the bar
  assert.equal(api.editorModeWith({ EDIT_MODE: true, FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "owner-uid" }, currentRm: rm,
    currentFork: branch() }), "local");
  assert.equal(api.editorModeWith({ EDIT_MODE: true, FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "someone" }, currentRm: rm,
    currentFork: branch({ suggestions: true }) }), "local");
  assert.equal(api.editorModeWith({ EDIT_MODE: true, devMode: true,
    FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "admin-uid" }, currentRm: rm }), "local");
  // a branch never enters edit mode — its own rules stand
  assert.equal(api.editorModeWith({ EDIT_MODE: true, FIREBASE_CONFIG: CFG,
    user: { provider: "google", id: "owner-uid" }, currentRm: rm,
    currentFork: branch() }), "fork");
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

  // kind "about" targets meta.json — the topic overlay must ignore it untouched
  r = api.applyMergedDocs(topics, nodes,
    [{ kind: "about", about: "New lead prose for the category page.", at: 1 }]);
  assert.deepEqual(r.topics, topics);
  assert.deepEqual(r.nodes.map((n) => n.id), ["a", "b", "c"]);

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
