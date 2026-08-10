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
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RDIR = os.path.join(ROOT, "roadmaps")
TIERS = ("essential", "recommended", "extra")
KINDS = ("article", "video", "tool")
MAP_TYPES = ("skill", "practice", "gated")
MAP_STATES = ("published", "draft", "archived")
LINK_KEYS = {"label", "url", "kind", "lang", "minutes", "verified", "succession"}
LANG_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")

def fail(msgs):
    print("\nPROBLEMS:")
    for m in msgs: print("  -", m)
    sys.exit(1)

# Link policy lives in link-policy.json (repo root) so maintainers extend the
# "one hard rule" enforcement and the affiliate tripwire WITHOUT touching code.
# PAYWALLED: commonly paywalled/account-walled domains → warnings.
# Affiliate/tracking params are ERRORS — the message includes the clean URL so
# the fix is copy-paste; domain-scoped params (amazon's `tag=`) only fire on
# that domain, so a legitimate `tag=` elsewhere passes.
_POLICY = json.load(open(os.path.join(ROOT, "link-policy.json"), encoding="utf-8"))
PAYWALLED = tuple(_POLICY["paywalled_domains"])
AFFILIATE_PREFIXES = tuple(_POLICY["affiliate_prefixes"])
AFFILIATE_PARAMS = set(_POLICY["affiliate_params"])
AFFILIATE_DOMAIN_PARAMS = {d: set(p) for d, p in _POLICY["affiliate_domain_params"].items()}

def affiliate_taint(url):
    """Return (tainted_params, cleaned_url) — empty list when the URL is clean."""
    from urllib.parse import parse_qsl, urlencode, urlunsplit
    parts = urlsplit(url)
    if not parts.query:
        return [], url
    host = (parts.hostname or "").lower()
    domain_params = set()
    for dom, params in AFFILIATE_DOMAIN_PARAMS.items():
        if dom in host:
            domain_params |= params
    tainted, kept = [], []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        kl = k.lower()
        if (kl.startswith(AFFILIATE_PREFIXES) or kl in AFFILIATE_PARAMS
                or kl in domain_params):
            tainted.append(k)
        else:
            kept.append((k, v))
    clean = urlunsplit((parts.scheme, parts.netloc, parts.path,
                        urlencode(kept), parts.fragment))
    return tainted, clean

def check_node(n, path, is_spine, errs, ids, warns=None):
    for key in ("id", "title", "tier", "learn", "do"):
        if key not in n: errs.append(f"{path}: missing '{key}'")
    if n.get("tier") not in TIERS: errs.append(f"{path}: bad tier {n.get('tier')!r}")
    if n.get("id") in ids: errs.append(f"{path}: duplicate id '{n.get('id')}'")
    if n.get("id") == "map":   # reserved by routing: #/<category>/map is the official map view
        errs.append(f"{path}: node id 'map' is reserved (category-page routing)")
    ids.add(n.get("id"))
    learn = n.get("learn", {})
    if not learn.get("summary"): errs.append(f"{path}: empty learn.summary")
    for l in learn.get("links", []):
        url = str(l.get("url", ""))
        if not url.startswith("https://"): errs.append(f"{path}: non-https url")
        if l.get("kind") not in KINDS: errs.append(f"{path}: bad link kind")
        unknown = set(l.keys()) - LINK_KEYS
        if unknown: errs.append(f"{path}: unknown link key(s) {sorted(unknown)}")
        if "lang" in l and not (isinstance(l["lang"], str) and LANG_RE.match(l["lang"])):
            errs.append(f"{path}: bad link lang {l.get('lang')!r} (BCP-47 primary tag, e.g. 'en', 'pt-BR')")
        if "minutes" in l and not (isinstance(l["minutes"], int)
                                   and not isinstance(l["minutes"], bool)
                                   and 1 <= l["minutes"] <= 6000):
            errs.append(f"{path}: bad link minutes {l.get('minutes')!r} (integer 1..6000)")
        if "verified" in l and not (isinstance(l["verified"], str) and DATE_RE.match(l["verified"])):
            errs.append(f"{path}: bad link verified {l.get('verified')!r} (YYYY-MM-DD)")
        if "succession" in l:
            s = l["succession"]
            if not (isinstance(s, list) and len(s) <= 5
                    and all(isinstance(u, str) and u.startswith("https://") for u in s)):
                errs.append(f"{path}: bad succession (up to 5 https:// URLs)")
            elif url in s:
                errs.append(f"{path}: succession contains the live url itself")
        if warns is not None and any(d in url for d in PAYWALLED):
            warns.append(f"{path}: likely paywalled resource — {url}")
        tainted, clean = affiliate_taint(url)
        if tainted:
            errs.append(f"{path}: affiliate/tracking params {tainted} — strip to: {clean}")
        for u in l.get("succession", []) if isinstance(l.get("succession"), list) else []:
            t2, c2 = affiliate_taint(str(u))
            if t2:
                errs.append(f"{path}: affiliate/tracking params {t2} in succession URL — strip to: {c2}")
    if "reflect" in n:
        r = n["reflect"]
        if not (isinstance(r, list) and r
                and all(isinstance(p, str) and p.strip() for p in r)):
            errs.append(f"{path}: bad reflect (non-empty list of prompt strings)")
    if not n.get("do"): errs.append(f"{path}: no 'do' actions (every node must be actionable)")
    if "side" in n:
        # maintainer-chosen side of the spine; subtopics only, renderer
        # falls back to alternating when absent
        if is_spine:
            errs.append(f"{path}: 'side' belongs on subtopics only")
        elif n["side"] not in ("left", "right"):
            errs.append(f"{path}: bad side {n['side']!r} (left|right)")
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
        # Map identity fields (all optional; absent = skill / published)
        if "type" in meta and meta["type"] not in MAP_TYPES:
            errs.append(f"{rid}/meta.json: bad type {meta['type']!r} (skill|practice|gated)")
        if "state" in meta and meta["state"] not in MAP_STATES:
            errs.append(f"{rid}/meta.json: bad state {meta['state']!r} (published|draft|archived)")
        if "cadence" in meta and not (isinstance(meta["cadence"], str)
                                      and 0 < len(meta["cadence"]) <= 48):
            errs.append(f"{rid}/meta.json: bad cadence (string, max 48 chars)")
        if "disclaimer" in meta and not (isinstance(meta["disclaimer"], str)
                                         and 0 < len(meta["disclaimer"]) <= 300):
            errs.append(f"{rid}/meta.json: bad disclaimer (string, max 300 chars)")
        if meta.get("type") == "gated" and not meta.get("disclaimer"):
            errs.append(f"{rid}/meta.json: gated maps require a disclaimer (the scope banner is the point of the type)")
        if "endpoint" in meta and not (isinstance(meta["endpoint"], str) and meta["endpoint"].strip()):
            errs.append(f"{rid}/meta.json: bad endpoint (non-empty string)")
        if "about" in meta and not (isinstance(meta["about"], str)
                                    and 20 <= len(meta["about"]) <= 4000):
            errs.append(f"{rid}/meta.json: bad about (string, 20..4000 chars)")
        if "version" in meta and not (isinstance(meta["version"], str)
                                      and SEMVER_RE.match(meta["version"])):
            errs.append(f"{rid}/meta.json: bad version {meta.get('version')!r} (semver, e.g. 1.0.0)")
        # changelog.json is APPEND-ONLY, written by land.mjs/dev.py — validate shape only
        clog_p = os.path.join(d, "changelog.json")
        if os.path.exists(clog_p):
            try:
                clog = json.load(open(clog_p))
                entries = clog.get("entries")
                if not (clog.get("generated") is True and isinstance(entries, list)):
                    errs.append(f"{rid}/changelog.json: expected {{generated: true, entries: []}}")
                else:
                    for e in entries:
                        if not all(k in e for k in ("at", "version", "kind")):
                            errs.append(f"{rid}/changelog.json: entry missing at/version/kind")
                            break
            except Exception as e:
                errs.append(f"{rid}/changelog.json: {e}")
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

def iter_links(r):
    for n in r["nodes"]:
        for l in n.get("learn", {}).get("links", []): yield l
        for c in n.get("children", []):
            for l in c.get("learn", {}).get("links", []): yield l

def link_stats(r):
    """Domain-concentration tally + freshness rollup for one roadmap.
    Domain visibility is an integrity defense (a map quietly funneling to one
    channel should be visible at a glance); freshness feeds the Atlas and the
    vital-signs page. Both are derived, never authored."""
    domains, dates, links = {}, [], 0
    for l in iter_links(r):
        links += 1
        host = urlsplit(str(l.get("url", ""))).hostname or ""
        host = host[4:] if host.startswith("www.") else host
        if host: domains[host] = domains.get(host, 0) + 1
        if DATE_RE.match(str(l.get("verified", ""))): dates.append(l["verified"])
    # No today()-relative numbers here: index.json must be deterministic or the
    # CI index-freshness diff breaks. Clients compute recency from `latest`;
    # the deploy-time health artifact (--health) does the 90-day math.
    fresh = {"links": links, "verified": len(dates),
             "latest": max(dates) if dates else None}
    return dict(sorted(domains.items(), key=lambda kv: (-kv[1], kv[0]))), fresh

def write_index(roadmaps):
    """Sort roadmaps, derive the public index, write roadmaps/index.json and
    roadmaps/search.json (every node title, powering the in-app search).
    (Also used by tools/dev.py after every in-app editor save.)"""
    # explicit 'order' in meta.json wins; unordered roadmaps go last alphabetically
    roadmaps.sort(key=lambda r: (r["meta"].get("order", 999), r["meta"]["id"]))
    index = []
    for r in roadmaps:
        domains, fresh = link_stats(r)
        index.append({**r["meta"], "topics": r["files"], "total": r["total"],
                      "domains": domains, "freshness": fresh})
    with open(os.path.join(RDIR, "index.json"), "w") as f:
        json.dump({"generated": True, "schemaVersion": 1, "roadmaps": index},
                  f, ensure_ascii=False, indent=1)
    # draft/archived maps stay in index.json (the dev loop and stranded walker
    # progress both need the entry) but leave search: discovery is for published.
    search, deep = [], []
    for r in roadmaps:
        if r["meta"].get("state", "published") != "published": continue
        rid = r["meta"]["id"]
        for n in r["nodes"]:
            search.append({"rm": rid, "id": n["id"], "t": n["title"],
                           "tier": n["tier"], "core": True})
            deep.append({"rm": rid, "id": n["id"],
                         "s": (n["learn"]["summary"] + " " + " ".join(n.get("do", []))).lower()})
            for c in n.get("children", []):
                search.append({"rm": rid, "id": c["id"], "t": c["title"],
                               "tier": c["tier"], "core": False})
                deep.append({"rm": rid, "id": c["id"],
                             "s": (c["learn"]["summary"] + " " + " ".join(c.get("do", []))).lower()})
    with open(os.path.join(RDIR, "search.json"), "w") as f:
        json.dump({"generated": True, "nodes": search}, f, ensure_ascii=False)
    with open(os.path.join(RDIR, "search-deep.json"), "w") as f:
        json.dump({"generated": True, "nodes": deep}, f, ensure_ascii=False)
    return index

def write_health(roadmaps):
    """Vital signs (Part IX), from repo data ONLY — resource freshness,
    maintainer coverage, lifecycle counts, and the landed-contribution tally
    from git history. Nothing here counts walker behavior; that telemetry is
    deliberately deferred (LATER.md). Generated at deploy time into the Pages
    artifact — never committed (today()-relative numbers would churn CI)."""
    import subprocess
    from datetime import date, timedelta
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    maps_out, links_total, verified90_total, verified_total = [], 0, 0, 0
    for r in roadmaps:
        dates = [l["verified"] for l in iter_links(r)
                 if DATE_RE.match(str(l.get("verified", "")))]
        n_links = sum(1 for _ in iter_links(r))
        links_total += n_links
        verified_total += len(dates)
        v90 = sum(1 for v in dates if v >= cutoff)
        verified90_total += v90
        m = r["meta"]
        domains, _ = link_stats(r)
        # Concentration watches for quiet funneling to ONE channel. Wikipedia
        # is the curationally-recommended default source (CLAUDE.md rule 4) —
        # counting it made the alarm fire on every map, i.e. never signal.
        signal = {d: n for d, n in domains.items()
                  if not d.endswith("wikipedia.org")}
        top = next(iter(signal.items()), None)
        maps_out.append({
            "id": m["id"], "title": m["title"], "emoji": m.get("emoji", ""),
            "type": m.get("type", "skill"), "state": m.get("state", "published"),
            "version": m.get("version"), "links": n_links,
            "verified90": v90, "latest": max(dates) if dates else None,
            "placeholderMaintainer": m.get("maintainer") in (None, "", "The Admins"),
            # integrity: domain concentration lives HERE (and in review tooling),
            # never on walker surfaces
            "domains": len(domains),
            "topDomain": top[0] if top else None,
            "topShare": round(top[1] / n_links, 2) if top and n_links else 0,
        })
    # landed contributions from the public commit record (land.mjs trailers)
    contributors = {}
    try:
        log = subprocess.run(
            ["git", "log", "--grep=Merged-doc:", "--format=%b"],
            capture_output=True, text=True, cwd=ROOT, timeout=30).stdout
        for line in log.splitlines():
            mline = re.match(r"Proposed by (.+?) via the app", line)
            if mline:
                who = mline.group(1)
                contributors[who] = contributors.get(who, 0) + 1
    except Exception:
        pass
    health = {
        "generated": date.today().isoformat(),
        "boundary": "Repo data and the public commit record only — no walker "
                    "behavior is counted anywhere. Time-on-site is not a "
                    "success measure here.",
        "maps": len(maps_out),
        "nodes": sum(r["total"] for r in roadmaps),
        "links": links_total,
        "verified90": verified90_total,
        "verifiedEver": verified_total,
        "namedMaintainers": sum(1 for x in maps_out if not x["placeholderMaintainer"]),
        "states": {s: sum(1 for x in maps_out if x["state"] == s) for s in MAP_STATES},
        "landedContributions": sum(contributors.values()),
        "contributors": dict(sorted(contributors.items(), key=lambda kv: -kv[1])[:50]),
        "perMap": maps_out,
    }
    out = os.path.join(RDIR, "health.json")
    with open(out, "w") as f:
        json.dump(health, f, ensure_ascii=False, indent=1)
    print(f"OK: vital signs -> roadmaps/health.json "
          f"({health['verified90']}/{links_total} links verified ≤90d, "
          f"{health['namedMaintainers']}/{len(maps_out)} named maintainers)")

def main():
    roadmaps, errs = load_all()
    if errs: fail(errs)
    index = write_index(roadmaps)
    grand = sum(r["total"] for r in roadmaps)
    print(f"\nOK: {len(roadmaps)} roadmaps, {grand} nodes -> roadmaps/index.json")

    if "--health" in sys.argv:
        write_health(roadmaps)

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

