#!/usr/bin/env python3
"""
Backup — dump every KV key (user progress, tips, suggestions, proposals,
overlays, history, maintainers) to a dated local file. Run monthly.

    python3 tools/backup.py --api https://hkr-api.you.workers.dev --token <overseer-session-token>

The token is your overseer session token: in a signed-in browser, localStorage
key "hkr:user", field "token". Output: backups/hkr-dump-YYYYMMDD.json
(gitignored — these contain user data; store them somewhere private).
"""
import json, os, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    args = sys.argv[1:]
    def opt(name):
        return args[args.index(name)+1] if name in args and args.index(name)+1 < len(args) else None
    api, token = (opt("--api") or "").rstrip("/"), opt("--token")
    if not api or not token:
        print(__doc__); sys.exit(1)
    r = urllib.request.Request(f"{api}/admin/dump",
                               headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(r, timeout=120) as resp:
        dump = json.loads(resp.read())
    os.makedirs(os.path.join(ROOT, "backups"), exist_ok=True)
    out = os.path.join(ROOT, "backups",
                       f"hkr-dump-{datetime.date.today().strftime('%Y%m%d')}.json")
    json.dump(dump, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"OK: {dump['count']} keys -> {out} ({os.path.getsize(out)/1024:.0f} KB)")

if __name__ == "__main__":
    main()
