#!/usr/bin/env python3
"""
Waihona dev server — serve the app AND make the in-app editor write real files.

    python3 tools/dev.py          # http://localhost:8123

When the app detects this server (GET /dev/ping), the in-app editors switch
from "export JSON" mode to direct save: every editor action becomes a
structural op POSTed here, validated with the same rules as tools/build.py,
applied to the real files (with rollback if the whole map stops validating),
and the index + search index regenerated. Every op is an ordinary file
change — git-diffable, revertable.

The op vocabulary (shared verbatim with Firestore proposals/merged docs and
tools/land.mjs — one grammar everywhere):
    edit    {file, topic}                  rewrite one core topic file
    add     {topic, after}                 new core topic ("" = at the top)
    remove  {file}                         delete a core topic
    spine   {spine: [files…]}              reorder the map's core topics
    move    {file, topic, file2, topic2}   a subtopic moved between two topics

Write API (localhost only):
    GET  /dev/ping           → {ok:true}
    POST /dev/apply          → {rm, kind, …op fields…}
"""
import json, os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # reuse the validator + index generator

ROOT = build.ROOT
PORT = 8123
SAFE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SAFE_FILE = re.compile(r"^[0-9]{2}-[a-z0-9-]+\.json$")

def validate_topic(topic, rid):
    errs, ids = [], set()
    build.check_node(topic, f"{rid}/{topic.get('id','?')}", True, errs, ids)
    return errs

def rebuild_index():
    """Re-validate everything and regenerate roadmaps/index.json + search.json."""
    roadmaps, errs = build.load_all()
    if errs: return errs
    build.write_index(roadmaps)
    return []

def apply_op(rid, body):
    """Apply one structural op. Returns (errors, result). All file writes are
    snapshotted first and rolled back if the map stops validating."""
    kind = body.get("kind")
    tdir = os.path.join(build.RDIR, rid, "topics")
    meta_p = os.path.join(build.RDIR, rid, "meta.json")
    snap = {}
    def remember(p):
        if p not in snap:
            snap[p] = open(p, encoding="utf-8").read() if os.path.exists(p) else None
    def restore():
        for p, content in snap.items():
            if content is None:
                if os.path.exists(p): os.remove(p)
            else:
                open(p, "w", encoding="utf-8").write(content)
    def files_now():
        return sorted(f for f in os.listdir(tdir) if f.endswith(".json"))
    def spine_now():
        meta = json.load(open(meta_p, encoding="utf-8"))
        return list(meta["spine"]) if meta.get("spine") else files_now()
    def save_spine(spine):
        remember(meta_p)
        meta = json.load(open(meta_p, encoding="utf-8"))
        meta["spine"] = spine
        json.dump(meta, open(meta_p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    def write_topic(fname, topic):
        p = os.path.join(tdir, fname)
        remember(p)
        json.dump(topic, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    result = {}
    if kind == "edit":
        fname, topic = body.get("file", ""), body.get("topic")
        if not SAFE_FILE.match(fname): return (["bad file name"], None)
        if not os.path.exists(os.path.join(tdir, fname)):
            return ([f"no such topic file: {fname} (use kind 'add' to create)"], None)
        errs = validate_topic(topic, rid)
        if errs: return (errs, None)
        write_topic(fname, topic)
        result = {"saved": f"roadmaps/{rid}/topics/{fname}"}

    elif kind == "add":
        topic, after = body.get("topic"), body.get("after", "")
        errs = validate_topic(topic, rid)
        if errs: return (errs, None)
        slug = topic.get("id", "")
        if not SAFE.match(slug): return (["bad topic id"], None)
        existing = files_now()
        if any(f.endswith(f"-{slug}.json") for f in existing):
            return ([f"topic '{slug}' already exists in {rid}"], None)
        nn = len(existing) + 1
        fname = f"{nn:02d}-{slug}.json"
        while fname in existing:
            nn += 1; fname = f"{nn:02d}-{slug}.json"
        spine = spine_now()
        pos = 0 if after == "" else (spine.index(after) + 1 if after in spine else len(spine))
        spine.insert(pos, fname)
        write_topic(fname, topic)
        save_spine(spine)
        result = {"file": fname}

    elif kind == "remove":
        fname = body.get("file", "")
        if not SAFE_FILE.match(fname): return (["bad file name"], None)
        p = os.path.join(tdir, fname)
        if not os.path.exists(p): return ([f"no such topic file: {fname}"], None)
        remember(p); os.remove(p)
        save_spine([f for f in spine_now() if f != fname])
        result = {"removed": fname}

    elif kind == "spine":
        spine = body.get("spine")
        if (not isinstance(spine, list) or
            any(not isinstance(f, str) or not SAFE_FILE.match(f) for f in spine)):
            return (["bad spine list"], None)
        save_spine(spine)   # build validates it matches the actual files
        result = {"spine": spine}

    elif kind == "move":
        f1, f2 = body.get("file", ""), body.get("file2", "")
        if not SAFE_FILE.match(f1) or not SAFE_FILE.match(f2) or f1 == f2:
            return (["bad file names for move"], None)
        for fname in (f1, f2):
            if not os.path.exists(os.path.join(tdir, fname)):
                return ([f"no such topic file: {fname}"], None)
        errs = (validate_topic(body.get("topic"), rid) +
                validate_topic(body.get("topic2"), rid))
        if errs: return (errs, None)
        write_topic(f1, body["topic"])
        write_topic(f2, body["topic2"])
        result = {"moved": [f1, f2]}

    else:
        return ([f"unknown kind: {kind!r}"], None)

    errs = rebuild_index()
    if errs:   # whole-map validation failed (e.g. duplicate id) — undo everything
        restore()
        rebuild_index()
        return (errs, None)
    return ([], result)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))

    def do_GET(self):
        if self.path == "/dev/ping":
            return self._json(200, {"ok": True})
        super().do_GET()

    def do_POST(self):
        if self.path != "/dev/apply":
            return self._json(404, {"error": "not found"})
        try:
            body = self._read_body()
        except Exception as e:
            return self._json(400, {"error": f"bad json: {e}"})
        rid = body.get("rm", "")
        if not SAFE.match(rid): return self._json(400, {"error": "bad roadmap id"})
        if not os.path.isdir(os.path.join(build.RDIR, rid, "topics")):
            return self._json(404, {"error": f"no such roadmap: {rid}"})
        errs, result = apply_op(rid, body)
        if errs: return self._json(422, {"errors": errs})
        print(f"  {body.get('kind')} applied to {rid}: {result}")
        return self._json(200, {"ok": True, **result})

    def log_message(self, *a): pass

if __name__ == "__main__":
    print(f"Waihona dev server: http://localhost:{PORT}  (in-app editing saves to real files)")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
