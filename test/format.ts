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

/** Count differing lines between two texts (simple line-by-line diff size). */
export function diffLineCount(a: string, b: string): number {
  const al = a.split('\n');
  const bl = b.split('\n');
  const max = Math.max(al.length, bl.length);
  let count = 0;
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      count++;
    }
  }
  return count;
}
