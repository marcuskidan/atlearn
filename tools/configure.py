#!/usr/bin/env python3
"""
Fill in deployment config in both places at once.

    python3 tools/configure.py            # interactive; Enter keeps current value
    python3 tools/configure.py --show     # just print what's configured now

Writes:
  index.html          API_BASE, OVERSEER_IDS, AUTH_CONFIG.{google,apple}ClientId
  server/wrangler.toml  GOOGLE_CLIENT_ID, APPLE_CLIENT_ID, OVERSEER_IDS, ALLOWED_ORIGIN

Everything is optional — leave a field blank and that feature simply stays off
(no API_BASE = local-only app; no client ids = demo sign-in).
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "index.html")
TOML = os.path.join(ROOT, "server", "wrangler.toml")

FIELDS = [
    ("api_base",  "API base URL (deployed worker, e.g. https://hkr-api.you.workers.dev)"),
    ("google_id", "Google OAuth Web client id (…apps.googleusercontent.com)"),
    ("apple_id",  "Apple Services ID (e.g. com.you.hkr.web) — blank to skip Apple"),
    ("origin",    "App URL for CORS (e.g. https://hkr.pages.dev) — blank = allow any"),
    ("overseers", "Overseer user id(s), comma-separated (e.g. google:1102…)"),
]

def read(p): return open(p, encoding="utf-8").read()

def current():
    h, t = read(HTML), read(TOML)
    def g(pat, s, d=""):
        m = re.search(pat, s)
        return m.group(1) if m else d
    ids = g(r'const OVERSEER_IDS\s*=\s*\[(.*?)\]', h)
    return {
        "api_base":  g(r'const API_BASE\s*=\s*"([^"]*)"', h),
        "google_id": g(r'googleClientId:\s*"([^"]*)"', h),
        "apple_id":  g(r'appleClientId:\s*"([^"]*)"', h),
        "origin":    g(r'ALLOWED_ORIGIN\s*=\s*"([^"]*)"', t),
        "overseers": ",".join(re.findall(r'"([^"]+)"', ids)),
    }

def apply(vals):
    h = read(HTML)
    api = f'"{vals["api_base"]}"' if vals["api_base"] else "null"
    h = re.sub(r'const API_BASE\s*=\s*[^;]+;', f'const API_BASE = {api};', h, count=1)
    ids = ", ".join(f'"{i.strip()}"' for i in vals["overseers"].split(",") if i.strip())
    h = re.sub(r'const OVERSEER_IDS\s*=\s*\[[^\]]*\];',
               f'const OVERSEER_IDS = [{ids}];', h, count=1)
    h = re.sub(r'(googleClientId:\s*)"[^"]*"', lambda m: m.group(1) + f'"{vals["google_id"]}"', h, count=1)
    h = re.sub(r'(appleClientId:\s*)"[^"]*"', lambda m: m.group(1) + f'"{vals["apple_id"]}"', h, count=1)
    h = re.sub(r'(appleRedirectURI:\s*)"[^"]*"', lambda m: m.group(1) + f'"{vals["origin"]}"', h, count=1)
    open(HTML, "w", encoding="utf-8").write(h)

    t = read(TOML)
    for key, val in (("GOOGLE_CLIENT_ID", vals["google_id"]),
                     ("APPLE_CLIENT_ID",  vals["apple_id"]),
                     ("OVERSEER_IDS",     vals["overseers"]),
                     ("ALLOWED_ORIGIN",   vals["origin"])):
        t = re.sub(rf'^{key}\s*=\s*"[^"]*"', f'{key} = "{val}"', t, count=1, flags=re.M)
    open(TOML, "w", encoding="utf-8").write(t)

def main():
    cur = current()
    if "--show" in sys.argv:
        print("Current configuration:")
        for k, label in FIELDS:
            print(f"  {label.split(' (')[0]:<28} {cur[k] or '(not set)'}")
        kv = re.search(r'id\s*=\s*"([^"]*)"', read(TOML))
        print(f"  {'KV namespace id':<28} {kv.group(1) if kv else '?'}")
        return
    print("Deployment config — press Enter to keep the current value.\n")
    vals = {}
    for k, label in FIELDS:
        got = input(f"{label}\n  [{cur[k] or 'not set'}]: ").strip()
        vals[k] = got if got else cur[k]
    apply(vals)
    print("\n✅ Wrote index.html and server/wrangler.toml")
    if vals["api_base"] and not vals["google_id"]:
        print("⚠️  API set but no Google client id — sign-in stays in demo mode.")
    if vals["api_base"] and not vals["overseers"]:
        print("⚠️  No overseer id yet — sign in once, copy the id from the user chip, rerun this.")
    print("Next: cd server && npx wrangler deploy    (then redeploy the app)")

if __name__ == "__main__":
    main()
