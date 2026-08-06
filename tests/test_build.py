#!/usr/bin/env python3
"""Validator tests for tools/build.py — runnable locally with no dependencies:
    python3 -m unittest discover -s tests
"""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import build


def node(**over):
    base = {"id": "n1", "title": "Node", "tier": "essential",
            "learn": {"summary": "A perfectly reasonable summary sentence.",
                      "links": [{"label": "L", "url": "https://en.wikipedia.org/wiki/X",
                                 "kind": "article"}]},
            "do": ["Do a real thing this week."]}
    base.update(over)
    return base


class CheckNodeTests(unittest.TestCase):
    def check(self, n, is_spine=True):
        errs, warns = [], []
        build.check_node(n, "t", is_spine, errs, set(), warns)
        return errs, warns

    def test_valid_node_passes(self):
        errs, warns = self.check(node())
        self.assertEqual(errs, [])
        self.assertEqual(warns, [])

    def test_missing_do_fails(self):
        errs, _ = self.check(node(do=[]))
        self.assertTrue(any("no 'do' actions" in e for e in errs))

    def test_bad_tier_fails(self):
        errs, _ = self.check(node(tier="critical"))
        self.assertTrue(any("bad tier" in e for e in errs))

    def test_duplicate_ids_fail(self):
        errs, warns = [], []
        ids = set()
        build.check_node(node(), "t", True, errs, ids, warns)
        build.check_node(node(), "t2", True, errs, ids, warns)
        self.assertTrue(any("duplicate id" in e for e in errs))

    def test_non_https_link_fails(self):
        n = node()
        n["learn"]["links"][0]["url"] = "http://example.com"
        errs, _ = self.check(n)
        self.assertTrue(any("non-https" in e for e in errs))

    def test_two_level_nesting_fails(self):
        child = node(id="c1")
        child["children"] = [node(id="gc1")]
        parent = node(id="p1", children=[child])
        errs, _ = self.check(parent)
        self.assertTrue(any("one level deep" in e for e in errs))

    def test_paywalled_domain_warns_not_fails(self):
        n = node()
        n["learn"]["links"][0]["url"] = "https://medium.com/some-post"
        errs, warns = self.check(n)
        self.assertEqual(errs, [])
        self.assertTrue(any("paywalled" in w for w in warns))


class LoadAllTests(unittest.TestCase):
    def make_tree(self, meta, topics):
        tmp = tempfile.mkdtemp()
        d = os.path.join(tmp, meta.get("id", "rm"))
        os.makedirs(os.path.join(d, "topics"))
        json.dump(meta, open(os.path.join(d, "meta.json"), "w"))
        for fname, topic in topics.items():
            json.dump(topic, open(os.path.join(d, "topics", fname), "w"))
        return tmp

    def with_rdir(self, rdir, fn):
        old = build.RDIR
        build.RDIR = rdir
        try:
            return fn()
        finally:
            build.RDIR = old

    def valid_meta(self):
        return {"id": "rm", "emoji": "🧪", "title": "T", "tagline": "t",
                "curricula": "c", "order": 1}

    def test_valid_tree_loads(self):
        tmp = self.make_tree(self.valid_meta(), {"01-n1.json": node()})
        roadmaps, errs = self.with_rdir(tmp, build.load_all)
        self.assertEqual(errs, [])
        self.assertEqual(roadmaps[0]["total"], 1)

    def test_meta_folder_mismatch_fails(self):
        meta = self.valid_meta()
        meta["id"] = "other"
        tmp = self.make_tree({**meta}, {"01-n1.json": node()})
        # folder is named by meta id pre-mutation; rebuild with mismatched folder
        tmp2 = tempfile.mkdtemp()
        d = os.path.join(tmp2, "folder-name")
        os.makedirs(os.path.join(d, "topics"))
        json.dump(meta, open(os.path.join(d, "meta.json"), "w"))
        json.dump(node(), open(os.path.join(d, "topics", "01-n1.json"), "w"))
        _, errs = self.with_rdir(tmp2, build.load_all)
        self.assertTrue(any("!= folder name" in e for e in errs))

    def test_index_gets_schema_version(self):
        tmp = self.make_tree(self.valid_meta(), {"01-n1.json": node()})
        old_argv = sys.argv
        sys.argv = ["build.py"]
        try:
            self.with_rdir(tmp, build.main)
        finally:
            sys.argv = old_argv
        idx = json.load(open(os.path.join(tmp, "index.json")))
        self.assertEqual(idx["schemaVersion"], 1)
        self.assertTrue(idx["generated"])
        self.assertEqual(idx["roadmaps"][0]["total"], 1)


if __name__ == "__main__":
    unittest.main()
