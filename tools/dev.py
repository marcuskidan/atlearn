#!/usr/bin/env python3
"""
Overseer dev server — serve the app AND make the in-app editor write real files.

    python3 tools/dev.py          # http://localhost:8123

When the app detects this server (GET /dev/ping), overseer editing switches
from "export JSON" mode to direct save: the ✏️ editor in the app PUTs the
edited topic here, it is validated with the same rules as tools/build.py,
written prettily to roadmaps/<rm>/topics/<file>, and the index regenerated.
Every save is an ordinary file change — git-diffable, revertable.

Write API (localhost only):
    GET  /dev/ping                         → {ok:true}
    PUT  /dev/topic/<roadmap>/<file>.json  → validate + write + rebuild index
    POST /dev/topic/<roadmap>              → {slug,title} create a new core topic
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
    """Re-validate everything and regenerate roadmaps/index.json."""
    roadmaps, errs = build.load_all()
    if errs: return errs
    roadmaps.sort(key=lambda r: (r["meta"].get("order", 999), r["meta"]["id"]))
    index = [{**r["meta"], "topics": r["files"], "total": r["total"]} for r in roadmaps]
    with open(os.path.join(build.RDIR, "index.json"), "w") as f:
        json.dump({"generated": True, "schemaVersion": 1, "roadmaps": index},
                  f, ensure_ascii=False, indent=1)
    return []

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

    def do_PUT(self):
        m = re.match(r"^/dev/topic/([^/]+)/([^/]+)$", self.path)
        if not m: return self._json(404, {"error": "not found"})
        rid, fname = m.group(1), m.group(2)
        if not SAFE.match(rid) or not SAFE_FILE.match(fname):
            return self._json(400, {"error": "bad path"})
        path = os.path.join(build.RDIR, rid, "topics", fname)
        if not os.path.exists(os.path.dirname(path)):
            return self._json(404, {"error": f"no such roadmap: {rid}"})
        try:
            topic = self._read_body()
        except Exception as e:
            return self._json(400, {"error": f"bad json: {e}"})
        errs = validate_topic(topic, rid)
        if errs: return self._json(422, {"errors": errs})
        json.dump(topic, open(path, "w"), ensure_ascii=False, indent=2)
        errs = rebuild_index()
        if errs: return self._json(422, {"errors": errs})
        print(f"  saved {rid}/topics/{fname}")
        return self._json(200, {"ok": True, "saved": f"roadmaps/{rid}/topics/{fname}"})

    def do_POST(self):
        m = re.match(r"^/dev/topic/([^/]+)$", self.path)
        if not m: return self._json(404, {"error": "not found"})
        rid = m.group(1)
        if not SAFE.match(rid): return self._json(400, {"error": "bad roadmap id"})
        tdir = os.path.join(build.RDIR, rid, "topics")
        if not os.path.isdir(tdir): return self._json(404, {"error": f"no such roadmap: {rid}"})
        try:
            body = self._read_body()
            slug, title = body["slug"], body["title"]
        except Exception:
            return self._json(400, {"error": "need {slug, title}"})
        if not SAFE.match(slug): return self._json(400, {"error": "bad slug"})
        nn = len(os.listdir(tdir)) + 1
        fname = f"{nn:02d}-{slug}.json"
        topic = {"id": slug, "title": title, "tier": "essential",
                 "learn": {"summary": f"TODO: write 2–3 curated sentences about {title}.",
                           "links": [{"label": "TODO — replace", "url": "https://en.wikipedia.org/wiki/Main_Page", "kind": "article"}]},
                 "do": [f"TODO: one real-world action for {title}."],
                 "children": []}
        json.dump(topic, open(os.path.join(tdir, fname), "w"), ensure_ascii=False, indent=2)
        errs = rebuild_index()
        if errs: return self._json(422, {"errors": errs})
        print(f"  created {rid}/topics/{fname}")
        return self._json(200, {"ok": True, "file": fname})

    def log_message(self, *a): pass

if __name__ == "__main__":
    print(f"Overseer dev server: http://localhost:{PORT}  (in-app editor saves to real files)")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
