import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import * as klassPlugin from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
export const corpusDir = join(here, 'corpus');

const KLASS_PRETTIER_OPTIONS: prettier.Options = {
  parser: 'klass',
  plugins: [klassPlugin as unknown as prettier.Plugin],
  // The corpus is hand-written with 4-space indentation, so we measure churn
  // against that canonical style. (The plugin also supports useTabs:true.)
  tabWidth: 4,
  useTabs: false,
  printWidth: 120,
};

export async function format(source: string, overrides: prettier.Options = {}): Promise<string> {
  return prettier.format(source, { ...KLASS_PRETTIER_OPTIONS, ...overrides });
}

export function listCorpus(): string[] {
  return readdirSync(corpusDir)
    .filter(f => f.endsWith('.klass'))
    .sort();
}

export function readCorpus(file: string): string {
  return readFileSync(join(corpusDir, file), 'utf8');
}

/**
 * Churn between two texts: the number of added + removed lines in a real
 * line-level diff (via an LCS). Unlike a positional compare, a single
 * inserted/removed line does not cascade into every following line.
 */
export function diffLineCount(a: string, b: string): number {
  const al = a.split('\n');
  const bl = b.split('\n');
  const n = al.length;
  const m = bl.length;
  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = al[i] === bl[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const common = lcs[0][0];
  // Added (in b, not common) + removed (in a, not common).
  return n - common + (m - common);
}
