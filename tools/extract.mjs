// Shared brace-matching extractor: pull a named function out of index.html
// and evaluate it in a sandbox. One source of truth — the same technique
// tests/client.test.mjs uses, so tools (succession.mjs) and tests never drift
// from the app's own implementations (contentHash above all: proposal
// staleness detection depends on hashes agreeing byte-for-byte).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function extractFn(src, name) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`function ${name} not found in index.html`);
  let depth = 0;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

export function appFns(...names) {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const script = names.map((n) => extractFn(html, n)).join("\n")
    + `\n({${names.join(",")}})`;
  return vm.runInNewContext(script, {});
}
