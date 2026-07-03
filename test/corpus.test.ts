import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Parser, Language } from 'web-tree-sitter';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, 'corpus');
const wasmPath = join(here, '..', 'klass.wasm');

let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  const language = await Language.load(wasmPath);
  parser = new Parser();
  parser.setLanguage(language);
});

/** Collect every ERROR / MISSING node in the tree with a little context. */
function collectProblems(source: string): string[] {
  const tree = parser.parse(source);
  if (tree === null) {
    return ['parse() returned null'];
  }
  const problems: string[] = [];
  const cursor = tree.walk();
  const visit = (): void => {
    const node = cursor.currentNode;
    if (node.type === 'ERROR' || node.isError || node.isMissing) {
      const { row, column } = node.startPosition;
      const label = node.isMissing ? 'MISSING' : 'ERROR';
      problems.push(`${label} ${node.type} at ${row + 1}:${column + 1} -> ${JSON.stringify(node.text.slice(0, 40))}`);
    }
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  visit();
  return problems;
}

const files = readdirSync(corpusDir).filter(f => f.endsWith('.klass'));

describe('klass grammar parses the corpus', () => {
  it('has a non-empty corpus', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`parses ${file} with zero errors`, () => {
      const source = readFileSync(join(corpusDir, file), 'utf8');
      const problems = collectProblems(source);
      expect(problems, `${file}:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});
