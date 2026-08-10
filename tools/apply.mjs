// Thin CLI over tools/ops.mjs: one op as JSON on stdin, applied to this
// working tree. Used by tools/dev.py so the dev server and the landing
// Action mutate files through the identical code path.
//
//   echo '{"roadmap":"astronomy","kind":"edit",...}' | node tools/apply.mjs
//   node tools/apply.mjs /some/other/root   # tests use a scratch tree
//
// Prints {"ok":true,"title":...} on success; a readable error on stderr and
// exit 1 otherwise. No validation here beyond the op grammar — callers gate
// with tools/build.py afterwards (and roll back on failure).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOp } from "./ops.mjs";

const ROOT = process.argv[2] || dirname(dirname(fileURLToPath(import.meta.url)));

let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  const title = applyOp(ROOT, JSON.parse(input));
  console.log(JSON.stringify({ ok: true, title }));
} catch (e) {
  console.error(String((e && e.message) || e));
  process.exit(1);
}
