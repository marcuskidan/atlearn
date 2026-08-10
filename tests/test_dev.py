#!/usr/bin/env python3
"""Dev-server op tests — the snapshot/restore guarantee around the shared op
engine (tools/ops.mjs via tools/apply.mjs). Skipped when node isn't on PATH
(the engine itself is covered by tests/ops.test.mjs in the js suite).
    python3 -m unittest discover -s tests
"""
import hashlib, json, os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import build
import dev


def _topic(tid, title):
    return {"id": tid, "title": title, "tier": "essential",
            "learn": {"summary": "A perfectly reasonable summary sentence.",
                      "links": []},
            "do": ["Do a real thing this week."]}


def _dirsum(p):
    h = hashlib.sha256()
    for root, _, files in sorted(os.walk(p)):
        for f in sorted(files):
            fp = os.path.join(root, f)
            h.update(fp.encode())
            with open(fp, "rb") as fh:
                h.update(fh.read())
    return h.hexdigest()


@unittest.skipIf(shutil.which("node") is None, "node not on PATH")
class DevApplyTests(unittest.TestCase):
    """Point build (and therefore dev) at a scratch tree with one tiny map."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hkr-dev-")
        self.old_root, self.old_rdir = build.ROOT, build.RDIR
        build.ROOT = self.tmp
        build.RDIR = os.path.join(self.tmp, "roadmaps")
        rdir = os.path.join(build.RDIR, "testmap", "topics")
        os.makedirs(rdir)
        meta = {"id": "testmap", "emoji": "🧪", "title": "Test Map",
                "tagline": "t", "curricula": ["c"], "version": "1.0.0"}
        with open(os.path.join(build.RDIR, "testmap", "meta.json"), "w") as f:
            json.dump(meta, f)
        with open(os.path.join(rdir, "01-a.json"), "w") as f:
            json.dump(_topic("a", "A"), f)
        with open(os.path.join(rdir, "02-b.json"), "w") as f:
            json.dump(_topic("b", "B"), f)

    def tearDown(self):
        build.ROOT, build.RDIR = self.old_root, self.old_rdir
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_valid_edit_applies_and_bumps(self):
        errs, res = dev.apply_op("testmap", {"kind": "edit", "file": "01-a.json",
                                             "topic": _topic("a", "A2")})
        self.assertEqual(errs, [])
        self.assertEqual(res["saved"], "roadmaps/testmap/topics/01-a.json")
        meta = json.load(open(os.path.join(build.RDIR, "testmap", "meta.json")))
        self.assertEqual(meta["version"], "1.0.1")
        clog = json.load(open(os.path.join(build.RDIR, "testmap", "changelog.json")))
        self.assertEqual(clog["entries"][0]["by"], "dev")

    def test_whole_map_failure_restores_tree_byte_identical(self):
        target = os.path.join(build.RDIR, "testmap")
        before = _dirsum(target)
        # a valid topic whose id duplicates 02-b's — passes per-topic
        # validation, fails the whole-map gate, must roll back completely
        errs, res = dev.apply_op("testmap", {"kind": "edit", "file": "01-a.json",
                                             "topic": _topic("b", "B-dup")})
        self.assertTrue(errs)
        self.assertIsNone(res)
        self.assertEqual(before, _dirsum(target))


if __name__ == "__main__":
    unittest.main()
