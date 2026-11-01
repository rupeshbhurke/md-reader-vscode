const { test } = require('node:test');
const assert = require('node:assert/strict');
const hljs = require('highlight.js');
const { readText } = require('./helpers');

const css = readText('src', 'webview', 'reader.css');

// Regression guard for the 0.3.1 defect: highlight.js emits only `hljs-*`
// class names, so any class reader.css has no rule for renders uncoloured.
const SAMPLES = {
  javascript: 'import x from "y"; const a = 1 + 2; // c\nfunction f(p) { return /re/.test(`t${a}`) ? null : undefined; }\nclass A extends B { static s = 1 }',
  typescript: 'interface P { n: number }\ntype T = string | number;\nexport function f<T>(x: T): T { return x }',
  python: 'import os\n@dec\ndef f(a, b=1):\n    """doc"""\n    return {"k": [1, 2.5, None, True]}\nclass C(Base): pass',
  json: '{"a": 1, "b": [true, null, "s"], "c": {"d": 1.5}}',
  html: '<!DOCTYPE html><div class="a" id="b" data-x=1><!-- c --><script>var a=1</script><style>.a{color:red}</style></div>',
  css: '@media (min-width:1px){ .a > #b::after, a[href^="x"]:hover { color:#fff; margin:1px 2em; background:url(x) } }',
  bash: '#!/bin/bash\nset -e\nfor f in *.txt; do echo "$f" | grep -c x > /dev/null; done\nif [ -f x ]; then exit 1; fi',
  yaml: 'key: value\nlist:\n  - a\n  - b: 1\n# c\nanchor: &x {a: 1}',
  sql: 'SELECT a, COUNT(*) FROM t WHERE b = \'x\' AND c > 1 GROUP BY a; -- c',
  java: '@Override public class A<T> extends B { private static final int N = 1; void f() { String s = "x"; } }',
  go: 'package main\nimport "fmt"\nfunc main() { x := []int{1}; fmt.Println("a", x) }',
  rust: 'fn main() { let x: u32 = 1; println!("{}", x); } // c\nstruct S<T> { a: T }',
  diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new',
  markdown: '# H\n*e* **s** `c` [l](u)\n> q\n- i',
  xml: '<?xml version="1.0"?><a b="c">t<!-- c --><![CDATA[x]]></a>',
  c: '#include <stdio.h>\nint main(void) { char c = \'a\'; printf("%d\\n", 1); return 0; }',
};

function usedClasses() {
  const used = new Set();
  for (const [language, code] of Object.entries(SAMPLES)) {
    const html = hljs.highlight(code, { language }).value;
    for (const m of html.matchAll(/class="([^"]+)"/g)) {
      for (const cls of m[1].split(/\s+/)) { if (cls.startsWith('hljs-')) { used.add(cls); } }
    }
  }
  return used;
}

test('reader.css styles every highlight.js class that common languages emit', () => {
  const used = usedClasses();
  assert.ok(used.size > 15, 'sample set should exercise many token classes');
  const missing = [...used].filter(cls => {
    // highlight.js 11 also emits modifier classes like `function_` / `class_`
    // (no `hljs-` prefix) which are covered by compound selectors.
    return !new RegExp(`\\.${cls.replace(/[-_]/g, m => '\\' + m)}(?![\\w-])`).test(css);
  });
  assert.deepEqual(missing.sort(), [], 'highlight.js classes with no rule in reader.css: ' + missing.join(', '));
});

test('every --hl-* variable used by a rule has a default on :root', () => {
  const used = new Set([...css.matchAll(/var\((--hl-[\w-]+)\)/g)].map(m => m[1]));
  assert.ok(used.size >= 10);
  const rootBlock = /:root\s*\{([^}]*--hl-keyword[^}]*)\}/.exec(css);
  assert.ok(rootBlock, 'default --hl-* block on :root not found');
  for (const v of used) { assert.ok(rootBlock[1].includes(v + ':'), `${v} has no default on :root`); }
});

test('each mdReader.codeTheme palette defines every --hl-* variable', () => {
  const { CODE_THEMES } = require('./helpers').themes();
  const vars = [...new Set([...css.matchAll(/var\((--hl-[\w-]+)\)/g)].map(m => m[1]))];
  for (const name of CODE_THEMES.filter(n => n !== 'github-dark')) {   // github-dark = :root defaults
    const block = new RegExp(`\\[data-code-theme="${name}"\\]\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(block, `no [data-code-theme="${name}"] block in reader.css`);
    for (const v of vars) { assert.ok(block[1].includes(v + ':'), `${name} is missing ${v}`); }
  }
});
