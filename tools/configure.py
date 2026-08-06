#!/usr/bin/env python3
"""
Wire the app to its two hosted services (Firebase + GitHub).

    python3 tools/configure.py            # interactive; Enter keeps current value
    python3 tools/configure.py --show     # print what's configured now

Writes into index.html only:
  FIREBASE_CONFIG  — paste the JSON config object from the Firebase console
                     (Project settings → Your apps → SDK setup and configuration).
                     Blank keeps/clears it → app runs in local/demo mode.
  GITHUB_REPO      — "owner/repo", powers the public map-history view.

These values are public-by-design (they ship to every browser anyway).
The only real secret is the Firebase service-account JSON, which lives in
GitHub Actions (FIREBASE_SERVICE_ACCOUNT) and on the overseer's machine.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "index.html")

def read(): return open(HTML, encoding="utf-8").read()

def current():
    h = read()
    fb = re.search(r'const FIREBASE_CONFIG\s*=\s*(\{.*?\}|null);', h, re.S)
    gh = re.search(r'const GITHUB_REPO\s*=\s*"([^"]*)"', h)
    return {"firebase": (fb.group(1) if fb else "null"),
            "repo": (gh.group(1) if gh else "")}

def main():
    cur = current()
    if "--show" in sys.argv:
        print("FIREBASE_CONFIG:", "configured" if cur["firebase"] != "null" else "(not set — local/demo mode)")
        print("GITHUB_REPO:    ", cur["repo"] or "(not set)")
        return
    print("App configuration — press Enter to keep the current value.\n")
    print(f"Firebase config object (paste the whole {{...}} on one line, or 'null' to clear)")
    fb = input(f"  [{('configured' if cur['firebase'] != 'null' else 'not set')}]: ").strip()
    repo = input(f"GitHub repo (owner/repo)\n  [{cur['repo'] or 'not set'}]: ").strip()

    h = read()
    if fb:
        if fb != "null":
            try: json.loads(re.sub(r'(\w+):', r'"\1":', fb))  # tolerate JS-style keys
            except Exception:
                try: json.loads(fb)
                except Exception:
                    print("⚠️  That doesn't parse as JSON — writing it anyway; check the app loads.")
        h = re.sub(r'const FIREBASE_CONFIG\s*=\s*(\{.*?\}|null);',
                   f'const FIREBASE_CONFIG = {fb};', h, count=1, flags=re.S)
    if repo:
        h = re.sub(r'const GITHUB_REPO\s*=\s*"[^"]*"',
                   f'const GITHUB_REPO = "{repo}"', h, count=1)
    open(HTML, "w", encoding="utf-8").write(h)
    print("\n✅ Wrote index.html.")
    print("Next: python3 tools/build.py --standalone   (refresh the bundle), commit, push.")

if __name__ == "__main__":
    main()
