#!/usr/bin/env python3
"""
Atlearn dev server — serve the app AND make the in-app editor write real files.

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
    about   {about}                        the official map header's lead prose (meta.json)

Write API (localhost only):
    GET  /dev/ping           → {ok:true}
    POST /dev/apply          → {rm, kind, …op fields…}
"""
import json, os, re, shutil, subprocess, sys, tempfile
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

def run_shared_applier(op):
    """Hand one op to tools/apply.mjs — the SAME engine tools/land.mjs uses.
    Returns an error list ([] on success). Needs node on PATH."""
    if shutil.which("node") is None:
        return ["node is required for dev-server editing (tools/apply.mjs runs the "
                "shared op engine) — install Node 20+ and restart tools/dev.py"]
    r = subprocess.run(
        ["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "apply.mjs"),
         build.ROOT],   # explicit root: tests point build at a scratch tree
        input=json.dumps(op), capture_output=True, text=True, cwd=build.ROOT)
    if r.returncode != 0:
        return [(r.stderr or r.stdout or "apply.mjs failed").strip()]
    return []


def apply_op(rid, body):
    """Validate an op's inputs (friendly editor errors), then delegate the file
    mutations to the shared engine (tools/ops.mjs via apply.mjs). The whole
    roadmap folder is snapshotted first and restored if anything — the op or
    whole-map validation — fails."""
    kind = body.get("kind")
    rdir = os.path.join(build.RDIR, rid)
    tdir = os.path.join(rdir, "topics")
    def files_now():
        return sorted(f for f in os.listdir(tdir) if f.endswith(".json"))

    # ---- per-kind pre-validation: readable errors before anything is written
    op = {"roadmap": rid, "kind": kind, "by": {"name": "dev"}}
    result = {}
    if kind == "edit":
        fname, topic = body.get("file", ""), body.get("topic")
        if not SAFE_FILE.match(fname): return (["bad file name"], None)
        if not os.path.exists(os.path.join(tdir, fname)):
            return ([f"no such topic file: {fname} (use kind 'add' to create)"], None)
        errs = validate_topic(topic, rid)
        if errs: return (errs, None)
        op.update(file=fname, topic=topic)
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
        if after != "" and not SAFE_FILE.match(after):
            return (["bad 'after'"], None)
        op.update(file=fname, topic=topic, after=after)
        result = {"file": fname}

    elif kind == "remove":
        fname = body.get("file", "")
        if not SAFE_FILE.match(fname): return (["bad file name"], None)
        if not os.path.exists(os.path.join(tdir, fname)):
            return ([f"no such topic file: {fname}"], None)
        op.update(file=fname)
        result = {"removed": fname}

    elif kind == "spine":
        spine = body.get("spine")
        if (not isinstance(spine, list) or
            any(not isinstance(f, str) or not SAFE_FILE.match(f) for f in spine)):
            return (["bad spine list"], None)
        op.update(spine=spine)   # build validates it matches the actual files
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
        op.update(file=f1, topic=body["topic"], file2=f2, topic2=body["topic2"])
        result = {"moved": [f1, f2]}

    elif kind == "about":
        about = body.get("about")
        if not isinstance(about, str) or not (20 <= len(about) <= 4000):
            return (["bad about text (20..4000 chars)"], None)
        op.update(about=about)
        result = {"about": "saved"}

    else:
        return ([f"unknown kind: {kind!r}"], None)

    # ---- snapshot the roadmap folder, apply via the shared engine, verify.
    # NOT git checkout: the dev tree may hold uncommitted work worth keeping.
    with tempfile.TemporaryDirectory() as tmp:
        backup = os.path.join(tmp, rid)
        shutil.copytree(rdir, backup)
        def restore():
            shutil.rmtree(rdir)
            shutil.copytree(backup, rdir)
        errs = run_shared_applier(op)
        if not errs:
            errs = rebuild_index()   # whole-map gate (e.g. duplicate id)
        if errs:
            restore()
            rebuild_index()
            return (errs, None)
    return ([], result)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # dev serves live working-tree files — a browser-cached config.js or
        # index.html silently shows stale code (bit us: Firebase config edits
        # kept sign-in in demo mode until a hard reload)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

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
    print(f"Atlearn dev server: http://localhost:{PORT}  (in-app editing saves to real files)")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
