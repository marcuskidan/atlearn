// Link Steward — the agent corps' succession-promotion drafter.
// Runs in .github/workflows/link-check.yml after the nightly lychee sweep.
//
// For each dead URL that carries a pre-vetted `succession` list, this script
// probes the replacements and FILES A PROPOSAL (kind edit, weight trivial,
// by agent:link-steward) with the swap pre-drafted: url → succession[0],
// succession shifted left, `verified` stamped. A named human clicks merge —
// the constitutional line (no content changes hands without a human merge)
// is preserved: agents file, never merge. Stewards can merge these (trivial).
//
//   node tools/succession.mjs dead-links.json     (lychee --format json output)
//
// Needs FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS locally).
// Dry run: add --dry to print the would-be proposals without writing.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { appFns } from "./extract.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes("--dry");
const input = process.argv.filter((a) => a.endsWith(".json"))[0];
if (!input || !existsSync(input)) {
  console.error("usage: node tools/succession.mjs <lychee-json-output> [--dry]");
  process.exit(1);
}

// the app's own contentHash — baseHash must match what the review UI computes
const { contentHash } = appFns("contentHash");

// ---- 1. dead URLs from lychee's JSON report ----
const report = JSON.parse(readFileSync(input, "utf8"));
const dead = new Set();
for (const [, results] of Object.entries(report.fail_map || {}))
  for (const r of results) {
    // lychee marks bot-blocking (403/429) as accepted in our config; anything
    // in fail_map is genuinely unreachable
    dead.add(r.url);
  }
if (!dead.size) { console.log("No dead links — nothing to draft."); process.exit(0); }
console.log(`${dead.size} dead URL(s) in the report.`);

// ---- 2. locate each dead URL in the content tree ----
const sites = [];   // {roadmap, file, topic, linkPath: [nodeRef, linkIdx]}
for (const rmDir of readdirSync(join(ROOT, "roadmaps"), { withFileTypes: true })) {
  if (!rmDir.isDirectory()) continue;
  const tdir = join(ROOT, "roadmaps", rmDir.name, "topics");
  if (!existsSync(tdir)) continue;
  for (const f of readdirSync(tdir).filter((x) => x.endsWith(".json"))) {
    const topic = JSON.parse(readFileSync(join(tdir, f), "utf8"));
    const nodes = [topic, ...(topic.children || [])];
    for (const n of nodes)
      ((n.learn || {}).links || []).forEach((l, i) => {
        if (dead.has(l.url))
          sites.push({ roadmap: rmDir.name, file: f, topic, node: n, linkIdx: i });
      });
  }
}
if (!sites.length) { console.log("Dead URLs not found in content (already fixed?)."); process.exit(0); }

// ---- 3. probe successions, draft proposals ----
const probe = async (url) => {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow",
      signal: AbortSignal.timeout(15000) });
    return r.ok || r.status === 403 || r.status === 429;   // bot-blocking counts alive
  } catch (e) { return false; }
};

admin.initializeApp({
  credential: process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.applicationDefault(),
});
const db = admin.firestore();

// Overlay parity: merged docs not yet landed overlay the repo, and the review
// UI hashes the OVERLAY-APPLIED topic. Hash the same thing here, or every
// agent draft filed while a merge awaits landing renders "map changed since
// this was proposed". One read up front covers all sites.
const mergedSnap = await db.collection("merged").get();
function overlayTopic(roadmap, file, repoTopic) {
  let best = null;
  mergedSnap.forEach((d) => {
    const m = d.data();
    if (m.roadmap !== roadmap || m.error) return;
    const hit =
      ((m.kind || "edit") === "edit" && m.file === file) ? m.topic
      : (m.kind === "move" && m.file === file) ? m.topic
      : (m.kind === "move" && m.file2 === file) ? m.topic2 : null;
    if (hit && (!best || (m.at || 0) > (best.at || 0))) best = { at: m.at || 0, topic: hit };
  });
  return best ? best.topic : repoTopic;
}

let filed = 0, skipped = 0;
for (const site of sites) {
  const deadUrl = site.node.learn.links[site.linkIdx].url;
  // work from the overlay-applied topic; the dead link may already be gone there
  const baseTopic = overlayTopic(site.roadmap, site.file, site.topic);
  const bNodes = [baseTopic, ...(baseTopic.children || [])];
  const bn = bNodes.find((n) => n.id === site.node.id);
  const bIdx = bn ? ((bn.learn || {}).links || []).findIndex((l) => l.url === deadUrl) : -1;
  if (bIdx < 0) {
    console.log(`already fixed in a pending merge: ${deadUrl} (${site.roadmap}/${site.file})`);
    skipped++; continue;
  }
  const link = bn.learn.links[bIdx];
  const succ = link.succession || [];
  if (!succ.length) {
    console.log(`no succession list for dead ${link.url} (${site.roadmap}/${site.file}) — flag stays with the humans`);
    skipped++; continue;
  }
  let winner = null, rest = [...succ];
  while (rest.length && !winner) {
    const cand = rest.shift();
    if (await probe(cand)) winner = cand;
    else console.log(`  succession candidate also dead: ${cand}`);
  }
  if (!winner) { console.log(`entire succession list dead for ${link.url}`); skipped++; continue; }

  // dedupe: one pending agent draft per roadmap+file
  const pending = await db.collection("proposals")
    .where("roadmap", "==", site.roadmap).where("status", "==", "pending")
    .where("file", "==", site.file).get();
  if (pending.docs.some((d) => (d.data().by || {}).uid === "agent:link-steward")) {
    console.log(`already a pending draft for ${site.roadmap}/${site.file}`); skipped++; continue;
  }

  const baseHash = contentHash(baseTopic);
  const drafted = JSON.parse(JSON.stringify(baseTopic));
  const nodes = [drafted, ...(drafted.children || [])];
  const dn = nodes.find((n) => n.id === site.node.id);
  const dl = dn.learn.links[bIdx];
  dl.url = winner;
  dl.succession = rest.length ? rest : undefined;
  if (dl.succession === undefined) delete dl.succession;
  dl.verified = new Date().toISOString().slice(0, 10);

  const proposal = {
    roadmap: site.roadmap, kind: "edit", file: site.file, baseHash,
    topic: drafted, weight: "trivial",
    note: `Automated succession: ${link.url} was dead in the nightly check; ` +
          `promoted the pre-vetted replacement ${winner} (probe passed today).`,
    by: { uid: "agent:link-steward", name: "Link Steward (automation)" },
    affiliated: false, affiliation: "",
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (DRY) { console.log(`DRY: would file for ${site.roadmap}/${site.file}: ${link.url} → ${winner}`); continue; }
  await db.collection("proposals").add(proposal);
  console.log(`filed: ${site.roadmap}/${site.file} — ${link.url} → ${winner}`);
  filed++;
}
console.log(`Done: ${filed} drafted, ${skipped} left for humans.`);
