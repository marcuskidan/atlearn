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

    def test_link_metadata_valid_passes(self):
        n = node()
        n["learn"]["links"][0].update(
            lang="pt-BR", minutes=12, verified="2026-08-01",
            succession=["https://a.example/x", "https://b.example/y"])
        errs, _ = self.check(n)
        self.assertEqual(errs, [])

    def test_unknown_link_key_fails(self):
        n = node()
        n["learn"]["links"][0]["minuets"] = 12
        errs, _ = self.check(n)
        self.assertTrue(any("unknown link key" in e for e in errs))

    def test_bad_link_metadata_fails(self):
        for k, v, msg in (("lang", "English", "bad link lang"),
                          ("minutes", 0, "bad link minutes"),
                          ("minutes", True, "bad link minutes"),
                          ("verified", "01/08/2026", "bad link verified"),
                          ("succession", ["http://x.example"], "bad succession")):
            n = node()
            n["learn"]["links"][0][k] = v
            errs, _ = self.check(n)
            self.assertTrue(any(msg in e for e in errs), f"{k}={v!r} should fail")

    def test_succession_containing_live_url_fails(self):
        n = node()
        n["learn"]["links"][0]["succession"] = [n["learn"]["links"][0]["url"]]
        errs, _ = self.check(n)
        self.assertTrue(any("live url itself" in e for e in errs))

    def test_reflect_valid_passes_bad_fails(self):
        errs, _ = self.check(node(reflect=["What surprised you this week?"]))
        self.assertEqual(errs, [])
        errs, _ = self.check(node(reflect=["ok", "  "]))
        self.assertTrue(any("bad reflect" in e for e in errs))
        errs, _ = self.check(node(reflect=[]))
        self.assertTrue(any("bad reflect" in e for e in errs))

    def test_reserved_node_id_map_fails(self):
        errs, _ = self.check(node(id="map"))
        self.assertTrue(any("reserved" in e for e in errs))

    def test_reflect_never_satisfies_do(self):
        errs, _ = self.check(node(do=[], reflect=["Reflect on it."]))
        self.assertTrue(any("no 'do' actions" in e for e in errs))

    def test_affiliate_params_are_errors_with_clean_url(self):
        n = node()
        n["learn"]["links"][0]["url"] = "https://example.com/a?utm_source=x&id=7"
        errs, _ = self.check(n)
        hit = [e for e in errs if "affiliate/tracking" in e]
        self.assertTrue(hit and "https://example.com/a?id=7" in hit[0])

    def test_affiliate_domain_scoped_params(self):
        n = node()
        n["learn"]["links"][0]["url"] = "https://www.amazon.com/dp/B0?tag=aff-20"
        errs, _ = self.check(n)
        self.assertTrue(any("affiliate/tracking" in e for e in errs))
        # a `tag` param elsewhere is legitimate
        n2 = node()
        n2["learn"]["links"][0]["url"] = "https://example.org/search?tag=birds"
        errs2, _ = self.check(n2)
        self.assertEqual([e for e in errs2 if "affiliate" in e], [])

    def test_affiliate_check_covers_succession(self):
        n = node()
        n["learn"]["links"][0]["succession"] = ["https://b.example/x?fbclid=abc"]
        errs, _ = self.check(n)
        self.assertTrue(any("succession URL" in e for e in errs))

    def test_clean_urls_pass_affiliate_check(self):
        n = node()
        n["learn"]["links"][0]["url"] = "https://en.wikipedia.org/wiki/X?action=history"
        errs, _ = self.check(n)
        self.assertEqual(errs, [])


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

    def test_meta_identity_fields_validate(self):
        for extra, msg in (({"type": "wizard"}, "bad type"),
                           ({"state": "hidden"}, "bad state"),
                           ({"cadence": "x" * 49}, "bad cadence"),
                           ({"disclaimer": "x" * 301}, "bad disclaimer"),
                           ({"type": "gated"}, "require a disclaimer"),
                           ({"endpoint": "  "}, "bad endpoint"),
                           ({"about": "too short"}, "bad about"),
                           ({"about": "x" * 4001}, "bad about"),
                           ({"version": "v1"}, "bad version")):
            tmp = self.make_tree({**self.valid_meta(), **extra},
                                 {"01-n1.json": node()})
            _, errs = self.with_rdir(tmp, build.load_all)
            self.assertTrue(any(msg in e for e in errs), f"{extra} should fail")

    def test_meta_identity_fields_valid_pass(self):
        meta = {**self.valid_meta(), "type": "gated", "state": "published",
                "cadence": "20 min/day · 90 days",
                "disclaimer": "Awareness-level education only.",
                "endpoint": "from nothing to a working practice",
                "version": "1.0.0"}
        tmp = self.make_tree(meta, {"01-n1.json": node()})
        _, errs = self.with_rdir(tmp, build.load_all)
        self.assertEqual(errs, [])

    def test_changelog_shape_validated(self):
        tmp = self.make_tree(self.valid_meta(), {"01-n1.json": node()})
        d = os.path.join(tmp, "rm")
        json.dump({"entries": "nope"}, open(os.path.join(d, "changelog.json"), "w"))
        _, errs = self.with_rdir(tmp, build.load_all)
        self.assertTrue(any("changelog.json" in e for e in errs))
        json.dump({"generated": True, "entries":
                   [{"at": "2026-08-07T00:00:00Z", "version": "1.0.1", "kind": "edit"}]},
                  open(os.path.join(d, "changelog.json"), "w"))
        _, errs = self.with_rdir(tmp, build.load_all)
        self.assertEqual(errs, [])

    def test_unpublished_maps_left_out_of_search(self):
        tmp = tempfile.mkdtemp()
        for rid, state in (("pub", None), ("dra", "draft"), ("arc", "archived")):
            d = os.path.join(tmp, rid)
            os.makedirs(os.path.join(d, "topics"))
            meta = {**self.valid_meta(), "id": rid}
            if state: meta["state"] = state
            json.dump(meta, open(os.path.join(d, "meta.json"), "w"))
            json.dump(node(), open(os.path.join(d, "topics", "01-n1.json"), "w"))
        old_argv = sys.argv
        sys.argv = ["build.py"]
        try:
            self.with_rdir(tmp, build.main)
        finally:
            sys.argv = old_argv
        idx = json.load(open(os.path.join(tmp, "index.json")))
        self.assertEqual({r["id"] for r in idx["roadmaps"]}, {"pub", "dra", "arc"})
        search = json.load(open(os.path.join(tmp, "search.json")))
        self.assertEqual({n["rm"] for n in search["nodes"]}, {"pub"})
        deep = json.load(open(os.path.join(tmp, "search-deep.json")))
        self.assertEqual({n["rm"] for n in deep["nodes"]}, {"pub"})

    def test_index_carries_domains_and_freshness(self):
        n = node()
        n["learn"]["links"][0]["verified"] = "2026-08-01"
        tmp = self.make_tree(self.valid_meta(), {"01-n1.json": n})
        old_argv = sys.argv
        sys.argv = ["build.py"]
        try:
            self.with_rdir(tmp, build.main)
        finally:
            sys.argv = old_argv
        entry = json.load(open(os.path.join(tmp, "index.json")))["roadmaps"][0]
        self.assertEqual(entry["domains"], {"en.wikipedia.org": 1})
        self.assertEqual(entry["freshness"],
                         {"links": 1, "verified": 1, "latest": "2026-08-01"})

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
