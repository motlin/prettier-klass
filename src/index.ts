import type { Parser as PrettierParser, Printer, SupportLanguage } from 'prettier';
import type { Node as TSNode } from 'web-tree-sitter';
import { convert, type KlassComment, type KlassNode } from './ast.js';
import { getParser } from './parser-loader.js';
import { printKlass, setSource } from './printer.js';
import { canAttachComment, handleComments, printComment } from './comments.js';

const AST_FORMAT = 'klass-ast';

/** First ERROR or MISSING node in the tree, or null if the parse is clean. */
function firstErrorNode(node: TSNode): TSNode | null {
  if (node.isError || node.isMissing) return node;
  if (!node.hasError) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child === null) continue;
    const bad = firstErrorNode(child);
    if (bad !== null) return bad;
  }
  return null;
}

export const languages: SupportLanguage[] = [
  {
    name: 'Klass',
    parsers: ['klass'],
    extensions: ['.klass'],
    // Aliases let Prettier's markdown printer resolve ```klass fences to this
    // parser (it matches the fence info string against name/aliases/extensions),
    // so embedded klass blocks are formatted automatically.
    aliases: ['klass'],
    vscodeLanguageIds: ['klass'],
  },
];

interface KlassRoot extends KlassNode {
  comments: KlassComment[];
}

export const parsers: Record<string, PrettierParser<KlassNode>> = {
  klass: {
    astFormat: AST_FORMAT,
    async parse(text: string): Promise<KlassRoot> {
      const parser = await getParser();
      const tree = parser.parse(text);
      if (tree === null) {
        throw new Error('prettier-plugin-klass: tree-sitter returned no tree');
      }
      // Refuse to format invalid input. tree-sitter error-recovers (inserting
      // MISSING tokens or wrapping unexpected input in ERROR nodes), which would
      // otherwise let us silently reformat malformed klass — e.g. `String(30000)`
      // recovers to a minLengthValidation with a MISSING keyword. Surface a
      // syntax error at the first bad node instead.
      const bad = firstErrorNode(tree.rootNode);
      if (bad !== null) {
        const { row, column } = bad.startPosition;
        const kind = bad.isMissing ? `missing ${bad.type}` : 'unexpected syntax';
        const err = new SyntaxError(
          `prettier-plugin-klass: ${kind} at ${row + 1}:${column + 1}`,
        );
        (err as unknown as { loc: unknown }).loc = {
          start: { line: row + 1, column: column + 1 },
        };
        throw err;
      }
      const comments: KlassComment[] = [];
      const root = convert(tree.rootNode, comments) as KlassRoot;
      // Prettier reads comments off the root and attaches them by position.
      root.comments = comments;
      // The printer consults the raw source to preserve author blank lines.
      setSource(text);
      return root;
    },
    locStart: (node: KlassNode) => node.startIndex,
    locEnd: (node: KlassNode) => node.endIndex,
  },
};

export const printers: Record<string, Printer<KlassNode>> = {
  [AST_FORMAT]: {
    print: printKlass,
    printComment,
    canAttachComment,
    handleComments,
    getCommentChildNodes(node: KlassNode) {
      return node.children;
    },
  },
};

export const defaultOptions = {
  tabWidth: 4,
  useTabs: true,
  printWidth: 120,
};
