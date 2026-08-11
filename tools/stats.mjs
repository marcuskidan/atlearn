// Usage stats — the evidence, counted server-side (PLAN Workstream B).
// Runs inside .github/workflows/stats.yml with the FIREBASE_SERVICE_ACCOUNT
// secret. Counts derive from EXPLICIT server writes only — accounts, saves,
// creations, queue items. No visitor is observed: walkers who never sign in
// are invisible by design (PRODUCTS §1's promise, kept), and nothing here
// ever surfaces a uid, a title, or a doc id — aggregates only, so unlisted
// work stays unlisted.
//
// Output: roadmaps/stats.json, committed when changed (git history is the
// trend line — no database of days needed). Surfaced on the account page's
// admin panel. GOVERNANCE: popularity is evidence, never ranking — this
// file feeds review judgment, not any public surface.
//
// Local dry run:  node tools/stats.mjs --dry  (needs GOOGLE_APPLICATION_CREDENTIALS)
import { execSync } from "node:child_process";
import { writeFileSync, writeSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes("--dry");
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();

// Same public self-diagnosis as land.mjs: say what's wrong with the secret
// without echoing a byte of it (::error:: annotations render sign-in-free).
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
  credential = admin.credential.applicationDefault();
}
admin.initializeApp({ credential });
const db = admin.firestore();

const count = async (q) => (await q.count().get()).data().count;

// Library map ids from the generated index — progress keys either name one
// of these (official map; branch walking folds in, since a fork keeps its
// base's id) or carry the u: prefix (personal maps, counted in aggregate).
const libraryIds = new Set(
  JSON.parse(readFileSync(join(ROOT, "roadmaps/index.json"), "utf8"))
    .roadmaps.map((r) => r.id));

// Accounts + paths started: one field-masked sweep of users/{uid}. A "path
// started" = at least one saved mark on that map — an explicit write, never
// a page view. Individual records inform nothing beyond the increment.
let accounts = 0, personalWalkers = 0;
const library = {};
const users = await db.collection("users").select("progress").get();
users.forEach((doc) => {
  accounts++;
  let personal = false;
  const progress = doc.get("progress") || {};
  for (const [key, marks] of Object.entries(progress)) {
    if (!marks || !Object.keys(marks).length) continue;
    if (libraryIds.has(key)) library[key] = (library[key] || 0) + 1;
    else if (key.startsWith("u:")) personal = true;
  }
  if (personal) personalWalkers++;
});

const supDoc = await db.doc("meta/supporters").get();
const merged = await db.collection("merged").get();

const stats = {
  generated: new Date().toISOString().slice(0, 10),
  accounts,
  supporters: Object.keys(supDoc.exists ? (supDoc.data().members || {}) : {}).length,
  walking: {
    library,                       // map id → accounts with ≥1 saved mark
    personal: personalWalkers,     // accounts walking any personal map
  },
  creations: {
    forks: await count(db.collection("forks")),
    usermaps: await count(db.collection("usermaps")),
    usermapsListed: await count(db.collection("usermaps").where("listed", "==", true)),
    handles: await count(db.collection("handles")),
    collections: await count(db.collection("collections")),
  },
  queue: {
    proposalsPending: await count(db.collection("proposals").where("status", "==", "pending")),
    proposalsMerged: await count(db.collection("proposals").where("status", "==", "merged")),
    suggestionsPending: await count(db.collection("suggestions").where("status", "==", "pending")),
    reportsOpen: await count(db.collection("reports").where("status", "==", "open")),
    mergedWaiting: merged.size,
    mergedErrors: merged.docs.filter((d) => d.get("error")).length,
  },
};

const path = join(ROOT, "roadmaps/stats.json");
const next = JSON.stringify(stats, null, 2) + "\n";
let prev = null;
try { prev = readFileSync(path, "utf8"); } catch {}
// Only the date moved → nothing happened; don't manufacture a commit.
if (prev && prev.replace(/"generated":.*/, "") === next.replace(/"generated":.*/, "")) {
  console.log("stats unchanged — no commit");
  process.exit(0);
}
writeFileSync(path, next);
console.log(next);
if (DRY) { console.log("dry run — not committed"); process.exit(0); }

sh(`git add roadmaps/stats.json`);
sh(`git -c user.name="atlearn-stats" -c user.email="stats@users.noreply.github.com" ` +
   `commit -m "stats: ${stats.generated}"`);
sh(`git push origin HEAD`);
console.log("committed and pushed");
