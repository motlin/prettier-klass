# prettier-plugin-klass

A [Prettier](https://prettier.io/) plugin that formats the **Klass** DSL.

> Status: **B5 checkpoint** — the plugin formats the whole language (languages,
> parser, and a Doc printer with comment handling). The markdown `embed` hook
> and npm publish (B6) are **not** done yet.

## Usage

```sh
npm install --save-dev prettier prettier-plugin-klass
npx prettier --plugin=prettier-plugin-klass --write '**/*.klass'
```

Or in `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-klass"],
  "overrides": [{ "files": "*.klass", "options": { "tabWidth": 4 } }]
}
```

The plugin honors `printWidth`, `tabWidth`, and `useTabs`.

## Formatting style

The 117 hand-written corpus files are the canonical style reference; formatting
an already-canonical file is close to a no-op (52 of 117 format unchanged; the
rest change only in the deliberate ways below). Prettier does not do vertical
alignment, so a few hand-written conventions are canonicalized:

- **Alignment padding collapses to single spaces.** `userId    : String` becomes
  `userId: String`. This is the largest source of churn (35 corpus files use
  column alignment) and the one Prettier fundamentally cannot reproduce.
- **Header clauses go one per line.** `extends` / `implements` / `abstract` /
  service + classifier modifiers each get their own indented continuation line
  (the corpus-dominant style: 77 broken vs 12 inline continuation clauses).
- **Boolean criteria chains break per operator.** Each `&&` / `||` leads its own
  continuation line, indented two levels beyond the enclosing statement, even
  when the chain would fit on one line (47 of 73 corpus continuations fit but are
  still broken). A left-associative run of one operator stays at a single indent.
- **Empty blocks expand to `{`\n`}`** (28 corpus files vs 7 inline `{}`), and the
  opening brace always goes on its own line (774 vs 2).
- **Optional marker has no leading space:** `String?`, not `String ?` (13 vs 4).
- **`orderBy` on an association end / parameterized property goes on its own
  indented line** (the dominant style; a couple of files inline it).
- Comments and commented-out code are emitted verbatim and never reflowed.

Blank lines the author left between members (and before leading comments) are
preserved; runs of blank lines collapse to one.

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

The corpus is a vendored copy of the 117 real `.klass` files from the Klass repo
(paths flattened, `/` → `_`). The suites are:

- `test/corpus.test.ts` — every corpus file parses via `web-tree-sitter` with
  zero `ERROR` / `MISSING` nodes (the B1 grammar check).
- `test/churn.test.ts` — formats every corpus file and asserts total churn
  (added + removed lines vs the hand-written original) stays under a ratchet,
  plus `format(format(x)) === format(x)` idempotency for all 117.
- `test/roundtrip.test.ts` — every formatted file reparses with zero errors.
- `test/snapshot.test.ts` — exact-output snapshots for representative files.

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
