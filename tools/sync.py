#!/usr/bin/env python3
"""
Repo custody — pull community edits merged by maintainers (the API's content
overlay) down into the repo's topic files, so git stays the canonical ledger.

    python3 tools/sync.py --api https://hkr-api.you.workers.dev
    python3 tools/sync.py --api ... --clear --token <overseer-session-token>

Without --clear it only writes files (safe to run repeatedly). After you review
the diff, commit, rebuild, and redeploy, run again with --clear to empty the
overlays (overseer token required — copy it from localStorage key "hkr:user"
in your signed-in browser, field "token").

Flow: maintainers merge instantly for users (overlay) → overseer periodically
syncs to git → static base catches up → overlay cleared. Nothing is lost if
you never sync; the overlay just keeps serving.
"""
import json, os, sys, glob, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RDIR = os.path.join(ROOT, "roadmaps")

def req(url, method="GET", token=None):
    r = urllib.request.Request(url, method=method)
    if token: r.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read() or b"{}")

def main():
    args = sys.argv[1:]
    def opt(name):
        return args[args.index(name)+1] if name in args and args.index(name)+1 < len(args) else None
    api = (opt("--api") or "").rstrip("/")
    if not api:
        print(__doc__); sys.exit(1)
    token = opt("--token")
    rms = sorted(os.path.basename(d) for d in glob.glob(os.path.join(RDIR, "*")) if os.path.isdir(d))
    changed = 0
    for rm in rms:
        overlay = req(f"{api}/content/{rm}")
        for fname, entry in overlay.items():
            path = os.path.join(RDIR, rm, "topics", fname)
            if not os.path.exists(os.path.dirname(path)):
                print(f"  !! skipping unknown roadmap path: {rm}/{fname}"); continue
            new = json.dumps(entry["topic"], ensure_ascii=False, indent=2)
            old = open(path).read() if os.path.exists(path) else ""
            if old.strip() != new.strip():
                open(path, "w").write(new)
                print(f"  synced {rm}/topics/{fname}   (edit by {entry.get('by','?')})")
                changed += 1
    if not changed:
        print("Nothing to sync — repo already matches all overlays.")
    else:
        print(f"\n{changed} file(s) updated. Review with git diff, then:")
        print("  python3 tools/build.py   (validate + reindex)")
        print("  commit + redeploy the app")
        print("  python3 tools/sync.py --api ... --clear --token <overseer-token>")
    if "--clear" in args:
        if not token:
            print("--clear needs --token <overseer-session-token>"); sys.exit(1)
        for rm in rms:
            req(f"{api}/content/{rm}", method="DELETE", token=token)
        print(f"Cleared overlays for {len(rms)} maps — static base is canonical again.")

if __name__ == "__main__":
    main()
