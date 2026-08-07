#!/usr/bin/env python3
"""
Wire the app to its two hosted services (Firebase + GitHub).

    python3 tools/configure.py            # interactive; Enter keeps current value
    python3 tools/configure.py --show     # print what's configured now

Writes config.js only (index.html is never touched):
  FIREBASE_CONFIG  — paste the JSON config object from the Firebase console
                     (Project settings → Your apps → SDK setup and configuration).
                     Blank keeps it; 'null' clears it → app runs in local/demo mode.
  GITHUB_REPO      — "owner/repo", powers the public map-history link.

These values are public-by-design (they ship to every browser anyway).
The only real secret is the Firebase service-account JSON, which lives in
GitHub Actions (FIREBASE_SERVICE_ACCOUNT) and on the admin's machine.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.join(ROOT, "config.js")

TEMPLATE = """/* App configuration — the only file to edit when wiring the hosted services.
   These values are public-by-design (they ship to every browser anyway); the
   only real secret is the Firebase service-account JSON, which lives in
   GitHub Actions. Run `python3 tools/configure.py` for a guided setup, or
   edit by hand. */
window.HKR_CONFIG = {{
  /* Firebase web-app config object (Firebase console → Project settings →
     Your apps). While null, the app runs fully functional in local/demo
     mode — progress stays on-device, contributions queue locally. */
  FIREBASE_CONFIG: {fb},
  /* "owner/repo", e.g. "marcuskidan/waihona" — powers the
     public map-history link. */
  GITHUB_REPO: "{repo}",
}};
"""

def current():
    try:
        src = open(CONF, encoding="utf-8").read()
    except FileNotFoundError:
        return {"firebase": "null", "repo": ""}
    fb = re.search(r'FIREBASE_CONFIG:\s*(\{.*?\}|null),', src, re.S)
    gh = re.search(r'GITHUB_REPO:\s*"([^"]*)"', src)
    return {"firebase": (fb.group(1) if fb else "null"),
            "repo": (gh.group(1) if gh else "")}

def main():
    cur = current()
    if "--show" in sys.argv:
        print("FIREBASE_CONFIG:", "configured" if cur["firebase"] != "null" else "(not set — local/demo mode)")
        print("GITHUB_REPO:    ", cur["repo"] or "(not set)")
        return
    print("App configuration — press Enter to keep the current value.\n")
    print("Firebase config object (paste the whole {...} on one line, or 'null' to clear)")
    fb = input(f"  [{('configured' if cur['firebase'] != 'null' else 'not set')}]: ").strip()
    repo = input(f"GitHub repo (owner/repo)\n  [{cur['repo'] or 'not set'}]: ").strip()

    fb = fb or cur["firebase"]
    if fb != "null":
        try: json.loads(re.sub(r'(\w+):', r'"\1":', fb))  # tolerate JS-style keys
        except Exception:
            try: json.loads(fb)
            except Exception:
                print("⚠️  That doesn't parse as JSON — writing it anyway; check the app loads.")
    open(CONF, "w", encoding="utf-8").write(
        TEMPLATE.format(fb=fb, repo=repo or cur["repo"]))
    print("\n✅ Wrote config.js.")
    print("Next: python3 tools/build.py --standalone   (refresh the bundle), commit, push.")

if __name__ == "__main__":
    main()
