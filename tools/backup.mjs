// Backup — dump every Firestore collection (user progress, suggestions,
// proposals, tips, merged, roles) to a dated local file. Run monthly, on the
// overseer's machine only — backups contain user data and stay out of git.
//
//   export GOOGLE_APPLICATION_CREDENTIALS=~/secrets/hkr-service-account.json
//   npm install --no-save firebase-admin && node tools/backup.mjs
//
// (The service-account JSON is the same one the landing Action uses; keep it
// in a password manager / private folder, never in this repository.)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const dump = { exportedAt: new Date().toISOString(), collections: {} };
for (const coll of await db.listCollections()) {
  const snap = await coll.get();
  dump.collections[coll.id] = {};
  snap.forEach((d) => { dump.collections[coll.id][d.id] = d.data(); });
  console.log(`  ${coll.id}: ${snap.size} docs`);
}
mkdirSync(join(ROOT, "backups"), { recursive: true });
const out = join(ROOT, "backups",
  `hkr-firestore-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`);
writeFileSync(out, JSON.stringify(dump, null, 1));
console.log(`OK -> ${out}`);
