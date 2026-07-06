import { type AstPath, type Doc, doc } from 'prettier';
import { isComment, type KlassNode } from './ast.js';

const { hardline, join } = doc.builders;

interface AttachedComment extends KlassNode {
  leading?: boolean;
  trailing?: boolean;
  printed?: boolean;
}

type Print = (path: AstPath<KlassNode>) => Doc;

/**
 * Print the dangling comments of a node: those Prettier attached but marked
 * neither leading nor trailing (e.g. the sole comment inside an empty block).
 * Prettier will not emit these automatically, so container printers must.
 */
export function printDanglingComments(path: AstPath<KlassNode>, print: Print): Doc {
  const node = path.node;
  const comments = (node.comments ?? []) as AttachedComment[];
  const dangling = comments.filter(c => c.leading !== true && c.trailing !== true);
  if (dangling.length === 0) {
    return '';
  }
  const docs: Doc[] = [];
  path.each(commentPath => {
    const comment = commentPath.node as AttachedComment;
    if (comment.leading !== true && comment.trailing !== true) {
      comment.printed = true;
      docs.push(print(commentPath as AstPath<KlassNode>));
    }
  }, 'comments');
  return join(hardline, docs);
}

/**
 * Comment handling. Comments were split out of the structural tree during parse
 * and handed to Prettier via root.comments; Prettier then attaches each one to
 * a nearby node as leading/trailing/dangling based on position. These callbacks
 * tune that attachment and render the comment text.
 */

export function printComment(path: AstPath<KlassNode>): Doc {
  const node = path.node;
  if (node.type === 'line_comment') {
    // Trim only trailing whitespace; keep the author's inner spacing.
    return node.text.replace(/\s+$/, '');
  }
  // block_comment: emit verbatim so ASCII art / TODO blocks survive untouched.
  return node.text;
}

export function canAttachComment(node: KlassNode): boolean {
  return !isComment(node);
}

/**
 * We let Prettier's default attachment algorithm run for the ownLine / endOfLine
 * / remaining cases. Returning false from each means "not handled, use default".
 */
export const handleComments = {
  ownLine(): boolean {
    return false;
  },
  endOfLine(): boolean {
    return false;
  },
  remaining(): boolean {
    return false;
  },
};
