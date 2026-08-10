// Tests for tools/ops.mjs — the ONE op engine behind tools/land.mjs (landing
// Action) and tools/dev.py (via tools/apply.mjs). One suite covers both
// consumers. Runs with the plain client tests: node --test tests/
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyOp, bumpVersion, appendChangelog } from "../tools/ops.mjs";

let root;
const RM = "testmap";
const metaP = () => join(root, "roadmaps", RM, "meta.json");
const topicP = (f) => join(root, "roadmaps", RM, "topics", f);
const clogP = () => join(root, "roadmaps", RM, "changelog.json");
const readJ = (p) => JSON.parse(readFileSync(p, "utf8"));
const topic = (id, title) => ({ id, title, tier: "essential",
  learn: { summary: "s", links: [] }, do: ["a"] });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hkr-ops-"));
  mkdirSync(join(root, "roadmaps", RM, "topics"), { recursive: true });
  writeFileSync(metaP(), JSON.stringify({ id: RM, title: "T", version: "1.0.0" }) + "\n");
  writeFileSync(topicP("01-a.json"), JSON.stringify(topic("a", "A")) + "\n");
  writeFileSync(topicP("02-b.json"), JSON.stringify(topic("b", "B")) + "\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("edit: rewrites the file, patch-bumps, logs newest-first", () => {
  const title = applyOp(root, { roadmap: RM, kind: "edit", file: "01-a.json",
    topic: topic("a", "A2"), by: { name: "U" } });
  assert.match(title, /^Content: A2/);
  assert.equal(readJ(topicP("01-a.json")).title, "A2");
  assert.equal(readJ(metaP()).version, "1.0.1");
  const clog = readJ(clogP());
  assert.equal(clog.entries[0].kind, "edit");
  assert.equal(clog.entries[0].by, "U");
  assert.equal(clog.entries[0].version, "1.0.1");
});

test("add: creates the file, inserts into the spine, minor-bumps", () => {
  applyOp(root, { roadmap: RM, kind: "add", file: "03-c.json",
    topic: topic("c", "C"), after: "01-a.json", by: { name: "U" } });
  assert.ok(existsSync(topicP("03-c.json")));
  assert.deepEqual(readJ(metaP()).spine, ["01-a.json", "03-c.json", "02-b.json"]);
  assert.equal(readJ(metaP()).version, "1.1.0");
});

test("add at the top with empty 'after'; existing file refused", () => {
  applyOp(root, { roadmap: RM, kind: "add", file: "03-c.json",
    topic: topic("c", "C"), after: "", by: { name: "U" } });
  assert.deepEqual(readJ(metaP()).spine, ["03-c.json", "01-a.json", "02-b.json"]);
  assert.throws(() => applyOp(root, { roadmap: RM, kind: "add", file: "03-c.json",
    topic: topic("c", "C"), after: "" }), /already exists/);
});

test("remove: deletes the file and drops it from the spine", () => {
  applyOp(root, { roadmap: RM, kind: "remove", file: "01-a.json", by: { name: "U" } });
  assert.ok(!existsSync(topicP("01-a.json")));
  assert.deepEqual(readJ(metaP()).spine, ["02-b.json"]);
  assert.equal(readJ(metaP()).version, "1.1.0");
});

test("spine: saves the new order; rejects bad names", () => {
  applyOp(root, { roadmap: RM, kind: "spine",
    spine: ["02-b.json", "01-a.json"], by: { name: "U" } });
  assert.deepEqual(readJ(metaP()).spine, ["02-b.json", "01-a.json"]);
  assert.throws(() => applyOp(root, { roadmap: RM, kind: "spine",
    spine: ["../evil.json"] }), /bad spine list/);
});

test("move: writes both touched files", () => {
  applyOp(root, { roadmap: RM, kind: "move", file: "01-a.json", file2: "02-b.json",
    topic: topic("a", "A3"), topic2: topic("b", "B3"), by: { name: "U" } });
  assert.equal(readJ(topicP("01-a.json")).title, "A3");
  assert.equal(readJ(topicP("02-b.json")).title, "B3");
});

test("about: sets meta.about, patch-bumps; size limits hold", () => {
  const about = "Long enough to clear the twenty-character floor easily.";
  applyOp(root, { roadmap: RM, kind: "about", about, by: { name: "U" } });
  assert.equal(readJ(metaP()).about, about);
  assert.equal(readJ(metaP()).version, "1.0.1");
  assert.throws(() => applyOp(root, { roadmap: RM, kind: "about", about: "short" }),
    /bad about text/);
});

test("missing attribution never crashes the engine (land.mjs regression)", () => {
  // rules now require by/mergedBy, but a legacy doc without them must apply
  // cleanly with blank attribution rather than throwing out of the loop
  assert.doesNotThrow(() => applyOp(root, { roadmap: RM, kind: "edit",
    file: "01-a.json", topic: topic("a", "A2") }));
  assert.equal(readJ(clogP()).entries[0].by, "");
});

test("unknown kind, bad file name, unknown roadmap all throw readable errors", () => {
  assert.throws(() => applyOp(root, { roadmap: RM, kind: "explode" }), /unknown kind/);
  assert.throws(() => applyOp(root, { roadmap: RM, kind: "edit",
    file: "evil.json", topic: topic("a", "A") }), /bad file name/);
  assert.throws(() => applyOp(root, { roadmap: "nope", kind: "edit",
    file: "01-a.json", topic: topic("a", "A") }), /unknown roadmap/);
});

test("bumpVersion: patch and minor discipline", () => {
  assert.equal(bumpVersion(metaP(), "patch"), "1.0.1");
  assert.equal(bumpVersion(metaP(), "minor"), "1.1.0");
});

test("appendChangelog: newest first, capped at 100, survives a corrupt file", () => {
  for (let i = 0; i < 105; i++)
    appendChangelog(clogP(), { at: String(i), version: "1.0.0", kind: "edit",
      file: "", title: "", summary: String(i), by: "" });
  const clog = readJ(clogP());
  assert.equal(clog.entries.length, 100);
  assert.equal(clog.entries[0].summary, "104");
  writeFileSync(clogP(), "not json");
  appendChangelog(clogP(), { at: "x", version: "1.0.0", kind: "edit",
    file: "", title: "", summary: "fresh", by: "" });
  assert.equal(readJ(clogP()).entries[0].summary, "fresh");
});
