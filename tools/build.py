#!/usr/bin/env python3
"""
Waihona — build tool.

  python3 tools/build.py               validate all content + regenerate roadmaps/index.json
  python3 tools/build.py --standalone  also emit dist/standalone.html (single file, data inlined)

(Link health is checked by lychee in .github/workflows/link-check.yml.)

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
        # Spine order: meta.json may carry an explicit `spine` (list of topic
        # file names) — the order authority for structural edits. Without it,
        # sorted file names (the NN- prefix) decide, as always.
        spine = meta.get("spine")
        if spine is not None:
            names = [os.path.basename(t) for t in topic_files]
            if sorted(spine) != sorted(names):
                errs.append(f"{rid}: meta.json spine doesn't match topic files "
                            f"(missing {sorted(set(names)-set(spine))}, "
                            f"extra {sorted(set(spine)-set(names))})")
            else:
                pos = {f: i for i, f in enumerate(spine)}
                topic_files.sort(key=lambda t: pos[os.path.basename(t)])
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

def write_index(roadmaps):
    """Sort roadmaps, derive the public index, write roadmaps/index.json and
    roadmaps/search.json (every node title, powering the in-app search).
    (Also used by tools/dev.py after every in-app editor save.)"""
    # explicit 'order' in meta.json wins; unordered roadmaps go last alphabetically
    roadmaps.sort(key=lambda r: (r["meta"].get("order", 999), r["meta"]["id"]))
    index = [{**r["meta"], "topics": r["files"], "total": r["total"]} for r in roadmaps]
    with open(os.path.join(RDIR, "index.json"), "w") as f:
        json.dump({"generated": True, "schemaVersion": 1, "roadmaps": index},
                  f, ensure_ascii=False, indent=1)
    search = []
    for r in roadmaps:
        rid = r["meta"]["id"]
        for n in r["nodes"]:
            search.append({"rm": rid, "id": n["id"], "t": n["title"],
                           "tier": n["tier"], "core": True})
            for c in n.get("children", []):
                search.append({"rm": rid, "id": c["id"], "t": c["title"],
                               "tier": c["tier"], "core": False})
    with open(os.path.join(RDIR, "search.json"), "w") as f:
        json.dump({"generated": True, "nodes": search}, f, ensure_ascii=False)
    return index

def main():
    roadmaps, errs = load_all()
    if errs: fail(errs)
    index = write_index(roadmaps)
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
        # inline config.js so the single file works from file:// too
        conf_tag = '<script src="config.js"></script>'
        if conf_tag not in html:
            fail(["index.html: config.js script tag not found"])
        conf = open(os.path.join(ROOT, "config.js"), encoding="utf-8").read()
        html = html.replace(conf_tag, "<script>\n" + conf + "</script>")
        os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
        out = os.path.join(ROOT, "dist", "standalone.html")
        open(out, "w", encoding="utf-8").write(html)
        print(f"OK: standalone bundle -> dist/standalone.html ({len(html)/1024:.0f} KB)")
    return roadmaps

if __name__ == "__main__":
    main()

