import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import * as klassPlugin from '../src/index.js';

/**
 * Markdown embed: with this plugin loaded, Prettier's markdown printer resolves
 * ```klass fenced blocks to our parser and formats them in place, while prose
 * and non-klass fences are left to Prettier's own markdown formatting.
 *
 * Fixtures are real docs vendored from the Klass repo (`docs/part1/*.md`),
 * whose klass blocks use column-alignment padding — so a correct embed both
 * collapses that padding and applies tabs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures', 'markdown');

const KLASS_OPTS: prettier.Options = {
  parser: 'markdown',
  plugins: [klassPlugin as unknown as prettier.Plugin],
  tabWidth: 4,
  useTabs: true,
  printWidth: 120,
};

async function formatMarkdown(source: string, plugins: prettier.Plugin[]): Promise<string> {
  return prettier.format(source, { ...KLASS_OPTS, plugins });
}

/** Extract the bodies of fenced blocks of a given info string. */
function fencesOf(markdown: string, lang: string): string[] {
  const re = new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Replace every klass fence body with a placeholder, to compare the rest. */
function blankKlassFences(markdown: string): string {
  return markdown.replace(/```klass\n[\s\S]*?```/g, '```klass\nX\n```');
}

const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.md'));

describe('markdown embed', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    describe(fixture, () => {
      const source = readFileSync(join(fixturesDir, fixture), 'utf8');

      it('formats klass fences (tabs, no alignment padding)', async () => {
        const out = await formatMarkdown(source, KLASS_OPTS.plugins as prettier.Plugin[]);
        const klassBlocks = fencesOf(out, 'klass');
        expect(klassBlocks.length).toBeGreaterThan(0);
        for (const block of klassBlocks) {
          // Canonical style: indentation is tabs, and no column-alignment run of
          // spaces remains before a colon.
          const indentedLines = block.split('\n').filter(l => /^\s+\S/.test(l));
          for (const line of indentedLines) {
            expect(line, `expected tab indent: ${JSON.stringify(line)}`).toMatch(/^\t/);
          }
          expect(block, 'no alignment padding before colon').not.toMatch(/\S {2,}:/);
        }
      });

      it('leaves prose and non-klass fences byte-identical to plain Prettier', async () => {
        // Format with our plugin and without; blanking the klass fences, the two
        // must be identical — proving we touch only klass blocks.
        const withPlugin = await formatMarkdown(source, KLASS_OPTS.plugins as prettier.Plugin[]);
        const withoutPlugin = await formatMarkdown(source, []);
        expect(blankKlassFences(withPlugin)).toEqual(blankKlassFences(withoutPlugin));
      });

      it('is idempotent', async () => {
        const once = await formatMarkdown(source, KLASS_OPTS.plugins as prettier.Plugin[]);
        const twice = await formatMarkdown(once, KLASS_OPTS.plugins as prettier.Plugin[]);
        expect(twice).toEqual(once);
      });
    });
  }
});
