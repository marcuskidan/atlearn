/**
 * Human Knowledge Roadmaps — backend (Cloudflare Worker).
 *
 * Subsystems:
 *   AUTH            — POST /auth: verifies a real Google/Apple ID token and
 *                     issues an HMAC-signed session token (180 days).
 *   PROGRESS SYNC   — GET/PUT /progress: one document per user, local-first client.
 *   COMMUNITY LAYER — prose suggestions inbox + review + public tips.
 *   EDITORIAL LAYER — the "commons with gardeners" pipeline:
 *     · per-map maintainers (KV doc "maintainers": {rmId:{id,name}}, set by the
 *       overseer via PUT /maintainers; GET is public — governance is transparent)
 *     · structured edit proposals (POST /proposals): a contributor edits a topic
 *       in the app's editor and submits the whole edited topic + base hash + note
 *     · that map's maintainer (or the overseer) reviews a diff in-app and merges
 *       (POST /proposals/decide) → the topic lands in a public CONTENT OVERLAY
 *       (GET /content/:rm) that the app renders on top of the static base files,
 *       and a public per-map HISTORY entry is written (GET /history/:rm)
 *     · the repo stays the ledger: tools/sync.py pulls merged overlays down into
 *       the topic files for a git commit, then clears them (DELETE /content/:rm)
 *
 * Environment (wrangler.toml [vars] + secrets):
 *   SESSION_SECRET   (secret)  — `npx wrangler secret put SESSION_SECRET`; any long random string.
 *   GOOGLE_CLIENT_ID (var)     — OAuth client id from console.cloud.google.com.
 *   APPLE_CLIENT_ID  (var)     — Services ID from developer.apple.com (e.g. com.you.hkr.web).
 *   OVERSEER_IDS     (var)     — comma-separated verified user ids, e.g. "google:1234567890".
 *   DEV_MODE         (var)     — "1" accepts the app's demo tokens (local testing ONLY;
 *                                never set in production).
 *   KV binding: STORE
 */

/* Set ALLOWED_ORIGIN in wrangler.toml to your app's URL once deployed
   (e.g. "https://hkr.pages.dev"); "*" is fine while testing. */
const corsFor = (env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Vary": "Origin",
});
let CORS = { "Access-Control-Allow-Origin": "*" };  // replaced per-request in fetch()
let JSONH = { ...CORS, "Content-Type": "application/json" };
const j = (obj, code = 200) =>
  new Response(JSON.stringify(obj), { status: code, headers: JSONH });

/* ---------------- crypto helpers ---------------- */
const enc = new TextEncoder();
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecodeToBuf = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64uJson = (s) => JSON.parse(new TextDecoder().decode(b64uDecodeToBuf(s)));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
/** Issue our own compact session token: header.payload.hmac (HS256). */
async function signSession(payload, secret) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
async function verifySession(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret),
    b64uDecodeToBuf(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  const payload = b64uJson(parts[1]);
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

/** Verify an RS256 ID token (Google / Apple) against the provider's JWKS. */
async function verifyIdToken(idToken, { jwksUrl, issuers, aud }) {
  const [h, p, s] = idToken.split(".");
  if (!s) throw new Error("malformed token");
  const header = b64uJson(h);
  const jwksResp = await fetch(jwksUrl, { cf: { cacheTtl: 3600, cacheEverything: true } });
  const jwks = await jwksResp.json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key id");
  const key = await crypto.subtle.importKey("jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
    b64uDecodeToBuf(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new Error("bad signature");
  const claims = b64uJson(p);
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  if (!audOk) throw new Error("wrong audience");
  if (!issuers.includes(claims.iss)) throw new Error("wrong issuer");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("expired");
  return claims;
}

async function authenticate(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  if (env.DEV_MODE === "1") {   // local testing only — never set DEV_MODE in production
    if (token === "demo-google-token") return { id: "google:demo-user", name: "Explorer" };
    if (token === "demo-apple-token") return { id: "apple:demo-user", name: "Explorer" };
  }
  if (!env.SESSION_SECRET) return null;
  const payload = await verifySession(token, env.SESSION_SECRET);
  return payload ? { id: payload.id, name: payload.name } : null;
}

const SUGGESTION_TYPES = ["fix", "link", "tip", "topic", "roadmap"];

export default {
  async fetch(request, env) {
    CORS = corsFor(env);
    JSONH = { ...CORS, "Content-Type": "application/json" };
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    /* ---- sign in: exchange a provider ID token for a session token ---- */
    if (path === "/auth" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      if (!env.SESSION_SECRET) return j({ error: "server missing SESSION_SECRET" }, 500);
      let claims, provider = body.provider;
      try {
        if (provider === "google") {
          if (!env.GOOGLE_CLIENT_ID) return j({ error: "google not configured" }, 500);
          claims = await verifyIdToken(body.id_token, {
            jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
            issuers: ["https://accounts.google.com", "accounts.google.com"],
            aud: env.GOOGLE_CLIENT_ID,
          });
        } else if (provider === "apple") {
          if (!env.APPLE_CLIENT_ID) return j({ error: "apple not configured" }, 500);
          claims = await verifyIdToken(body.id_token, {
            jwksUrl: "https://appleid.apple.com/auth/keys",
            issuers: ["https://appleid.apple.com"],
            aud: env.APPLE_CLIENT_ID,
          });
        } else return j({ error: "bad provider" }, 400);
      } catch (e) {
        return j({ error: "token verification failed: " + e.message }, 401);
      }
      const id = `${provider}:${claims.sub}`;
      // Apple only sends the name on first authorization; fall back to email prefix.
      const name = String(body.name || claims.name ||
        (claims.email || "Explorer").split("@")[0]).slice(0, 60);
      const session = await signSession(
        { id, name, provider, exp: Math.floor(Date.now() / 1000) + 180 * 86400 },
        env.SESSION_SECRET);
      return j({ token: session, user: { id, name, email: claims.email || "", provider } });
    }

    /* ---- public: approved community tips for a roadmap ---- */
    if (request.method === "GET" && path.startsWith("/tips/")) {
      const rm = path.slice(6);
      if (!/^[a-z0-9-]{1,50}$/.test(rm)) return j({ error: "bad roadmap id" }, 400);
      const doc = await env.STORE.get(`tips:${rm}`);
      return new Response(doc || "{}", { headers: JSONH });
    }

    /* ---- public: merged-content overlay for a roadmap {file: {topic,by,at}} ---- */
    if (request.method === "GET" && path.startsWith("/content/")) {
      const rm = path.slice(9);
      if (!/^[a-z0-9-]{1,50}$/.test(rm)) return j({ error: "bad roadmap id" }, 400);
      const doc = await env.STORE.get(`content:${rm}`);
      return new Response(doc || "{}", { headers: JSONH });
    }

    /* ---- public: per-map edit history (transparency, Wikipedia-style) ---- */
    if (request.method === "GET" && path.startsWith("/history/")) {
      const rm = path.slice(9);
      if (!/^[a-z0-9-]{1,50}$/.test(rm)) return j({ error: "bad roadmap id" }, 400);
      const doc = await env.STORE.get(`history:${rm}`);
      return new Response(doc || "[]", { headers: JSONH });
    }

    /* ---- public: who maintains what (governance is transparent) ---- */
    if (request.method === "GET" && path === "/maintainers") {
      const doc = await env.STORE.get("maintainers");
      return new Response(doc || "{}", { headers: JSONH });
    }

    /* ---- everything else requires a session ---- */
    const user = await authenticate(request, env);
    if (!user) return j({ error: "unauthorized" }, 401);
    const overseers = (env.OVERSEER_IDS || "").split(",").map((s) => s.trim());
    const isOverseer = overseers.includes(user.id);
    const maintainers = JSON.parse((await env.STORE.get("maintainers")) || "{}");
    // gardeners: the overseer moderates everywhere; a maintainer moderates their map
    const canModerate = (rm) =>
      isOverseer || (rm && maintainers[rm] && maintainers[rm].id === user.id);
    const moderatedMaps = Object.keys(maintainers)
      .filter((rm) => maintainers[rm] && maintainers[rm].id === user.id);

    /* ---- progress sync ---- */
    if (path === "/progress") {
      const key = `progress:${user.id}`;
      if (request.method === "GET") {
        const doc = await env.STORE.get(key);
        return new Response(doc || JSON.stringify({ progress: {} }), { headers: JSONH });
      }
      if (request.method === "PUT") {
        const body = await request.text();
        if (body.length > 1_000_000) return j({ error: "too large" }, 413);
        let parsed;
        try { parsed = JSON.parse(body); } catch { return j({ error: "bad json" }, 400); }
        if (typeof parsed.progress !== "object") return j({ error: "bad shape" }, 400);
        await env.STORE.put(key, body);
        return j({ ok: true });
      }
    }

    /* ---- community: submit a suggestion ---- */
    if (path === "/suggestions" && request.method === "POST") {
      let s;
      try { s = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      if (!SUGGESTION_TYPES.includes(s.type)) return j({ error: "bad type" }, 400);
      const text = String(s.text || "").trim();
      if (text.length < 20 || text.length > 4000) return j({ error: "text 20–4000 chars" }, 400);
      const rec = {
        id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        roadmap: String(s.roadmap || "").slice(0, 50),
        node: String(s.node || "").slice(0, 80),
        nodeTitle: String(s.nodeTitle || "").slice(0, 120),
        type: s.type,
        text,
        url: /^https:\/\//.test(s.url || "") ? String(s.url).slice(0, 500) : "",
        verified: !!s.verified,
        by: { id: user.id, name: user.name },
        createdAt: Date.now(),
        status: "pending",
      };
      await env.STORE.put(`suggestion:${rec.id}`, JSON.stringify(rec));
      return j({ ok: true, id: rec.id });
    }

    /* ---- community: moderation queue + decisions ----
       Maintainers see their own maps' suggestions; the overseer sees all
       (including map-less new-roadmap proposals). ---- */
    if (path === "/suggestions" && request.method === "GET") {
      if (!isOverseer && moderatedMaps.length === 0)
        return j({ error: "maintainers only" }, 403);
      const status = url.searchParams.get("status") || "pending";
      const out = [];
      let cursor;
      do {
        const page = await env.STORE.list({ prefix: "suggestion:", cursor });
        for (const k of page.keys) {
          const rec = JSON.parse(await env.STORE.get(k.name));
          if (rec.status !== status) continue;
          if (isOverseer || moderatedMaps.includes(rec.roadmap)) out.push(rec);
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      out.sort((a, b) => b.createdAt - a.createdAt);
      return j({ suggestions: out });
    }

    if (path === "/decide" && request.method === "POST") {
      let d;
      try { d = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      const key = `suggestion:${d.id}`;
      const raw = await env.STORE.get(key);
      if (!raw) return j({ error: "not found" }, 404);
      const rec = JSON.parse(raw);
      if (!canModerate(rec.roadmap)) return j({ error: "maintainer of this map only" }, 403);
      if (!["tip", "accept", "reject"].includes(d.action)) return j({ error: "bad action" }, 400);
      rec.status = { tip: "published", accept: "accepted", reject: "rejected" }[d.action];
      rec.decidedAt = Date.now();
      if (d.action === "tip" && rec.roadmap && rec.node) {
        const tipsKey = `tips:${rec.roadmap}`;
        const tips = JSON.parse((await env.STORE.get(tipsKey)) || "{}");
        (tips[rec.node] = tips[rec.node] || []).push({
          id: rec.id, text: rec.text, url: rec.url,
          by: rec.by.name, type: rec.type, at: rec.decidedAt,
        });
        await env.STORE.put(tipsKey, JSON.stringify(tips));
      }
      await env.STORE.put(key, JSON.stringify(rec));
      return j({ ok: true, status: rec.status });
    }

    /* ---- editorial: submit a structured edit proposal (any signed-in user) ---- */
    if (path === "/proposals" && request.method === "POST") {
      let p;
      try { p = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      const rm = String(p.roadmap || ""), file = String(p.file || "");
      if (!/^[a-z0-9-]{1,50}$/.test(rm)) return j({ error: "bad roadmap" }, 400);
      if (!/^[0-9]{2}-[a-z0-9-]+\.json$/.test(file)) return j({ error: "bad file" }, 400);
      const topicStr = JSON.stringify(p.topic || null);
      if (!p.topic || topicStr.length > 120_000) return j({ error: "bad topic" }, 400);
      for (const key of ["id", "title", "tier", "learn", "do"])
        if (!(key in p.topic)) return j({ error: `topic missing ${key}` }, 400);
      const rec = {
        id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        roadmap: rm, file, baseHash: String(p.baseHash || "").slice(0, 32),
        topic: p.topic, note: String(p.note || "").slice(0, 1000),
        by: { id: user.id, name: user.name },
        createdAt: Date.now(), status: "pending",
      };
      await env.STORE.put(`proposal:${rec.id}`, JSON.stringify(rec));
      return j({ ok: true, id: rec.id });
    }

    /* ---- editorial: proposal queue (maintainers see their maps; overseer all) ---- */
    if (path === "/proposals" && request.method === "GET") {
      if (!isOverseer && moderatedMaps.length === 0)
        return j({ error: "maintainers only" }, 403);
      const status = url.searchParams.get("status") || "pending";
      const out = [];
      let cursor;
      do {
        const page = await env.STORE.list({ prefix: "proposal:", cursor });
        for (const k of page.keys) {
          const rec = JSON.parse(await env.STORE.get(k.name));
          if (rec.status !== status) continue;
          if (isOverseer || moderatedMaps.includes(rec.roadmap)) out.push(rec);
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      out.sort((a, b) => b.createdAt - a.createdAt);
      return j({ proposals: out });
    }

    /* ---- editorial: merge or reject a proposal ---- */
    if (path === "/proposals/decide" && request.method === "POST") {
      let d;
      try { d = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      const raw = await env.STORE.get(`proposal:${d.id}`);
      if (!raw) return j({ error: "not found" }, 404);
      const rec = JSON.parse(raw);
      if (!canModerate(rec.roadmap)) return j({ error: "maintainer of this map only" }, 403);
      if (!["merge", "reject"].includes(d.action)) return j({ error: "bad action" }, 400);
      rec.status = d.action === "merge" ? "merged" : "rejected";
      rec.decidedAt = Date.now();
      rec.decidedBy = { id: user.id, name: user.name };
      if (d.action === "merge") {
        // land the topic in the public content overlay (renders over static base)
        const cKey = `content:${rec.roadmap}`;
        const overlay = JSON.parse((await env.STORE.get(cKey)) || "{}");
        overlay[rec.file] = { topic: rec.topic, by: rec.by.name, at: rec.decidedAt };
        await env.STORE.put(cKey, JSON.stringify(overlay));
        // public changelog — who changed what, forever visible
        const hKey = `history:${rec.roadmap}`;
        const hist = JSON.parse((await env.STORE.get(hKey)) || "[]");
        hist.unshift({ at: rec.decidedAt, file: rec.file,
          topicTitle: rec.topic.title, by: rec.by.name,
          mergedBy: user.name, note: rec.note || "" });
        await env.STORE.put(hKey, JSON.stringify(hist.slice(0, 200)));
      }
      await env.STORE.put(`proposal:${rec.id}`, JSON.stringify(rec));
      return j({ ok: true, status: rec.status });
    }

    /* ---- governance: overseer appoints/removes maintainers ---- */
    if (path === "/maintainers" && request.method === "PUT") {
      if (!isOverseer) return j({ error: "overseer only" }, 403);
      let doc;
      try { doc = await request.json(); } catch { return j({ error: "bad json" }, 400); }
      if (typeof doc !== "object" || Array.isArray(doc)) return j({ error: "bad shape" }, 400);
      for (const [rm, m] of Object.entries(doc)) {
        if (!/^[a-z0-9-]{1,50}$/.test(rm) || (m && (!m.id || !m.name)))
          return j({ error: `bad entry for ${rm}` }, 400);
      }
      await env.STORE.put("maintainers", JSON.stringify(doc));
      return j({ ok: true });
    }

    /* ---- repo custody: overseer clears an overlay after committing it to git ---- */
    if (request.method === "DELETE" && path.startsWith("/content/")) {
      if (!isOverseer) return j({ error: "overseer only" }, 403);
      const rm = path.slice(9);
      if (!/^[a-z0-9-]{1,50}$/.test(rm)) return j({ error: "bad roadmap id" }, 400);
      await env.STORE.delete(`content:${rm}`);
      return j({ ok: true });
    }

    return j({ error: "not found" }, 404);
  },
};
