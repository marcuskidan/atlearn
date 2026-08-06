# Going live

Checklist to get Human Knowledge Roadmaps on the internet with real sign-in,
real sync, and a working community pipeline. Budget ~45 minutes for a first
run. Nothing here is irreversible — you can deploy, test, and redeploy freely.

Run `python3 tools/configure.py --show` at any point to see what's wired up.

---

## Stage 0 — Accounts you'll need

| What | Cost | Needed for |
|---|---|---|
| Cloudflare account | free | hosting the app + API |
| Google Cloud project | free | "Continue with Google" |
| Apple Developer Program | $99/year | "Continue with Apple" (optional on web; **required** if you ship to the App Store while offering Google sign-in) |

Skip Apple for now if you're only doing web — Google alone is enough to launch.

---

## Stage 1 — Deploy the API (~10 min)

```bash
cd server
npx wrangler login                      # opens browser, authorizes Cloudflare
npx wrangler kv namespace create STORE  # prints an id
```

Paste that id into `server/wrangler.toml` (replacing `REPLACE_WITH_KV_NAMESPACE_ID`).

```bash
npx wrangler secret put SESSION_SECRET   # paste any long random string, e.g.
                                         # `openssl rand -base64 48`
npx wrangler deploy
```

Wrangler prints a URL like `https://hkr-api.<you>.workers.dev`. Save it.

**Verify:** `curl https://hkr-api.<you>.workers.dev/tips/astronomy` → `{}`.

---

## Stage 2 — Google sign-in (~10 min)

1. console.cloud.google.com → create a project (any name).
2. **APIs & Services → OAuth consent screen**: External, fill app name +
   support email. Scopes stay default (email/profile/openid) — these are
   non-sensitive, so **no Google verification review is required**. Publish
   the app (otherwise you're capped at 100 test users).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized JavaScript origins — add both:
   - `http://localhost:8123` (for local testing)
   - your app URL from Stage 3 (come back and add it after)
4. Copy the client id (`…apps.googleusercontent.com`).

> Sign in with Apple, if you do it: developer.apple.com → Identifiers →
> create a **Services ID**, enable Sign in with Apple, register your domain and
> return URL. Note Apple **rejects `localhost`** — Apple sign-in can only be
> tested on your real https URL.

---

## Stage 3 — Deploy the app (~5 min)

From the project root:

```bash
npx wrangler pages deploy . --project-name=hkr
```

Prints something like `https://hkr.pages.dev`. (Netlify, Vercel, GitHub Pages
all work the same way — it's a static folder.)

Now go back to Google's Credentials screen and add that URL to **Authorized
JavaScript origins**.

---

## Stage 4 — Wire it together (~2 min)

```bash
python3 tools/configure.py
```

Answer the five prompts (API URL, Google client id, Apple id or blank, app URL,
overseer id — leave overseer as-is for now). Then redeploy both:

```bash
cd server && npx wrangler deploy && cd ..
npx wrangler pages deploy . --project-name=hkr
```

---

## Stage 5 — Make yourself the overseer (~3 min)

1. Open your live URL, click **Sign in**, use the real Google button.
2. Hover the user chip (top right) — the tooltip shows your verified id,
   e.g. `google:110234567890`.
3. `python3 tools/configure.py` again, paste that id at the overseer prompt.
4. Redeploy both (same two commands as Stage 4).
5. Reload — the 🛡️ **Review** button appears.

**Confirm `DEV_MODE` is empty in `wrangler.toml`.** If it's `"1"`, anyone can
sign in as the demo user. It should only ever be `1` on localhost.

---

## Stage 6 — Smoke test the live site (~5 min)

- [ ] Sign in with Google; the sync dot in the user chip turns green
- [ ] Mark a node Mastered, write a note; reload — both persist
- [ ] Sign in on your phone; same progress appears
- [ ] Submit a suggestion from a node's 💬 Community section
- [ ] Open 🛡️ Review, publish it as a tip; it appears under that node
- [ ] Sign out; confirm the app still works (local-only) for guests

---

## Stage 7 — Before you invite people

- **Watch the KV write limit.** Cloudflare's free tier allows **1,000 KV writes
  per day**; every debounced progress save is one write. That's fine for
  dozens of casual users, tight for hundreds. Workers Paid ($5/mo) raises it to
  1M/day — the single most likely thing to bite you as users arrive.
- **Custom domain** (optional): Cloudflare Pages → Custom domains. Remember to
  add the new origin to Google's authorized origins and `ALLOWED_ORIGIN`.
- **Back up your community data** — it lives only in KV:
  `npx wrangler kv key list --binding=STORE` and `kv key get` to export.
- **Have a moderation plan** before promoting the app anywhere public. Right
  now suggestions have no rate limiting; if you get spammed, the fastest lever
  is temporarily clearing `OVERSEER_IDS`-adjacent access or pausing the
  `/suggestions` POST branch in the worker.
- **Re-run the link checker** before any launch push:
  `python3 tools/build.py --check-links`.

---

## Bus factor — do this before you have users you'd hate to lose

- **Second overseer**: add a second trusted account's verified id to
  `OVERSEER_IDS` (comma-separated, both in the worker vars and index.html).
  Losing every overseer account permanently strands overlay custody
  (`DELETE /content/:rm`) and the admin dump.
- **Record in a password manager**: the SESSION_SECRET value, the KV namespace
  id, the GitHub bot token, and Cloudflare account access.
- **Backups**: run `python3 tools/backup.py --api <url> --token <overseer-token>`
  monthly — it dumps every KV key (user progress, tips, proposals, overlays,
  history, maintainers) to `backups/hkr-dump-YYYYMMDD.json`. KV is otherwise
  the only copy of everything users and contributors have made.
- **Safe-to-commit note**: everything `tools/configure.py` writes (API_BASE,
  OAuth client ids, KV namespace id, overseer ids) is public-by-design
  configuration, safe in a public repo. The only true secrets are
  SESSION_SECRET and GITHUB_TOKEN, which live in wrangler secrets, never files.

## Updating content after launch

```bash
python3 tools/dev.py                  # edit in-app with the ✏️ buttons
npx wrangler pages deploy . --project-name=hkr
```

Content is static files, so a content update is just a redeploy — user progress
and community data live in KV and are untouched by it.
