// The ONE implementation of the six-op grammar's file mutations:
//   edit | add | remove | spine | move | about
// Consumed by tools/land.mjs (landing Action) and tools/apply.mjs (which
// tools/dev.py shells out to) — the same code path writes topic files no
// matter where an op came from. Validation stays with the callers:
// dev.py pre-validates topics for friendly editor errors, and both callers
// gate on tools/build.py afterwards.
import { writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FILE_RE = /^[0-9]{2}-[a-z0-9-]+\.json$/;

// Apply one structural op to the working tree under `root`.
// Returns the commit/changelog title; throws with a readable message on a
// malformed op. Also bumps meta.json's version and appends the changelog —
// version + changelog ride with the content, always.
export function applyOp(root, m) {
  const dir = join(root, "roadmaps", m.roadmap, "topics");
  const metaP = join(root, "roadmaps", m.roadmap, "meta.json");
  if (!existsSync(dir)) throw new Error(`unknown roadmap ${m.roadmap}`);
  const writeTopic = (f, t) => writeFileSync(join(dir, f), JSON.stringify(t, null, 2) + "\n");
  const spineNow = () => {
    const meta = JSON.parse(readFileSync(metaP, "utf8"));
    return meta.spine ? [...meta.spine]
      : readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  };
  const saveSpine = (spine) => {
    const meta = JSON.parse(readFileSync(metaP, "utf8"));
    meta.spine = spine;
    writeFileSync(metaP, JSON.stringify(meta, null, 2) + "\n");
  };
  const needFile = (f) => { if (!FILE_RE.test(f || "")) throw new Error(`bad file name ${f}`); };
  const kind = m.kind || "edit";

  let title;
  if (kind === "edit") {
    needFile(m.file);
    writeTopic(m.file, m.topic);
    title = `Content: ${m.topic.title} (${m.roadmap})`;
  } else if (kind === "add") {
    needFile(m.file);
    if (existsSync(join(dir, m.file))) throw new Error(`${m.file} already exists`);
    if (m.after !== "" && !FILE_RE.test(m.after)) throw new Error("bad 'after'");
    const spine = spineNow();
    const pos = m.after === "" ? 0
      : (spine.indexOf(m.after) >= 0 ? spine.indexOf(m.after) + 1 : spine.length);
    spine.splice(pos, 0, m.file);
    writeTopic(m.file, m.topic);
    saveSpine(spine);
    title = `Content: add ${m.topic.title} (${m.roadmap})`;
  } else if (kind === "remove") {
    needFile(m.file);
    if (existsSync(join(dir, m.file))) rmSync(join(dir, m.file));
    saveSpine(spineNow().filter((f) => f !== m.file));
    title = `Structure: remove ${m.file} (${m.roadmap})`;
  } else if (kind === "spine") {
    if (!Array.isArray(m.spine) || m.spine.some((f) => !FILE_RE.test(f)))
      throw new Error("bad spine list");
    saveSpine([...m.spine]);
    title = `Structure: reorder core topics (${m.roadmap})`;
  } else if (kind === "move") {
    needFile(m.file); needFile(m.file2);
    if (m.file === m.file2) throw new Error("move needs two different files");
    writeTopic(m.file, m.topic);
    writeTopic(m.file2, m.topic2);
    title = `Structure: move a subtopic between ${m.file} and ${m.file2} (${m.roadmap})`;
  } else if (kind === "about") {
    if (typeof m.about !== "string" || m.about.length < 20 || m.about.length > 4000)
      throw new Error("bad about text");
    const meta = JSON.parse(readFileSync(metaP, "utf8"));
    meta.about = m.about;
    writeFileSync(metaP, JSON.stringify(meta, null, 2) + "\n");
    title = `Content: about section (${m.roadmap})`;
  } else {
    throw new Error(`unknown kind ${kind}`);
  }

  // Semantic version + changelog ride with the content in the same commit.
  // edit/about → patch; structural kinds → minor; major is a deliberate
  // hand-edit of meta.json only (a re-architecture, announced by its author).
  const version = bumpVersion(metaP, (kind === "edit" || kind === "about") ? "patch" : "minor");
  appendChangelog(join(root, "roadmaps", m.roadmap, "changelog.json"), {
    at: new Date().toISOString(), version, kind,
    file: m.file || "", title: (m.topic && m.topic.title) || "",
    summary: title, by: (m.by && m.by.name) || "",
  });
  return title;
}

// Bump meta.json's semver in place and return the new version string.
export function bumpVersion(metaP, part) {
  const meta = JSON.parse(readFileSync(metaP, "utf8"));
  const [maj, min, pat] = String(meta.version || "1.0.0").split(".").map(Number);
  meta.version = part === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  writeFileSync(metaP, JSON.stringify(meta, null, 2) + "\n");
  return meta.version;
}

// changelog.json is APPEND-ONLY and generated — never hand-edited. Newest
// first, capped at 100 entries; build.py validates the shape.
export function appendChangelog(clogP, entry) {
  let clog = { generated: true, entries: [] };
  if (existsSync(clogP)) {
    try { clog = JSON.parse(readFileSync(clogP, "utf8")); } catch (e) { /* rebuild */ }
    if (!Array.isArray(clog.entries)) clog = { generated: true, entries: [] };
  }
  clog.entries.unshift(entry);
  clog.entries = clog.entries.slice(0, 100);
  writeFileSync(clogP, JSON.stringify(clog, null, 1) + "\n");
}
