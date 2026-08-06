// Landing script — turns in-app merges (Firestore `merged` docs) into
// attributed commits on main. Runs inside .github/workflows/land-content.yml
// with the FIREBASE_SERVICE_ACCOUNT secret; the Admin SDK bypasses security
// rules by design (trusted infrastructure).
//
// Lifecycle of a merged doc:
//   1. created by a moderator in-app  → serves users instantly (overlay)
//   2. this script writes the topic file, validates with build.py, commits
//      → stamps {committedSha}
//   3. NEXT run: if committedSha is an ancestor of main (deploy already ran),
//      delete the doc — the static base has caught up.
//   Validation failure → stamps {error} and skips until an overseer clears it.
//
// Local dry run:  node tools/land.mjs --dry   (needs GOOGLE_APPLICATION_CREDENTIALS)
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
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

const snap = await db.collection("merged").orderBy("at").get();
if (snap.empty) { console.log("Nothing to land."); process.exit(0); }

let committed = 0;
for (const docSnap of snap.docs) {
  const m = docSnap.data();
  const label = `${m.roadmap}/topics/${m.file}`;

  // Phase 2 → 3: already committed? Delete once the commit is on main.
  if (m.committedSha) {
    try {
      sh(`git merge-base --is-ancestor ${m.committedSha} HEAD`);
      if (!DRY) await docSnap.ref.delete();
      console.log(`retired ${label} (landed as ${m.committedSha.slice(0, 8)})`);
    } catch { console.log(`waiting ${label} — commit not on main yet`); }
    continue;
  }
  if (m.error) { console.log(`skipping ${label} — needs attention: ${m.error}`); continue; }

  // sanity: path shape re-checked here even though rules enforce it
  if (!/^[a-z0-9-]{1,50}$/.test(m.roadmap) || !/^[0-9]{2}-[a-z0-9-]+\.json$/.test(m.file)) {
    if (!DRY) await docSnap.ref.update({ error: "bad path" });
    continue;
  }
  const dir = join(ROOT, "roadmaps", m.roadmap, "topics");
  if (!existsSync(dir)) {
    if (!DRY) await docSnap.ref.update({ error: `unknown roadmap ${m.roadmap}` });
    continue;
  }
  writeFileSync(join(dir, m.file), JSON.stringify(m.topic, null, 2) + "\n");
  try {
    sh("python3 tools/build.py");     // the same gate CI applies
  } catch (e) {
    console.log(`validation FAILED for ${label}`);
    sh(`git checkout -- roadmaps/`);
    if (!DRY) await docSnap.ref.update({
      error: "validation failed: " + String(e.stdout || e.message).slice(-500) });
    continue;
  }
  const message =
    `Content: ${m.topic.title} (${m.roadmap})\n\n` +
    `Proposed by ${m.by.name} via the app; merged in-app by ${m.mergedBy.name}.` +
    (m.note ? `\nNote: ${m.note}` : "") + `\nMerged-doc: ${docSnap.id}`;
  if (DRY) { console.log(`DRY: would commit ${label}\n---\n${message}\n---`); sh("git checkout -- roadmaps/"); continue; }
  sh(`git add roadmaps/`);
  sh(`git -c user.name="hkr-landing" -c user.email="landing@users.noreply.github.com" ` +
     `commit -m ${JSON.stringify(message)}`);
  await docSnap.ref.update({ committedSha: sh("git rev-parse HEAD") });
  console.log(`committed ${label}`);
  committed++;
}

if (committed && !DRY) sh("git push origin HEAD");
console.log(committed ? `Pushed ${committed} commit(s).` : "No new commits.");
// signal to the workflow whether a deploy is needed
writeFileSync(join(ROOT, ".landed"), String(committed));
