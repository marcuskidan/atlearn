#!/usr/bin/env python3
"""
Human Knowledge Roadmaps — build tool.

  python3 tools/build.py               validate all content + regenerate roadmaps/index.json
  python3 tools/build.py --standalone  also emit dist/standalone.html (single file, data inlined)
  python3 tools/build.py --check-links probe every content URL, write tools/link-report.json

Content model (the only things a maintainer edits):
  roadmaps/<id>/meta.json          {id, emoji, title, tagline, curricula, order?}
  roadmaps/<id>/topics/NN-slug.json  one core (spine) topic incl. its children

roadmaps/index.json is GENERATED — never edit it by hand.
"""
import json, os, sys, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RDIR = os.path.join(ROOT, "roadmaps")
TIERS = ("essential", "recommended", "extra")
KINDS = ("article", "video", "tool")

def fail(msgs):
    print("\nPROBLEMS:")
    for m in msgs: print("  -", m)
    sys.exit(1)

# The manifesto's one hard rule: every resource must be freely accessible to
# everyone. These domains are commonly paywalled/account-walled → warnings.
PAYWALLED = ("medium.com", "nytimes.com", "wsj.com", "ft.com", "economist.com",
             "newyorker.com", "udemy.com", "skillshare.com", "masterclass.com",
             "chegg.com", "scribd.com", "jstor.org")

def check_node(n, path, is_spine, errs, ids, warns=None):
    for key in ("id", "title", "tier", "learn", "do"):
        if key not in n: errs.append(f"{path}: missing '{key}'")
    if n.get("tier") not in TIERS: errs.append(f"{path}: bad tier {n.get('tier')!r}")
    if n.get("id") in ids: errs.append(f"{path}: duplicate id '{n.get('id')}'")
    ids.add(n.get("id"))
    learn = n.get("learn", {})
    if not learn.get("summary"): errs.append(f"{path}: empty learn.summary")
    for l in learn.get("links", []):
        url = str(l.get("url", ""))
        if not url.startswith("https://"): errs.append(f"{path}: non-https url")
        if l.get("kind") not in KINDS: errs.append(f"{path}: bad link kind")
        if warns is not None and any(d in url for d in PAYWALLED):
            warns.append(f"{path}: likely paywalled resource — {url}")
    if not n.get("do"): errs.append(f"{path}: no 'do' actions (every node must be actionable)")
    if is_spine:
        for c in n.get("children", []):
            check_node(c, f"{path}>{c.get('id')}", False, errs, ids, warns)
    elif "children" in n:
        errs.append(f"{path}: children may only nest one level deep")

def load_all():
    errs, warns, roadmaps = [], [], []
    dirs = [d for d in sorted(glob.glob(os.path.join(RDIR, "*"))) if os.path.isdir(d)]
    for d in dirs:
        rid = os.path.basename(d)
        meta_p = os.path.join(d, "meta.json")
        if not os.path.exists(meta_p):
            errs.append(f"{rid}: missing meta.json"); continue
        try: meta = json.load(open(meta_p))
        except Exception as e:
            errs.append(f"{rid}/meta.json: {e}"); continue
        for key in ("id", "emoji", "title", "tagline", "curricula"):
            if not meta.get(key): errs.append(f"{rid}/meta.json: missing '{key}'")
        if meta.get("id") != rid: errs.append(f"{rid}: meta id {meta.get('id')!r} != folder name")
        topic_files = sorted(glob.glob(os.path.join(d, "topics", "*.json")))
        if not topic_files: errs.append(f"{rid}: no topic files"); continue
        ids, nodes = set(), []
        for tf in topic_files:
            rel = f"{rid}/topics/{os.path.basename(tf)}"
            try: topic = json.load(open(tf))
            except Exception as e:
                errs.append(f"{rel}: JSON error: {e}"); continue
            check_node(topic, rel, True, errs, ids, warns)
            nodes.append(topic)
        total = len(ids)
        roadmaps.append({"meta": meta, "nodes": nodes, "total": total,
                         "files": [os.path.basename(t) for t in topic_files]})
        print(f"  {rid:20s} {total:3d} nodes, {len(nodes):2d} topics")
    if warns:
        print("\nWARNINGS (free-access rule — fix when possible):")
        for w in warns: print("  ~", w)
    return roadmaps, errs

def main():
    roadmaps, errs = load_all()
    if errs: fail(errs)
    # explicit 'order' in meta.json wins; unordered roadmaps go last alphabetically
    roadmaps.sort(key=lambda r: (r["meta"].get("order", 999), r["meta"]["id"]))
    index = [{**r["meta"], "topics": r["files"], "total": r["total"]} for r in roadmaps]
    with open(os.path.join(RDIR, "index.json"), "w") as f:
        json.dump({"generated": True, "roadmaps": index}, f, ensure_ascii=False, indent=1)
    grand = sum(r["total"] for r in roadmaps)
    print(f"\nOK: {len(roadmaps)} roadmaps, {grand} nodes -> roadmaps/index.json")

    if "--standalone" in sys.argv:
        html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        embedded = {"index": {"roadmaps": index},
                    "data": {r["meta"]["id"]: r["nodes"] for r in roadmaps}}
        marker = "const EMBEDDED_DATA=null;"
        if marker not in html:
            fail(["index.html: EMBEDDED_DATA marker not found"])
        html = html.replace(marker, "const EMBEDDED_DATA=" +
                            json.dumps(embedded, ensure_ascii=False) + ";")
        os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
        out = os.path.join(ROOT, "dist", "standalone.html")
        open(out, "w", encoding="utf-8").write(html)
        print(f"OK: standalone bundle -> dist/standalone.html ({len(html)/1024:.0f} KB)")
    return roadmaps

def check_links(roadmaps):
    """Probe every content URL politely (per-host serialization + retries);
    write tools/link-report.json with failures."""
    import concurrent.futures, urllib.request, urllib.error, time, collections
    from urllib.parse import urlparse
    urls = {}
    def walk(rid, n):
        for l in n.get("learn", {}).get("links", []):
            urls.setdefault(l["url"], []).append(f"{rid}:{n.get('id')}")
        for c in n.get("children", []): walk(rid, c)
    for r in roadmaps:
        for n in r["nodes"]: walk(r["meta"]["id"], n)
    print(f"\nChecking {len(urls)} unique URLs…")
    def probe(u):
        req = urllib.request.Request(u, method="GET", headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception as e:
            return f"ERR {type(e).__name__}"
    def probe_host(host, host_urls):
        # one host = one lane: sequential, spaced, with retries on 429/errors
        out = {}
        for u in host_urls:
            st = probe(u)
            for attempt in (1, 2):
                if isinstance(st, int) and st not in (429,) and st < 500: break
                time.sleep(2.5 * attempt)
                st = probe(u)
            out[u] = st
            time.sleep(0.5)
        return out
    by_host = collections.defaultdict(list)
    for u in urls: by_host[urlparse(u).netloc].append(u)
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for out in ex.map(lambda kv: probe_host(*kv), by_host.items()):
            results.update(out)
    bad = {u: {"status": st, "nodes": urls[u]} for u, st in results.items()
           if not (isinstance(st, int) and st < 400)}
    # 403 after retries is usually bot-blocking, not a dead link — flag separately
    dead = {u: v for u, v in bad.items() if v["status"] != 403}
    blocked = {u: v for u, v in bad.items() if v["status"] == 403}
    report = {"checked": len(urls), "ok": len(urls) - len(bad),
              "dead": dead, "maybe_bot_blocked": blocked}
    out = os.path.join(ROOT, "tools", "link-report.json")
    json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"link check: {report['ok']}/{len(urls)} ok, "
          f"{len(dead)} dead, {len(blocked)} possibly bot-blocked -> tools/link-report.json")

if __name__ == "__main__":
    rms = main()
    if "--check-links" in sys.argv:
        check_links(rms)

