// Worker tests. Run in CI: node --test tests/
// Imports server/worker.js directly (node 20+ has Request/Response/crypto).
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { signSession, verifySession, rateLimited, b64std }
  from "../server/worker.js";

/* ---- Map-backed KV stub with TTL recording ---- */
function kvStub() {
  const m = new Map(), ttl = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, opts) { m.set(k, String(v)); if (opts?.expirationTtl) ttl.set(k, opts.expirationTtl); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "", cursor } = {}) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
               list_complete: true };
    },
    _m: m, _ttl: ttl,
  };
}
function baseEnv(extra = {}) {
  return { STORE: kvStub(), DEV_MODE: "1", SESSION_SECRET: "test-secret",
           OVERSEER_IDS: "google:demo-user", ...extra };
}
const call = (env, path, opts = {}) =>
  worker.fetch(new Request("https://api.test" + path, opts), env);
const asUser = (token, opts = {}) => ({
  ...opts,
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
             ...(opts.headers || {}) },
});

/* ---- session crypto ---- */
test("session token round-trip, tamper, expiry", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const tok = await signSession({ id: "google:1", name: "N", exp }, "s3cret");
  assert.equal((await verifySession(tok, "s3cret")).id, "google:1");
  assert.equal(await verifySession(tok, "wrong"), null);
  assert.equal(await verifySession(tok.slice(0, -4) + "AAAA", "s3cret"), null);
  const old = await signSession({ id: "x", exp: Math.floor(Date.now() / 1000) - 5 }, "s3cret");
  assert.equal(await verifySession(old, "s3cret"), null);
});

test("b64std round-trips UTF-8", () => {
  const s = "naïve — 星空 ✔";
  assert.equal(Buffer.from(b64std(s), "base64").toString("utf8"), s);
});

/* ---- DEV_MODE gate ---- */
test("demo tokens: DEV_MODE on, off, and production-origin inert", async () => {
  let r = await call(baseEnv(), "/progress", asUser("demo-google-token"));
  assert.equal(r.status, 200);
  r = await call(baseEnv({ DEV_MODE: "" }), "/progress", asUser("demo-google-token"));
  assert.equal(r.status, 401);
  r = await call(baseEnv({ ALLOWED_ORIGIN: "https://hkr.pages.dev" }),
    "/progress", asUser("demo-google-token"));
  assert.equal(r.status, 401, "DEV_MODE must be inert with a production origin");
});

/* ---- origin fail-closed ---- */
test("cross-origin writes rejected when ALLOWED_ORIGIN set", async () => {
  const env = baseEnv({ ALLOWED_ORIGIN: "http://localhost:8123" });
  const r = await call(env, "/progress", asUser("demo-google-token", {
    method: "PUT", body: JSON.stringify({ v: 1, progress: {} }),
    headers: { Origin: "https://evil.example" } }));
  assert.equal(r.status, 403);
});

/* ---- progress sync ---- */
test("progress PUT shape check and round-trip", async () => {
  const env = baseEnv();
  let r = await call(env, "/progress", asUser("demo-google-token",
    { method: "PUT", body: JSON.stringify({ nope: 1 }) }));
  assert.equal(r.status, 400);
  const doc = { v: 1, progress: { astro: { n1: { status: 2, notes: "hi", done: [], updatedAt: 1 } } } };
  r = await call(env, "/progress", asUser("demo-google-token",
    { method: "PUT", body: JSON.stringify(doc) }));
  assert.equal(r.status, 200);
  r = await call(env, "/progress", asUser("demo-google-token"));
  assert.deepEqual(await r.json(), doc);
});

/* ---- rate limiting ---- */
test("rateLimited trips at 21", async () => {
  const env = baseEnv();
  for (let i = 0; i < 20; i++)
    assert.equal(await rateLimited(env, "u1"), false, `call ${i + 1}`);
  assert.equal(await rateLimited(env, "u1"), true, "21st call limited");
  assert.equal(await rateLimited(env, "u2"), false, "other users unaffected");
});

test("untrusted suggestion POST hits 429 after quota; overseer exempt", async () => {
  const env = baseEnv();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await env.STORE.put(`rl:apple:demo-user:${day}`, "20");
  const body = JSON.stringify({ type: "tip", roadmap: "astro", node: "n1",
    text: "Twenty chars of genuinely useful advice here." });
  let r = await call(env, "/suggestions", asUser("demo-apple-token", { method: "POST", body }));
  assert.equal(r.status, 429);
  await env.STORE.put(`rl:google:demo-user:${day}`, "20");
  r = await call(env, "/suggestions", asUser("demo-google-token", { method: "POST", body }));
  assert.equal(r.status, 200, "overseer skips the quota");
});

/* ---- editorial permissions + TTL + PR bridge ---- */
async function seedProposal(env) {
  const r = await call(env, "/proposals", asUser("demo-apple-token", {
    method: "POST",
    body: JSON.stringify({ roadmap: "astro", file: "01-start.json", baseHash: "abc",
      topic: { id: "start", title: "Start", tier: "essential",
               learn: { summary: "s", links: [] }, do: ["act"] },
      note: "test change" }) }));
  assert.equal(r.status, 200);
  return (await r.json()).id;
}

test("proposal decide: permissions, TTL archiving, overlay + history", async () => {
  const env = baseEnv();
  await env.STORE.put("maintainers", JSON.stringify({ astro: { id: "apple:demo-user", name: "M" } }));
  const id = await seedProposal(env);
  // a random signed-in user cannot decide — need a third token? apple maintains astro,
  // so test the negative with a non-maintainer roadmap instead:
  const foreign = await call(env, "/proposals", asUser("demo-apple-token", {
    method: "POST",
    body: JSON.stringify({ roadmap: "cooking", file: "01-x.json", baseHash: "h",
      topic: { id: "x", title: "X", tier: "extra", learn: { summary: "s", links: [] }, do: ["a"] } }) }));
  const foreignId = (await foreign.json()).id;
  let r = await call(env, "/proposals/decide", asUser("demo-apple-token",
    { method: "POST", body: JSON.stringify({ id: foreignId, action: "merge" }) }));
  assert.equal(r.status, 403, "maintainer of astro cannot merge cooking");
  r = await call(env, "/proposals/decide", asUser("demo-apple-token",
    { method: "POST", body: JSON.stringify({ id, action: "merge" }) }));
  assert.equal(r.status, 200, "maintainer merges own map");
  assert.equal(env.STORE._ttl.get(`proposal:${id}`), 90 * 86400, "decided record expires");
  const overlay = JSON.parse(await env.STORE.get("content:astro"));
  assert.equal(overlay["01-start.json"].topic.title, "Start");
  const hist = JSON.parse(await env.STORE.get("history:astro"));
  assert.equal(hist[0].by, "Explorer");
});

test("PR bridge issues GitHub calls on merge; failure is non-fatal", async () => {
  const env = baseEnv({ GITHUB_TOKEN: "gh-test", GITHUB_REPO: "marcus/hkr" });
  await env.STORE.put("maintainers", JSON.stringify({ astro: { id: "apple:demo-user", name: "M" } }));
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith("https://api.github.com")) return realFetch(url, init);
    seen.push({ url: String(url), method: init.method || "GET",
                body: init.body ? JSON.parse(init.body) : null });
    const path = String(url).slice("https://api.github.com".length);
    if (path.startsWith("/repos/marcus/hkr/git/ref/"))
      return Response.json({ object: { sha: "mainsha" } });
    if (path === "/repos/marcus/hkr/git/refs")
      return Response.json({ ref: "ok" });
    if (path.startsWith("/repos/marcus/hkr/contents/") && (init.method || "GET") === "GET")
      return Response.json({ sha: "filesha" });
    if (path.startsWith("/repos/marcus/hkr/contents/"))
      return Response.json({ commit: { sha: "c" } });
    if (path === "/repos/marcus/hkr/pulls")
      return Response.json({ number: 7, node_id: "PR_node" });
    if (path === "/graphql") return Response.json({ data: {} });
    return new Response("{}", { status: 404 });
  };
  try {
    const id = await seedProposal(env);
    const r = await call(env, "/proposals/decide", asUser("demo-apple-token",
      { method: "POST", body: JSON.stringify({ id, action: "merge" }) }));
    assert.equal(r.status, 200);
    const branchCall = seen.find((c) => c.url.endsWith("/git/refs") && c.method === "POST");
    assert.ok(branchCall.body.ref.startsWith("refs/heads/edit/"), "edit/* branch");
    const put = seen.find((c) => c.url.includes("/contents/roadmaps/astro/topics/01-start.json")
      && c.method === "PUT");
    assert.ok(put, "contents PUT to the topic path");
    assert.match(put.body.message, /Proposed by Explorer/);
    const pr = seen.find((c) => c.url.endsWith("/pulls"));
    assert.equal(pr.body.base, "main");
    assert.match(pr.body.body, /CC BY-SA 4\.0/);

    // failure path: fetch throws → merge still succeeds, ghlog written
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).startsWith("https://api.github.com")) throw new Error("github down");
      return realFetch(url, init);
    };
    const id2 = await seedProposal(env);
    const r2 = await call(env, "/proposals/decide", asUser("demo-apple-token",
      { method: "POST", body: JSON.stringify({ id: id2, action: "merge" }) }));
    assert.equal(r2.status, 200, "merge survives GitHub outage");
    assert.ok(await env.STORE.get(`ghlog:${id2}`), "failure logged");
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ---- admin dump ---- */
test("/admin/dump: overseer only, excludes rl: keys", async () => {
  const env = baseEnv();
  await env.STORE.put("progress:google:demo-user", "{}");
  await env.STORE.put("rl:someone:20260805", "3");
  let r = await call(env, "/admin/dump", asUser("demo-apple-token"));
  assert.equal(r.status, 403);
  r = await call(env, "/admin/dump", asUser("demo-google-token"));
  assert.equal(r.status, 200);
  const dump = await r.json();
  assert.ok(dump.keys.some((k) => k.name === "progress:google:demo-user"));
  assert.ok(!dump.keys.some((k) => k.name.startsWith("rl:")));
});
