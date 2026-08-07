// Firestore security-rules tests — the server-side boundary's test suite.
// CI runs: npx firebase emulators:exec --only firestore --project demo-hkr \
//            "node --test tests/rules.test.mjs"
// (Requires the emulator; skipped by plain `node --test` when absent.)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let testEnv, rut;
const EMULATED = !!process.env.FIRESTORE_EMULATOR_HOST;

before(async () => {
  if (!EMULATED) return;
  rut = await import("@firebase/rules-unit-testing");
  const { readFileSync } = await import("node:fs");
  testEnv = await rut.initializeTestEnvironment({
    projectId: "demo-hkr",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  // seed roles with the admin backdoor
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("meta/roles").set({
      superadmins: ["super-uid"],
      admins: ["admin-uid"],
      maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } },
    });
  });
});
after(async () => { if (testEnv) await testEnv.cleanup(); });

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).firestore();
const suggestion = (over = {}) => ({
  roadmap: "astro", node: "n1", nodeTitle: "Node", type: "tip",
  text: "Twenty characters of genuinely useful field-tested advice.",
  url: "", verified: true, by: { uid: "user-uid", name: "U" },
  createdAt: rut.serverTimestamp ? rut.serverTimestamp() : null, status: "pending", ...over,
});
function sgTs() {   // serverTimestamp sentinel via the rules-unit-testing bundle
  return rut.serverTimestamp();
}

const guard = (name, fn) => test(name, { skip: !EMULATED && "no emulator" }, fn);

guard("stranger cannot read another user's progress", async () => {
  await rut.assertFails(db("someone").doc("users/other").get());
  await rut.assertFails(db(null).doc("users/other").get());
});

guard("owner can read/write own progress", async () => {
  await rut.assertSucceeds(db("me").doc("users/me").set({ v: 1, progress: {} }));
  await rut.assertSucceeds(db("me").doc("users/me").get());
});

guard("roles: public read; create/delete always denied", async () => {
  await rut.assertSucceeds(db(null).doc("meta/roles").get());
  await rut.assertFails(db("user-uid").doc("meta/roles")
    .update({ admins: ["user-uid"] }));
  await rut.assertFails(db("admin-uid").doc("meta/roles").delete());
});

guard("roles escalation ladder: admins bind maintainers only; superadmin binds admins; superadmins immutable", async () => {
  // admin may rebind maintainers…
  await rut.assertSucceeds(db("admin-uid").doc("meta/roles")
    .update({ maintainers: { astro: { uid: "new-maintainer", name: "Nova" } } }));
  // …but cannot change the admin bench or mint root
  await rut.assertFails(db("admin-uid").doc("meta/roles")
    .update({ admins: ["admin-uid", "friend-uid"] }));
  await rut.assertFails(db("admin-uid").doc("meta/roles")
    .update({ superadmins: ["admin-uid"] }));
  // superadmin appoints admins and maintainers…
  await rut.assertSucceeds(db("super-uid").doc("meta/roles")
    .update({ admins: ["admin-uid", "second-admin"],
              maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } } }));
  // …but even the superadmin cannot grow the root list through the API
  await rut.assertFails(db("super-uid").doc("meta/roles")
    .update({ superadmins: ["super-uid", "evil-uid"] }));
  // superadmin implies admin powers elsewhere (moderates any map)
  await rut.assertSucceeds(db("super-uid").doc("tips/cooking").set({ n1: [] }));
  // restore seed state for later tests
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("meta/roles").set({
      superadmins: ["super-uid"],
      admins: ["admin-uid"],
      maintainers: { astro: { uid: "maintainer-uid", name: "Stella" } },
    });
  });
});

guard("suggestion create: signed-in with valid shape succeeds", async () => {
  await rut.assertSucceeds(db("user-uid").collection("suggestions")
    .add({ ...suggestion(), createdAt: sgTs() }));
});

guard("suggestion create rejected: anonymous, short text, spoofed author, wrong status", async () => {
  await rut.assertFails(db(null).collection("suggestions")
    .add({ ...suggestion(), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ text: "too short" }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ by: { uid: "other", name: "X" } }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ status: "published" }), createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("suggestions")
    .add({ ...suggestion({ url: "http://insecure.example" }), createdAt: sgTs() }));
});

guard("suggestion moderation: scoped to the map's maintainer", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions").add(suggestion({ createdAt: new Date() }));
  });
  const path = `suggestions/${ref.id}`;
  await rut.assertFails(db("user-uid").doc(path).get());
  await rut.assertSucceeds(db("maintainer-uid").doc(path).get());
  await rut.assertFails(db("user-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "user-uid" } }));
  await rut.assertFails(db("maintainer-uid").doc(path)
    .update({ status: "published", text: "tampered with the text" }));
  await rut.assertSucceeds(db("maintainer-uid").doc(path)
    .update({ status: "published", decidedAt: 1, decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

guard("maintainer of astro cannot moderate another map", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("suggestions")
      .add(suggestion({ roadmap: "cooking", createdAt: new Date() }));
  });
  await rut.assertFails(db("maintainer-uid").doc(`suggestions/${ref.id}`).get());
  await rut.assertFails(db("maintainer-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "maintainer-uid" } }));
  await rut.assertSucceeds(db("admin-uid").doc(`suggestions/${ref.id}`)
    .update({ status: "rejected", decidedAt: 1, decidedBy: { uid: "admin-uid", name: "O" } }));
});

guard("tips: public read; only that map's moderator writes", async () => {
  await rut.assertSucceeds(db(null).doc("tips/astro").get());
  await rut.assertFails(db("user-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertSucceeds(db("maintainer-uid").doc("tips/astro").set({ n1: [] }));
  await rut.assertFails(db("maintainer-uid").doc("tips/cooking").set({ n1: [] }));
});

guard("merged overlay: public read; moderator-only create; immutable to clients", async () => {
  const doc = { roadmap: "astro", file: "01-start.json",
    topic: { id: "s", title: "S", tier: "essential", learn: { summary: "x", links: [] }, do: ["a"] },
    by: { uid: "user-uid", name: "U" }, mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...doc, mergedBy: { uid: "user-uid", name: "U" } }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged").add(doc));
  await rut.assertSucceeds(db(null).collection("merged").get());
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("merged").add(doc);
  });
  await rut.assertFails(db("maintainer-uid").doc(`merged/${ref.id}`).delete());
  await rut.assertFails(db("admin-uid").doc(`merged/${ref.id}`)
    .update({ topic: { id: "evil" } }));
});

const TOPIC = { id: "t", title: "T", tier: "essential",
  learn: { summary: "s", links: [] }, do: ["a"] };

guard("structural kinds: valid add/remove/spine/move accepted for merged", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "02-old.json" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "03-old.json" }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: ["02-b.json", "01-a.json"] }));
  await rut.assertSucceeds(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "02-b.json", topic2: { ...TOPIC, id: "t2" } }));
});

guard("structural kinds: malformed docs rejected", async () => {
  const base = { roadmap: "astro", by: { uid: "u", name: "U" },
    mergedBy: { uid: "maintainer-uid", name: "Stella" }, note: "", at: 1 };
  // unknown kind
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "rename", file: "01-a.json", topic: TOPIC }));
  // add without a position
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC }));
  // remove with a path-traversal file name
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "remove", file: "../meta.json" }));
  // spine that isn't a list
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "spine", spine: "01-a.json" }));
  // move onto itself
  await rut.assertFails(db("maintainer-uid").collection("merged")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC,
           file2: "01-a.json", topic2: TOPIC }));
  // non-moderator can never create merged docs, structural or not
  await rut.assertFails(db("user-uid").collection("merged")
    .add({ ...base, mergedBy: { uid: "user-uid", name: "U" },
           kind: "remove", file: "03-old.json" }));
});

guard("structural proposals: contributors can propose add/remove/spine/move", async () => {
  const base = { roadmap: "astro", note: "why this helps",
    by: { uid: "user-uid", name: "U" }, status: "pending" };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "add", file: "11-new.json", topic: TOPIC, after: "",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "remove", file: "03-old.json", baseHash: "h",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "spine", spine: ["02-b.json", "01-a.json"], baseHash: "h",
           createdAt: sgTs() }));
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...base, kind: "move", file: "01-a.json", topic: TOPIC, baseHash: "h",
           file2: "02-b.json", topic2: { ...TOPIC, id: "t2" }, baseHash2: "h2",
           createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ ...base, kind: "spine", spine: [], createdAt: sgTs() }));
});

guard("proposal lifecycle: create shape enforced; decision status-only", async () => {
  const prop = { roadmap: "astro", file: "02-topic.json", baseHash: "h",
    topic: { id: "t", title: "T", tier: "essential", learn: { summary: "s", links: [] }, do: ["a"] },
    note: "", by: { uid: "user-uid", name: "U" }, status: "pending" };
  await rut.assertSucceeds(db("user-uid").collection("proposals")
    .add({ ...prop, createdAt: sgTs() }));
  await rut.assertFails(db("user-uid").collection("proposals")
    .add({ ...prop, file: "../../etc/passwd", createdAt: sgTs() }));
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("proposals").add({ ...prop, createdAt: new Date() });
  });
  await rut.assertFails(db("maintainer-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", topic: { id: "swapped" } }));
  await rut.assertSucceeds(db("maintainer-uid").doc(`proposals/${ref.id}`)
    .update({ status: "merged", decidedAt: 2, decidedBy: { uid: "maintainer-uid", name: "Stella" } }));
});

/* ---- collections: owner-curated shelves of maps ---- */
const collection = (over = {}) => ({
  title: "Learning the Natural World", blurb: "Sky, garden, weather.",
  maps: ["astro", "gardening"], owner: { uid: "user-uid", name: "U" },
  featured: false, hidden: false,
  createdAt: sgTs(), updatedAt: sgTs(), ...over,
});

guard("collections: signed-in owner creates with valid shape; public read", async () => {
  await rut.assertSucceeds(db("user-uid").collection("collections").add(collection()));
  await rut.assertSucceeds(db(null).collection("collections").get());
});

guard("collections create rejected: anonymous, spoofed owner, self-feature, bad shape", async () => {
  await rut.assertFails(db(null).collection("collections").add(collection()));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ owner: { uid: "other-uid", name: "X" } })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ featured: true })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ hidden: true })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ title: "ab" })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ maps: [] })));
  await rut.assertFails(db("user-uid").collection("collections")
    .add(collection({ extra: "field" })));
});

guard("collections update/delete: owner curates, admin moderates, strangers do neither", async () => {
  let ref;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    ref = await ctx.firestore().collection("collections")
      .add(collection({ createdAt: new Date(), updatedAt: new Date() }));
  });
  const path = `collections/${ref.id}`;
  // owner: content yes, moderation switches no
  await rut.assertSucceeds(db("user-uid").doc(path)
    .update({ title: "Natural World, v2", maps: ["astro"], updatedAt: new Date() }));
  await rut.assertFails(db("user-uid").doc(path).update({ featured: true }));
  await rut.assertFails(db("user-uid").doc(path)
    .update({ owner: { uid: "user-uid", name: "New Name" } }));
  // stranger: nothing
  await rut.assertFails(db("someone").doc(path).update({ title: "Hijacked!!" }));
  await rut.assertFails(db("someone").doc(path).delete());
  // admin: moderation switches yes, content no
  await rut.assertSucceeds(db("admin-uid").doc(path)
    .update({ featured: true }));
  await rut.assertSucceeds(db("super-uid").doc(path)
    .update({ hidden: true }));
  await rut.assertFails(db("admin-uid").doc(path)
    .update({ title: "Admin rewrite" }));
  // owner may delete their own
  await rut.assertSucceeds(db("user-uid").doc(path).delete());
});
