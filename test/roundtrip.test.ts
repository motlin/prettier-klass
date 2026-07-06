import { describe, expect, it } from 'vitest';
import { Language, Parser } from 'web-tree-sitter';
import { format, listCorpus, readCorpus } from './format.js';

/**
 * Round-trip safety: formatted output must still parse with zero ERROR/MISSING
 * nodes. A formatter that produces unparseable output is worse than useless.
 */

const files = listCorpus();
let parser: Parser;

async function getTestParser(): Promise<Parser> {
  if (parser === undefined) {
    await Parser.init();
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const language = await Language.load(readFileSync(join(here, '..', 'klass.wasm')));
    parser = new Parser();
    parser.setLanguage(language);
  }
  return parser;
}

function countErrors(source: string, p: Parser): number {
  const tree = p.parse(source);
  if (tree === null) {
    return 1;
  }
  let errors = 0;
  const cursor = tree.walk();
  const visit = (): void => {
    const node = cursor.currentNode;
    if (node.isError || node.isMissing) {
      errors++;
    }
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  visit();
  return errors;
}

describe('round-trip safety', () => {
  for (const file of files) {
    it(`formatted ${file} reparses with zero errors`, async () => {
      const p = await getTestParser();
      const formatted = await format(readCorpus(file));
      expect(countErrors(formatted, p)).toBe(0);
    });
  }
});
