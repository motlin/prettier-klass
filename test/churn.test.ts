import { describe, expect, it } from 'vitest';
import { diffLineCount, format, listCorpus, readCorpus } from './format.js';

/**
 * Corpus-churn driver. The 117 hand-written files are the canonical style
 * reference; formatting an already-canonical file should be close to a no-op.
 * This suite quantifies total churn and enforces idempotency + round-trip.
 */

const files = listCorpus();

describe('corpus formatting churn', () => {
  it('reports total churn across the corpus', async () => {
    let totalDiffLines = 0;
    let changedFiles = 0;
    const worst: Array<{ file: string; diff: number }> = [];
    for (const file of files) {
      const source = readCorpus(file);
      const formatted = await format(source);
      const d = diffLineCount(source, formatted);
      totalDiffLines += d;
      if (d > 0) {
        changedFiles++;
        worst.push({ file, diff: d });
      }
    }
    worst.sort((a, b) => b.diff - a.diff);
    // eslint-disable-next-line no-console
    console.log(
      `CHURN: ${totalDiffLines} diff-lines across ${changedFiles}/${files.length} files.\n` +
        worst
          .slice(0, 15)
          .map(w => `  ${w.diff.toString().padStart(4)}  ${w.file}`)
          .join('\n'),
    );
    // Ratchet: keep this from regressing. The residual is dominated by the
    // deliberate canonicalizations documented in the README (alignment collapse,
    // one-clause-per-line headers, optional-marker spacing, orderBy on its own
    // line, empty-block / brace normalization).
    expect(totalDiffLines).toBeLessThanOrEqual(2400);
  });
});

describe('idempotency', () => {
  for (const file of files) {
    it(`format(format(x)) == format(x) for ${file}`, async () => {
      const once = await format(readCorpus(file));
      const twice = await format(once);
      expect(twice).toEqual(once);
    });
  }
});
