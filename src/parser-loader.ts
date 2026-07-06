import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';

/**
 * Loads the compiled klass.wasm grammar and caches a single Parser instance.
 * web-tree-sitter requires an async init, so callers await getParser().
 */

let parserPromise: Promise<Parser> | undefined;

function locateWasm(): string {
  // dist/parser-loader.js and src/parser-loader.ts both sit one level below the
  // repo root, where klass.wasm lives.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'klass.wasm');
}

export function getParser(): Promise<Parser> {
  if (parserPromise === undefined) {
    parserPromise = (async () => {
      await Parser.init();
      const wasm = readFileSync(locateWasm());
      const language = await Language.load(wasm);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}
