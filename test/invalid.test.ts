import { describe, expect, it } from 'vitest';
import { format } from './format.js';

/**
 * The parser must refuse to format invalid klass rather than silently
 * reformatting a tree-sitter error-recovery tree. `String(30000)` is not valid
 * klass (the real form is `String maxLength(30000)`); tree-sitter recovers it as
 * a minLengthValidation with a MISSING keyword, which we reject as a syntax error.
 */
describe('invalid input is rejected, not reformatted', () => {
  it('throws on a bare Type(number) property', async () => {
    const src = 'package p\nclass A\n{\n    body: String(30000);\n}\n';
    await expect(format(src)).rejects.toThrow(/prettier-plugin-klass: missing/);
  });

  it('throws on unexpected garbage tokens', async () => {
    const src = 'package p\nclass A\n{\n    %%% not klass %%%\n}\n';
    await expect(format(src)).rejects.toThrow(/prettier-plugin-klass/);
  });

  it('still formats the valid maxLength form', async () => {
    const src = 'package p\nclass A\n{\n    body: String maxLength(30000);\n}\n';
    const out = await format(src);
    expect(out).toContain('body: String maxLength(30000);');
  });
});
