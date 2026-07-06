import type { Node as TSNode } from 'web-tree-sitter';

/**
 * A plain-object AST converted from the tree-sitter tree. Prettier's AstPath /
 * comment machinery works far more naturally over plain objects with array
 * children than over tree-sitter's method-based SyntaxNode API, so parse()
 * walks the tree-sitter tree once and produces these.
 */
export interface KlassNode {
  type: string;
  /** Full source text of the node (used for leaf tokens and fallbacks). */
  text: string;
  startIndex: number;
  endIndex: number;
  /** Named + anonymous meaningful children, in source order (comments excluded). */
  children: KlassNode[];
  /** Field name -> child (single-valued fields only), when the grammar names it. */
  fields: Record<string, KlassNode>;
  /** true for leaf tokens we print verbatim (no named children). */
  isLeaf: boolean;
  /** Comments Prettier attaches to this node; populated by Prettier, not us. */
  comments?: unknown[];
}

export interface KlassComment extends KlassNode {
  type: 'line_comment' | 'block_comment';
  value: string;
}

const COMMENT_TYPES = new Set(['line_comment', 'block_comment']);

export function isComment(node: KlassNode): node is KlassComment {
  return COMMENT_TYPES.has(node.type);
}

/**
 * Convert a tree-sitter node into a KlassNode. Comments (grammar `extras`) are
 * collected into `commentSink` rather than embedded as children, so the printer
 * sees a clean structural tree and Prettier attaches comments by position.
 */
export function convert(tsNode: TSNode, commentSink: KlassComment[]): KlassNode {
  const node: KlassNode = {
    type: tsNode.type,
    text: tsNode.text,
    startIndex: tsNode.startIndex,
    endIndex: tsNode.endIndex,
    children: [],
    fields: {},
    isLeaf: false,
  };

  // Walk child positions. Named children become structural `children` (the
  // printer navigates by grammar-rule type). Anonymous tokens (punctuation like
  // '{', ':', ',', or the '*' upper bound) are dropped from `children` but still
  // captured as fields when the grammar names the position, so field lookups
  // like multiplicityBody.upperBound='*' still work. Keeping punctuation out of
  // `children` is what lets Prettier attach dangling comments to empty blocks.
  for (let i = 0; i < tsNode.childCount; i++) {
    const child = tsNode.child(i);
    if (child === null) {
      continue;
    }
    if (COMMENT_TYPES.has(child.type)) {
      commentSink.push(makeComment(child));
      continue;
    }
    const fieldName = tsNode.fieldNameForChild(i);
    const converted = convert(child, commentSink);
    if (child.isNamed) {
      node.children.push(converted);
    }
    if (fieldName !== null && node.fields[fieldName] === undefined) {
      node.fields[fieldName] = converted;
    }
  }

  node.isLeaf = tsNode.namedChildCount === 0;
  return node;
}

function makeComment(tsNode: TSNode): KlassComment {
  return {
    type: tsNode.type as KlassComment['type'],
    text: tsNode.text,
    value: tsNode.text,
    startIndex: tsNode.startIndex,
    endIndex: tsNode.endIndex,
    children: [],
    fields: {},
    isLeaf: true,
  };
}

/** Find the first direct child of a given type. */
export function childOfType(node: KlassNode, type: string): KlassNode | undefined {
  return node.children.find(c => c.type === type);
}

/** All direct children of a given type. */
export function childrenOfType(node: KlassNode, type: string): KlassNode[] {
  return node.children.filter(c => c.type === type);
}
