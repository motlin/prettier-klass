import { type AstPath, type Doc, doc } from 'prettier';
import { childOfType, type KlassNode } from './ast.js';

const { group, indent, line, softline, hardline } = doc.builders;

type Print = (path: AstPath<KlassNode>) => Doc;
type NodePrinter = (path: AstPath<KlassNode>, print: Print) => Doc;

/**
 * Criteria / expression printers. The corpus writes boolean chains one operator
 * per continuation line, with the operator leading the wrapped line and the
 * continuation indented under the expression, e.g.
 *
 *     this.id == Answer.questionId
 *         && Answer.body contains substring
 *
 * We model each binary level with a `line` so a group breaks onto continuation
 * lines when it exceeds printWidth, and stays inline when it fits.
 */
export function printCriteria(): Record<string, NodePrinter> {
  return {
    criteriaExpression(path, print) {
      const node = path.node;

      // Binary: left OP right  (OP is '&&' or '||')
      const left = node.fields['left'];
      const right = node.fields['right'];
      if (left !== undefined && right !== undefined) {
        // Corpus convention: multi-clause boolean chains break each operator
        // onto its own continuation line even when they would fit inline (47 of
        // 73 corpus continuations fit but are still broken). A left-associative
        // run of the SAME operator is flattened so every continuation sits at
        // the same indent (two levels beyond the enclosing statement) rather
        // than stair-stepping. The operator leads each wrapped line.
        const op = binaryOperatorText(node);
        const operands = flattenChain(node, op);
        const first = printOperandAt(path, print, operands[0]);
        const rest = operands.slice(1).map(o => [hardline, op, ' ', printOperandAt(path, print, o)]);
        // One indent level here. Statement contexts whose expression begins at
        // the keyword column (relationship, service criteria) add a second
        // wrapping level; braced parameterized-property criteria already carry
        // one level from the block, so they need no extra. Net: continuations
        // land two levels beyond the enclosing statement's base indent.
        return [first, indent(rest)];
      }

      // Grouped: ( expr )
      const inner = childOfType(node, 'criteriaExpression');
      if (inner !== undefined && node.text.trimStart().startsWith('(')) {
        return ['(', mapChild(path, print, 'criteriaExpression') ?? '', ')'];
      }

      // all
      if (node.text.trim() === 'all') {
        return 'all';
      }

      // native ( identifier )
      if (node.text.trimStart().startsWith('native')) {
        const id = childOfType(node, 'identifier');
        if (id !== undefined) {
          return ['native(', id.text, ')'];
        }
      }

      // edge point: <memberRef> equalsEdgePoint
      const edgeRef = childOfType(node, 'expressionMemberReference');
      if (edgeRef !== undefined) {
        return [mapChild(path, print, 'expressionMemberReference') ?? '', ' equalsEdgePoint'];
      }

      // operator form: source OP target
      const source = node.fields['source'];
      const target = node.fields['target'];
      const operator = childOfType(node, 'operator');
      if (source !== undefined && operator !== undefined && target !== undefined) {
        return [
          mapField(path, print, 'source'),
          ' ',
          operator.text,
          ' ',
          mapField(path, print, 'target'),
        ];
      }

      // Fallback: single child (e.g. lone expressionValue) or raw text.
      const only = mapChild(path, print, 'criteriaExpression');
      if (only !== undefined) {
        return only;
      }
      return node.text;
    },

    expressionValue(path) {
      // literals, member paths, native user, parameter refs — all print verbatim.
      return path.node.text;
    },
    expressionMemberReference(path) {
      return path.node.text;
    },
    literalList(path) {
      return path.node.text;
    },
    literal(path) {
      return path.node.text;
    },
    nativeLiteral(path) {
      return path.node.text;
    },
    operator(path) {
      return path.node.text;
    },
    argumentList(path, print) {
      const node = path.node;
      const args = node.children.filter(c => c.type === 'argument');
      const docs = args.map(
        (_c, i) => path.call(print, 'children', node.children.indexOf(args[i])),
      );
      if (docs.length === 0) {
        return '()';
      }
      return group(['(', indent([softline, joinCommas(docs)]), softline, ')']);
    },
    argument(path) {
      return path.node.text;
    },
  };
}

/**
 * Flatten a left-associative run of the same boolean operator into its operand
 * nodes, in source order. `a && b && c` parses as `((a && b) && c)`; this
 * returns [a, b, c] so all continuations render at a single indent level.
 * Each returned entry is a path recipe: the list of field names to descend from
 * `root` to reach the operand.
 */
function flattenChain(root: KlassNode, op: '&&' | '||'): Array<string[]> {
  const operands: Array<string[]> = [];
  const descend = (node: KlassNode, prefix: string[]): void => {
    const left = node.fields['left'];
    const right = node.fields['right'];
    if (
      left !== undefined &&
      right !== undefined &&
      node.type === 'criteriaExpression' &&
      binaryOperatorText(node) === op
    ) {
      descend(left, [...prefix, 'left']);
      operands.push([...prefix, 'right']);
    } else {
      operands.push(prefix);
    }
  };
  descend(root, []);
  return operands;
}

/** Print an operand reached by descending `fieldPath` from the current node. */
function printOperandAt(path: AstPath<KlassNode>, print: Print, fieldPath: string[]): Doc {
  if (fieldPath.length === 0) {
    // The root chain node itself is the operand (single, non-chained case).
    return print(path);
  }
  return callFieldPath(path, print, fieldPath);
}

/** Recursively call print by descending a chain of field-name/children indices. */
function callFieldPath(path: AstPath<KlassNode>, print: Print, fieldPath: string[]): Doc {
  const node = path.node;
  const field = fieldPath[0];
  const target = node.fields[field];
  if (target === undefined) {
    return '';
  }
  const index = node.children.indexOf(target);
  if (index === -1) {
    return target.text;
  }
  if (fieldPath.length === 1) {
    return path.call(print, 'children', index);
  }
  return path.call(p => callFieldPath(p as AstPath<KlassNode>, print, fieldPath.slice(1)), 'children', index);
}

function joinCommas(docs: Doc[]): Doc {
  const out: Doc[] = [];
  docs.forEach((d, i) => {
    if (i > 0) {
      out.push(',', line);
    }
    out.push(d);
  });
  return out;
}

function binaryOperatorText(node: KlassNode): '&&' | '||' {
  // The operator token sits between the left and right criteriaExpression. Read
  // it from the source slice between them so nested mixed operators stay correct.
  const left = node.fields['left'];
  const right = node.fields['right'];
  if (left !== undefined && right !== undefined) {
    const between = node.text.slice(left.endIndex - node.startIndex, right.startIndex - node.startIndex);
    if (between.includes('||')) {
      return '||';
    }
    if (between.includes('&&')) {
      return '&&';
    }
  }
  return '&&';
}

function mapField(path: AstPath<KlassNode>, print: Print, field: 'left' | 'right' | 'source' | 'target'): Doc {
  const node = path.node;
  const target = node.fields[field];
  if (target === undefined) {
    return '';
  }
  const index = node.children.indexOf(target);
  if (index === -1) {
    return target.text;
  }
  return path.call(print, 'children', index);
}

function mapChild(path: AstPath<KlassNode>, print: Print, type: string): Doc | undefined {
  const node = path.node;
  const index = node.children.findIndex(c => c.type === type);
  if (index === -1) {
    return undefined;
  }
  return path.call(print, 'children', index);
}
