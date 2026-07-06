import { type AstPath, type Doc, doc } from 'prettier';
import { childOfType, type KlassNode } from './ast.js';

const { group, indent, line, softline } = doc.builders;

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
        const op = binaryOperatorText(node);
        const leftDoc = mapField(path, print, 'left');
        const rightDoc = mapField(path, print, 'right');
        return group([leftDoc, indent([line, op, ' ', rightDoc])]);
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
