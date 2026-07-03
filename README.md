# prettier-plugin-klass

A [Prettier](https://prettier.io/) plugin that formats the **Klass** DSL.

> Status: **B1 checkpoint** — the tree-sitter grammar parses the full corpus.
> The Prettier printer/plugin (languages/parsers/printers/embed) is **not**
> implemented yet.

## Architecture

```
Klass.g4 (ANTLR4, authoritative)
   │  ported by hand
   ▼
grammar.js  ──tree-sitter generate──▶  src/parser.c
   │                                        │
   │                          tree-sitter build --wasm
   ▼                                        ▼
                                        klass.wasm
                                            │  loaded via web-tree-sitter
                                            ▼
                              (future) Prettier Doc printer + embed(markdown)
```

The grammar is a hand port of the authoritative ANTLR4 grammar in the Klass
repo:

- `klass-model-converters/klass-grammar/src/main/antlr4/cool/klass/model/meta/grammar/Klass.g4`
- imports `imports/KlassLexerRules.g4` and `imports/JavaLexer.g4`

## Building the grammar

Requires the tree-sitter CLI (installed as a devDependency) and a wasm
toolchain (Emscripten via a local `emcc`, or a running Docker daemon —
tree-sitter falls back to the `emscripten/emsdk` image).

```sh
npm install
npm run generate    # grammar.js -> src/parser.c
npm run build:wasm  # src/parser.c -> klass.wasm
# or both at once:
npm run grammar
```

`klass.wasm` is committed so the tests are self-contained; rebuild it whenever
`grammar.js` changes.

## Tests

```sh
npm test
```

The B1 checkpoint test (`test/corpus.test.ts`) loads `klass.wasm` via
`web-tree-sitter`, parses every `.klass` file in `test/corpus/`, and asserts
zero `ERROR` / `MISSING` nodes. The corpus is a vendored copy of the 117 real
`.klass` files from the Klass repo (paths flattened, `/` → `_`).

## Grammar port notes

- ANTLR error-recovery alternatives that call `notifyErrorListeners`
  ("Missing semi-colon after ...") are dropped; the terminating `;` is
  required. The corpus is all valid input.
- The left-recursive `criteriaExpression` is expressed with `prec.left`;
  `&&` binds tighter than `||`, matching ANTLR alternative order.
- `keywordValidAsIdentifier` is an explicit `choice` of keyword strings plus
  the raw `_identifier` token. `primitiveType` and `nativeLiteral` are given a
  higher `prec` so that, e.g., `Boolean` in a property type or `user` in a
  criteria expression win over the identifier interpretation.
- A declared conflict on `[url, urlPathSegment]` lets the GLR parser resolve
  the ambiguous `/` between a trailing-slash URL and the next path segment.
