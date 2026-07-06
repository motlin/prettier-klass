import type { Parser as PrettierParser, Printer, SupportLanguage } from 'prettier';
import { convert, type KlassComment, type KlassNode } from './ast.js';
import { getParser } from './parser-loader.js';
import { printKlass, setSource } from './printer.js';
import { canAttachComment, handleComments, printComment } from './comments.js';

const AST_FORMAT = 'klass-ast';

export const languages: SupportLanguage[] = [
  {
    name: 'Klass',
    parsers: ['klass'],
    extensions: ['.klass'],
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
