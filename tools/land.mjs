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
//   Validation failure → stamps {error} and skips until an admin clears it.
//
// Local dry run:  node tools/land.mjs --dry   (needs GOOGLE_APPLICATION_CREDENTIALS)
import { execSync } from "node:child_process";
import { appendFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { applyOp } from "./ops.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes("--dry");
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();

// Credential failures must diagnose themselves publicly: the repo is public
// but run LOGS need a sign-in — ::error:: annotations don't. Say what is
// wrong with the secret (absent / not JSON / incomplete / rejected) without
// ever echoing a byte of it. writeSync so process.exit can't truncate.
const fatal = (msg) => {
  writeSync(1, (process.env.GITHUB_ACTIONS ? `::error::${msg}` : msg) + "\n");
  process.exit(1);
};

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let credential;
if (raw) {
  let sa;
  try { sa = JSON.parse(raw); }
  catch { fatal(`FIREBASE_SERVICE_ACCOUNT is not valid JSON (${raw.length} chars) — re-paste the whole service-account file into the Actions secret (DEPLOY.md Stage 2).`); }
  const missing = ["project_id", "client_email", "private_key"].filter((k) => !sa[k]);
  if (missing.length) fatal(`FIREBASE_SERVICE_ACCOUNT is JSON but lacks ${missing.join(", ")} — paste the unmodified service-account JSON from the Firebase console.`);
  credential = admin.credential.cert(sa);
} else if (process.env.GITHUB_ACTIONS) {
  fatal("FIREBASE_SERVICE_ACCOUNT is empty in this run — create a repository Actions secret named exactly FIREBASE_SERVICE_ACCOUNT (Settings → Secrets and variables → Actions).");
} else {
  credential = admin.credential.applicationDefault(); // local dry runs
}
admin.initializeApp({ credential });
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

let snap;
try {
  snap = await db.collection("merged").orderBy("at").get();
} catch (e) {
  // secret parsed but Google rejected it — disabled/deleted key, wrong
  // project, or a private_key mangled in a way cert() can't detect
  fatal(`Firestore rejected the service-account credential (${e.code ?? "no code"}): ${String(e.message).slice(0, 300)}`);
}

const rollback = () => { sh("git checkout -- roadmaps/"); sh("git clean -fd -- roadmaps/"); };
// The op grammar's file mutations live in tools/ops.mjs — shared verbatim
// with tools/apply.mjs (which tools/dev.py shells out to). One engine.

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
    title = applyOp(ROOT, m);
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
  // attribution fields are rules-required going forward, but a doc written
  // before that tightening (or by broken tooling) must not kill the run
  const proposedBy = (m.by && m.by.name) || "unknown";
  const mergedByName = (m.mergedBy && m.mergedBy.name) || "unknown";
  const message =
    `${title}\n\n` +
    `Proposed by ${proposedBy} via the app; merged in-app by ${mergedByName}.` +
    (m.note ? `\nNote: ${m.note}` : "") + `\nMerged-doc: ${docSnap.id}`;
  if (DRY) { console.log(`DRY: would commit ${label}\n---\n${message}\n---`); rollback(); continue; }
  sh(`git add roadmaps/`);
  sh(`git -c user.name="hkr-landing" -c user.email="landing@users.noreply.github.com" ` +
     `commit -m ${JSON.stringify(message)}`);
  console.log(`committed ${label}`);
  landed.push(docSnap.id);
  commits++;
}

if (commits && !DRY) {
  try {
    sh("git push origin HEAD");
  } catch (e) {
    // Commits exist locally but main didn't get them — exit BEFORE writing
    // GITHUB_OUTPUT so nothing deploys or retires; the docs stay in `merged`
    // and the next run re-lands them via the already-landed short-circuit.
    console.error("git push failed — nothing retired, next run will re-land:",
      String(e.stderr || e.message).slice(-500));
    process.exit(1);
  }
}
console.log(commits ? `Pushed ${commits} commit(s).`
  : (landed.length ? "No new commits (content already on main)." : "Nothing to land."));
// tell the workflow whether to deploy, and which docs to retire afterwards
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT,
    `landed=${landed.length}\nlanded_ids=${landed.join(" ")}\n`);
