// Landing script — turns in-app merges (Firestore `merged` docs) into
// attributed commits on main. Runs inside .github/workflows/land-content.yml
// with the FIREBASE_SERVICE_ACCOUNT secret; the Admin SDK bypasses security
// rules by design (trusted infrastructure).
//
// Lifecycle of a merged doc — all within ONE workflow run:
//   1. created by a moderator in-app  → serves users instantly (overlay)
//   2. this script writes the topic file, validates with build.py, commits,
//      pushes, and reports the landed doc ids via GITHUB_OUTPUT
//   3. after Pages deploys, the workflow calls this script again with
//      --retire (ids in $RETIRE_IDS) to delete the docs — the static base
//      has caught up, so the overlay is no longer needed.
//   Validation failure → stamps {error} and skips until an overseer clears it.
//
// Local dry run:  node tools/land.mjs --dry   (needs GOOGLE_APPLICATION_CREDENTIALS)
import { execSync } from "node:child_process";
import { writeFileSync, appendFileSync, existsSync, readFileSync, rmSync,
         readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes("--dry");
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();

admin.initializeApp({
  credential: process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.applicationDefault(),
});
const db = admin.firestore();

// --retire: deploy finished; the static base now covers these docs.
if (process.argv.includes("--retire")) {
  const ids = (process.env.RETIRE_IDS || "").split(/\s+/).filter(Boolean);
  for (const id of ids) {
    await db.collection("merged").doc(id).delete();
    console.log(`retired ${id}`);
  }
  process.exit(0);
}

const snap = await db.collection("merged").orderBy("at").get();

const FILE_RE = /^[0-9]{2}-[a-z0-9-]+\.json$/;
const rollback = () => { sh("git checkout -- roadmaps/"); sh("git clean -fd -- roadmaps/"); };

// Apply one structural op to the working tree. Same vocabulary as the in-app
// editor and tools/dev.py: edit | add | remove | spine | move.
// Returns the commit title; throws with a readable message on a malformed doc.
function applyOp(m) {
  const dir = join(ROOT, "roadmaps", m.roadmap, "topics");
  const metaP = join(ROOT, "roadmaps", m.roadmap, "meta.json");
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

  if (kind === "edit") {
    needFile(m.file);
    writeTopic(m.file, m.topic);
    return `Content: ${m.topic.title} (${m.roadmap})`;
  }
  if (kind === "add") {
    needFile(m.file);
    if (existsSync(join(dir, m.file))) throw new Error(`${m.file} already exists`);
    if (m.after !== "" && !FILE_RE.test(m.after)) throw new Error("bad 'after'");
    const spine = spineNow();
    const pos = m.after === "" ? 0
      : (spine.indexOf(m.after) >= 0 ? spine.indexOf(m.after) + 1 : spine.length);
    spine.splice(pos, 0, m.file);
    writeTopic(m.file, m.topic);
    saveSpine(spine);
    return `Content: add ${m.topic.title} (${m.roadmap})`;
  }
  if (kind === "remove") {
    needFile(m.file);
    if (existsSync(join(dir, m.file))) rmSync(join(dir, m.file));
    saveSpine(spineNow().filter((f) => f !== m.file));
    return `Structure: remove ${m.file} (${m.roadmap})`;
  }
  if (kind === "spine") {
    if (!Array.isArray(m.spine) || m.spine.some((f) => !FILE_RE.test(f)))
      throw new Error("bad spine list");
    saveSpine([...m.spine]);
    return `Structure: reorder core topics (${m.roadmap})`;
  }
  if (kind === "move") {
    needFile(m.file); needFile(m.file2);
    if (m.file === m.file2) throw new Error("move needs two different files");
    writeTopic(m.file, m.topic);
    writeTopic(m.file2, m.topic2);
    return `Structure: move a subtopic between ${m.file} and ${m.file2} (${m.roadmap})`;
  }
  throw new Error(`unknown kind ${kind}`);
}

let commits = 0;
const landed = [];   // doc ids whose content is now on main → retire after deploy
for (const docSnap of snap.docs) {
  const m = docSnap.data();
  const label = `${m.roadmap}: ${m.kind || "edit"} ${m.file || ""}`.trim();
  if (m.error) { console.log(`skipping ${label} — needs attention: ${m.error}`); continue; }

  // sanity: shapes re-checked here even though rules enforce them
  if (!/^[a-z0-9-]{1,50}$/.test(m.roadmap)) {
    if (!DRY) await docSnap.ref.update({ error: "bad roadmap id" });
    continue;
  }
  let title;
  try {
    title = applyOp(m);
    sh("python3 tools/build.py");     // the same gate CI applies
  } catch (e) {
    console.log(`validation FAILED for ${label}`);
    rollback();
    if (!DRY) await docSnap.ref.update({
      error: "validation failed: " + String(e.stdout || e.message).slice(-500) });
    continue;
  }
  if (!sh("git status --porcelain -- roadmaps/")) {
    // identical to main already (e.g. a rerun after a failed deploy) — just retire
    landed.push(docSnap.id);
    console.log(`already landed ${label}`);
    continue;
  }
  const message =
    `${title}\n\n` +
    `Proposed by ${m.by.name} via the app; merged in-app by ${m.mergedBy.name}.` +
    (m.note ? `\nNote: ${m.note}` : "") + `\nMerged-doc: ${docSnap.id}`;
  if (DRY) { console.log(`DRY: would commit ${label}\n---\n${message}\n---`); rollback(); continue; }
  sh(`git add roadmaps/`);
  sh(`git -c user.name="hkr-landing" -c user.email="landing@users.noreply.github.com" ` +
     `commit -m ${JSON.stringify(message)}`);
  console.log(`committed ${label}`);
  landed.push(docSnap.id);
  commits++;
}

if (commits && !DRY) sh("git push origin HEAD");
console.log(commits ? `Pushed ${commits} commit(s).`
  : (landed.length ? "No new commits (content already on main)." : "Nothing to land."));
// tell the workflow whether to deploy, and which docs to retire afterwards
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT,
    `landed=${landed.length}\nlanded_ids=${landed.join(" ")}\n`);
