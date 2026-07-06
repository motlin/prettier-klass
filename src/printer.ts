import { type AstPath, type Doc, doc } from 'prettier';
import { childOfType, type KlassNode } from './ast.js';
import { printDanglingComments } from './comments.js';

const { group, indent, join, hardline, line } = doc.builders;

type Print = (path: AstPath<KlassNode>) => Doc;

/**
 * The Klass printer. Klass source is hand-written in a canonical style that the
 * corpus establishes; we reproduce it with minimal churn. The one deliberate
 * canonicalization is that column-alignment padding (multiple spaces used to
 * line up ':' and modifiers across lines) collapses to single spaces, since
 * Prettier does not vertically align.
 */
export function printKlass(path: AstPath<KlassNode>, _options: unknown, print: Print): Doc {
  const node = path.node;
  const printer = PRINTERS[node.type];
  if (printer !== undefined) {
    return printer(path, print);
  }
  // Leaf token: print verbatim.
  if (node.isLeaf) {
    return node.text;
  }
  // Unknown internal node: fall back to concatenating children with spaces.
  return group(join(' ', path.map(print, 'children')));
}

type NodePrinter = (path: AstPath<KlassNode>, print: Print) => Doc;

/** Print all children of a named field or child list by mapping over indices. */
function printChildren(path: AstPath<KlassNode>, print: Print): Doc[] {
  return path.map(print, 'children');
}

/** Text of a leaf-ish node (used where we need the raw token). */
function text(node: KlassNode | undefined): string {
  return node === undefined ? '' : node.text;
}

/**
 * Print a declaration header (class/interface/user): the `head` (keyword + name)
 * followed by zero or more clauses (extends/implements/modifiers). When
 * `forceBreak` is set, or the inline form would overflow printWidth, each clause
 * goes on its own indented continuation line; otherwise all stay inline.
 */
function printHeader(head: Doc, clauses: Doc[], _forceBreak: boolean): Doc {
  if (clauses.length === 0) {
    return head;
  }
  // Corpus-dominant style: every header clause (extends/implements/abstract/
  // service + classifier modifiers) goes on its own indented continuation line.
  // (77 of the corpus's continuation clauses are broken vs 12 kept inline.)
  return [head, indent(clauses.map(c => [hardline, c]))];
}

/**
 * Join a declaration block's members, indented inside braces, preserving a
 * single blank line between members wherever the author left one. Dangling
 * comments (e.g. the sole comment in an otherwise-empty block) are emitted
 * inside the braces so they are never dropped.
 */
function printBlockOf(path: AstPath<KlassNode>, print: Print, memberTypes: string[]): Doc {
  const node = path.node;
  const memberNodes: KlassNode[] = node.children.filter(c => memberTypes.includes(c.type));
  const members = memberNodes.map(m => path.call(print, 'children', node.children.indexOf(m)));
  return assembleBlock(path, print, memberNodes, members);
}

/** Like printBlockOf but with pre-collected member nodes + docs (mixed types). */
function assembleBlock(
  path: AstPath<KlassNode>,
  print: Print,
  memberNodes: KlassNode[],
  members: Doc[],
): Doc {
  const dangling = printDanglingComments(path, print);
  const hasDangling = dangling !== '';
  if (members.length === 0) {
    if (!hasDangling) {
      // Corpus writes empty blocks with the braces on their own lines.
      return ['{', hardline, '}'];
    }
    return ['{', indent([hardline, dangling]), hardline, '}'];
  }
  const body = joinWithBlankLines(memberNodes, members);
  const parts: Doc[] = [body];
  if (hasDangling) {
    parts.push(hardline, dangling);
  }
  return ['{', indent([hardline, parts]), hardline, '}'];
}

/**
 * Join member docs with hardlines, doubling to a blank line wherever the
 * original source had one or more blank lines between two adjacent members.
 * Blank lines are detected from the sibling nodes' source positions.
 */
function joinWithBlankLines(nodes: KlassNode[], docs: Doc[]): Doc {
  const out: Doc[] = [];
  docs.forEach((d, i) => {
    if (i > 0) {
      out.push(hardline);
      if (blankLineBetween(nodes[i - 1], nodes[i])) {
        out.push(hardline);
      }
    }
    out.push(d);
  });
  return out;
}

/**
 * True when the gap between the end of `prev` and the start of `next` spans a
 * blank line in the original source. Uses the global source captured on nodes
 * via their surrounding text: we compare line numbers derived from the shared
 * source that both nodes index into (available on the root through _source).
 */
function blankLineBetween(prev: KlassNode, next: KlassNode): boolean {
  const source = SOURCE.text;
  if (source === '') {
    return false;
  }
  // If `next` carries leading comments, the author's blank line sits before the
  // first of those comments, not before next's code. Measure to that point so a
  // blank line ahead of a leading comment is preserved.
  const nextStart = leadingCommentStart(next);
  const gap = source.slice(prev.endIndex, nextStart);
  // A blank line means two or more newlines with only whitespace between them.
  const newlines = gap.split('\n').length - 1;
  return newlines >= 2;
}

interface WithComments extends KlassNode {
  comments?: Array<KlassNode & { leading?: boolean }>;
}

/** Start index of a node, or of its first leading comment if it has one. */
function leadingCommentStart(node: KlassNode): number {
  const comments = (node as WithComments).comments;
  if (comments === undefined) {
    return node.startIndex;
  }
  let earliest = node.startIndex;
  for (const c of comments) {
    if (c.leading === true && c.startIndex < earliest) {
      earliest = c.startIndex;
    }
  }
  return earliest;
}

/** Module-level handle to the source text of the file currently being printed. */
const SOURCE = { text: '' };

export function setSource(text: string): void {
  SOURCE.text = text;
}

const PRINTERS: Record<string, NodePrinter> = {
  compilationUnit(path, print) {
    const node = path.node;
    // Top-level items in source order: the package declaration, then each
    // top-level declaration. Separate them with blank lines, matching the
    // corpus convention of one blank line between top-level items.
    const topNodes = node.children.filter(
      c => c.type === 'packageDeclaration' || c.type === 'topLevelDeclaration',
    );
    const docs = topNodes.map(t => path.call(print, 'children', node.children.indexOf(t)));
    const parts: Doc[] = [];
    docs.forEach((d, i) => {
      if (i > 0) {
        parts.push(hardline, hardline);
      }
      parts.push(d);
    });
    parts.push(hardline);
    return parts;
  },

  packageDeclaration(path, print) {
    return ['package ', mapChildByType(path, print, 'packageName') ?? ''];
  },

  packageName(path) {
    // dotted identifiers
    return path.node.children.map(c => c.text).join('.');
  },

  topLevelDeclaration(path, print) {
    return printChildren(path, print)[0] ?? '';
  },

  // ---- interface ----
  interfaceDeclaration(path, print) {
    return [
      mapChildByType(path, print, 'interfaceHeader') ?? '',
      hardline,
      mapChildByType(path, print, 'interfaceBlock') ?? '',
    ];
  },
  interfaceHeader(path, print) {
    const node = path.node;
    const head: Doc = ['interface ', text(childOfType(node, 'identifier'))];
    const clauses: Doc[] = [];
    const impl = mapChildByType(path, print, 'implementsDeclaration');
    if (impl !== undefined) {
      clauses.push(impl);
    }
    for (const m of mapChildrenByType(path, print, 'classifierModifier')) {
      clauses.push(m);
    }
    // interfaces never carry abstract/service modifiers, so keep clauses inline
    // unless they overflow printWidth.
    return printHeader(head, clauses, false);
  },
  interfaceBlock(path, print) {
    return printBlockOf(path, print, ['interfaceMember']);
  },

  // ---- class ----
  classDeclaration(path, print) {
    return [
      mapChildByType(path, print, 'classHeader') ?? '',
      hardline,
      mapChildByType(path, print, 'classBlock') ?? '',
    ];
  },
  classHeader(path, print) {
    const node = path.node;
    const classOrUser = text(childOfType(node, 'classOrUser'));
    const id = text(childOfType(node, 'identifier'));
    const head: Doc = [classOrUser, ' ', id];
    const abstractDecl = childOfType(node, 'abstractDeclaration');
    const extendsDecl = mapChildByType(path, print, 'extendsDeclaration');
    const implementsDecl = mapChildByType(path, print, 'implementsDeclaration');
    const serviceModifiers = mapChildrenByType(path, print, 'classServiceModifier');
    const classifierModifiers = mapChildrenByType(path, print, 'classifierModifier');
    const clauses: Doc[] = [];
    if (abstractDecl !== undefined) {
      clauses.push('abstract');
    }
    if (extendsDecl !== undefined) {
      clauses.push(extendsDecl);
    }
    if (implementsDecl !== undefined) {
      clauses.push(implementsDecl);
    }
    for (const m of serviceModifiers) {
      clauses.push(m);
    }
    for (const m of classifierModifiers) {
      clauses.push(m);
    }
    // Corpus convention: headers with `abstract`, `extends`, or a service
    // modifier are always written one-clause-per-line; headers with only
    // `implements` and/or classifier modifiers stay inline unless they overflow.
    const forceBreak =
      abstractDecl !== undefined || extendsDecl !== undefined || serviceModifiers.length > 0;
    return printHeader(head, clauses, forceBreak);
  },
  classOrUser(path) {
    return path.node.text;
  },
  classServiceModifier(path, print) {
    const node = path.node;
    const category = text(childOfType(node, 'serviceCategoryModifier'));
    const projectionRef = mapChildByType(path, print, 'projectionReference');
    if (projectionRef !== undefined) {
      return [category, '(', projectionRef, ')'];
    }
    return category;
  },
  classBlock(path, print) {
    return printBlockOf(path, print, ['classMember']);
  },

  extendsDeclaration(path, print) {
    return ['extends ', mapChildByType(path, print, 'classReference') ?? ''];
  },
  implementsDeclaration(path, print) {
    const refs = mapChildrenByType(path, print, 'interfaceReference');
    return ['implements ', join(', ', refs)];
  },

  // ---- enumeration ----
  enumerationDeclaration(path, print) {
    const node = path.node;
    return [
      'enumeration ',
      text(childOfType(node, 'identifier')),
      hardline,
      mapChildByType(path, print, 'enumerationBlock') ?? '',
    ];
  },
  enumerationBlock(path, print) {
    return printBlockOf(path, print, ['enumerationLiteral']);
  },
  enumerationLiteral(path, print) {
    const node = path.node;
    const id = text(childOfType(node, 'identifier'));
    const pretty = mapChildByType(path, print, 'enumerationPrettyName');
    if (pretty !== undefined) {
      return [id, '(', pretty, '),'];
    }
    return [id, ','];
  },
  enumerationPrettyName(path) {
    return path.node.text;
  },

  // ---- association ----
  associationDeclaration(path, print) {
    const node = path.node;
    return [
      'association ',
      text(childOfType(node, 'identifier')),
      hardline,
      mapChildByType(path, print, 'associationBlock') ?? '',
    ];
  },
  associationBlock(path, print) {
    return printBlockOf(path, print, ['associationEnd', 'relationship']);
  },
  associationEnd(path, print) {
    return printEndLike(path, print, 'classReference');
  },
  associationEndSignature(path, print) {
    return printEndLike(path, print, 'classifierReference');
  },
  relationship(path, print) {
    // The expression starts on the keyword line, so wrap it in one indent level
    // to put broken continuations two levels beyond `relationship`.
    return ['relationship ', indent(mapChildByType(path, print, 'criteriaExpression') ?? '')];
  },

  // ---- projection ----
  projectionDeclaration(path, print) {
    const node = path.node;
    const parts: Doc[] = ['projection ', text(childOfType(node, 'identifier'))];
    const params = mapChildByType(path, print, 'parameterDeclarationList');
    if (params !== undefined) {
      parts.push(params);
    }
    parts.push(' on ', mapChildByType(path, print, 'classifierReference') ?? '');
    parts.push(hardline, mapChildByType(path, print, 'projectionBlock') ?? '');
    return parts;
  },
  projectionBlock(path, print) {
    return printBlockOf(path, print, ['projectionMember']);
  },
  projectionMember(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  projectionPrimitiveMember(path, print) {
    return [projectionMemberHead(path, print), ': ', mapChildByType(path, print, 'header') ?? '', ','];
  },
  projectionProjectionReference(path, print) {
    return [projectionMemberHead(path, print), ': ', mapChildByType(path, print, 'projectionReference') ?? '', ','];
  },
  projectionReferenceProperty(path, print) {
    return [projectionMemberHead(path, print), ': ', mapChildByType(path, print, 'projectionBlock') ?? '', ','];
  },
  projectionParameterizedProperty(path, print) {
    return [
      projectionMemberHead(path, print),
      mapChildByType(path, print, 'argumentList') ?? '',
      ': ',
      mapChildByType(path, print, 'projectionBlock') ?? '',
      ',',
    ];
  },
  header(path) {
    return path.node.text;
  },

  // ---- service ----
  serviceGroupDeclaration(path, print) {
    const node = path.node;
    return [
      'service ',
      text(childOfType(node, 'identifier')),
      ' on ',
      mapChildByType(path, print, 'classReference') ?? '',
      hardline,
      mapChildByType(path, print, 'serviceGroupBlock') ?? '',
    ];
  },
  serviceGroupBlock(path, print) {
    return printBlockOf(path, print, ['urlDeclaration']);
  },
  urlDeclaration(path, print) {
    const url = mapChildByType(path, print, 'url') ?? '';
    const services = mapChildrenByType(path, print, 'serviceDeclaration');
    // Verbs and their blocks are indented one level under the url line.
    return [url, indent([hardline, join(hardline, services)])];
  },
  url(path, print) {
    const node = path.node;
    const segments = mapChildrenByType(path, print, 'urlPathSegment');
    const parts: Doc[] = [...segments];
    // A trailing '/' is preserved only when present in source (rare); the query
    // list, when present, follows immediately.
    const query = mapChildByType(path, print, 'queryParameterList');
    if (query !== undefined) {
      parts.push(query);
    }
    return parts;
  },
  urlPathSegment(path, print) {
    const constant = mapChildByType(path, print, 'urlConstant');
    if (constant !== undefined) {
      return ['/', constant];
    }
    return ['/', mapChildByType(path, print, 'urlParameterDeclaration') ?? ''];
  },
  urlConstant(path) {
    return path.node.text;
  },
  queryParameterList(path, print) {
    const params = mapChildrenByType(path, print, 'urlParameterDeclaration');
    return ['?', join('&', params)];
  },
  urlParameterDeclaration(path, print) {
    return ['{', mapChildByType(path, print, 'parameterDeclaration') ?? '', '}'];
  },
  serviceDeclaration(path, print) {
    const node = path.node;
    return [text(childOfType(node, 'verb')), hardline, mapChildByType(path, print, 'serviceBlock') ?? ''];
  },
  serviceBlock(path, print) {
    return printBlockOf(path, print, [
      'serviceMultiplicityDeclaration',
      'serviceCriteriaDeclaration',
      'serviceProjectionDispatch',
      'serviceOrderByDeclaration',
    ]);
  },
  serviceMultiplicityDeclaration(path, print) {
    const node = path.node;
    return ['multiplicity: ', text(childOfType(node, 'serviceMultiplicity')), ';'];
  },
  serviceMultiplicity(path) {
    return path.node.text;
  },
  serviceCriteriaDeclaration(path, print) {
    const node = path.node;
    // The expression starts on the keyword line; wrap in one indent level so
    // broken continuations land two levels beyond the criteria keyword.
    return [
      text(childOfType(node, 'serviceCriteriaKeyword')),
      ': ',
      indent(mapChildByType(path, print, 'criteriaExpression') ?? ''),
      ';',
    ];
  },
  serviceProjectionDispatch(path, print) {
    const parts: Doc[] = ['projection: ', mapChildByType(path, print, 'projectionReference') ?? ''];
    const args = mapChildByType(path, print, 'argumentList');
    if (args !== undefined) {
      parts.push(args);
    }
    parts.push(';');
    return parts;
  },
  serviceOrderByDeclaration(path, print) {
    return [mapChildByType(path, print, 'orderByDeclaration') ?? '', ';'];
  },

  // ---- members ----
  interfaceMember(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  classMember(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  dataTypeProperty(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  primitiveProperty(path, print) {
    return printPropertyLike(path, print, 'primitiveType');
  },
  enumerationProperty(path, print) {
    return printPropertyLike(path, print, 'enumerationReference');
  },
  parameterizedProperty(path, print) {
    const node = path.node;
    const parts: Doc[] = [
      text(childOfType(node, 'identifier')),
      printParenParams(path, print),
      ': ',
      mapChildByType(path, print, 'classReference') ?? '',
      mapChildByType(path, print, 'multiplicity') ?? '',
    ];
    for (const m of mapChildrenByType(path, print, 'parameterizedPropertyModifier')) {
      parts.push(' ', m);
    }
    const orderBy = mapChildByType(path, print, 'orderByDeclaration');
    if (orderBy !== undefined) {
      parts.push(indent([hardline, orderBy]));
    }
    const criteria = mapChildByType(path, print, 'criteriaExpression');
    parts.push(hardline, '{', indent([hardline, criteria ?? '']), hardline, '}');
    return parts;
  },
  parameterizedPropertySignature(path, print) {
    const node = path.node;
    const parts: Doc[] = [
      text(childOfType(node, 'identifier')),
      printParenParams(path, print),
      ': ',
      mapChildByType(path, print, 'classifierReference') ?? '',
      mapChildByType(path, print, 'multiplicity') ?? '',
    ];
    for (const m of mapChildrenByType(path, print, 'parameterizedPropertyModifier')) {
      parts.push(' ', m);
    }
    parts.push(';');
    return parts;
  },
  optionalMarker() {
    return '?';
  },

  // ---- validations ----
  dataTypePropertyValidation(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  minLengthValidation: printValidation,
  maxLengthValidation: printValidation,
  minValidation: printValidation,
  maxValidation: printValidation,
  integerValidationParameter(path, print) {
    const node = path.node;
    return ['(', text(childOfType(node, 'integerLiteral')), ')'];
  },

  // ---- parameters ----
  parameterDeclaration(path, print) {
    return printChildren(path, print)[0] ?? '';
  },
  primitiveParameterDeclaration(path, print) {
    return printParamLike(path, print, 'primitiveType');
  },
  enumerationParameterDeclaration(path, print) {
    return printParamLike(path, print, 'enumerationReference');
  },
  parameterDeclarationList(path, print) {
    const params = mapChildrenByType(path, print, 'parameterDeclaration');
    return ['(', join(', ', params), ')'];
  },

  // ---- multiplicity ----
  multiplicity(path, print) {
    return ['[', mapChildByType(path, print, 'multiplicityBody') ?? '', ']'];
  },
  multiplicityBody(path) {
    const node = path.node;
    const lower = node.fields['lowerBound'];
    const upper = node.fields['upperBound'];
    return [text(lower), '..', text(upper)];
  },

  // ---- order by ----
  orderByDeclaration(path, print) {
    const paths = mapChildrenByType(path, print, 'orderByMemberReferencePath');
    return ['orderBy: ', join(', ', paths)];
  },
  orderByMemberReferencePath(path, print) {
    const node = path.node;
    const ref = mapChildByType(path, print, 'thisMemberReferencePath') ?? '';
    const dir = childOfType(node, 'orderByDirection');
    if (dir !== undefined) {
      return [ref, ' ', dir.text];
    }
    return ref;
  },

  // ---- references (all just identifiers) ----
  interfaceReference: refPrinter,
  classReference: refPrinter,
  classifierReference: refPrinter,
  enumerationReference: refPrinter,
  projectionReference: refPrinter,
  memberReference: refPrinter,
  associationEndReference: refPrinter,
  parameterReference: refPrinter,

  identifier(path) {
    return path.node.text;
  },
  keywordValidAsIdentifier(path) {
    return path.node.text;
  },

  thisMemberReferencePath(path) {
    return path.node.text;
  },
  typeMemberReferencePath(path) {
    return path.node.text;
  },
};

// ---- shared helpers used by multiple node printers ----

function refPrinter(path: AstPath<KlassNode>): Doc {
  return path.node.text;
}

function projectionMemberHead(path: AstPath<KlassNode>, print: Print): Doc {
  const node = path.node;
  const qualifier = childOfType(node, 'classifierReference');
  const id = text(childOfType(node, 'identifier'));
  if (qualifier !== undefined) {
    return [qualifier.text, '.', id];
  }
  return id;
}

function printValidation(path: AstPath<KlassNode>, print: Print): Doc {
  const node = path.node;
  const keyword = node.children.find(c => c.type.endsWith('Keyword'));
  const param = mapChildByType(path, print, 'integerValidationParameter') ?? '';
  return [text(keyword), param];
}

function printPropertyLike(path: AstPath<KlassNode>, print: Print, typeField: string): Doc {
  const node = path.node;
  const parts: Doc[] = [
    text(childOfType(node, 'identifier')),
    ': ',
    mapChildByType(path, print, typeField) ?? '',
  ];
  if (childOfType(node, 'optionalMarker') !== undefined) {
    parts.push('?');
  }
  for (const m of mapChildrenByType(path, print, 'dataTypePropertyModifier')) {
    parts.push(' ', m);
  }
  for (const v of mapChildrenByType(path, print, 'dataTypePropertyValidation')) {
    parts.push(' ', v);
  }
  parts.push(';');
  return parts;
}

function printParamLike(path: AstPath<KlassNode>, print: Print, typeField: string): Doc {
  const node = path.node;
  const parts: Doc[] = [
    text(childOfType(node, 'identifier')),
    ': ',
    mapChildByType(path, print, typeField) ?? '',
    mapChildByType(path, print, 'multiplicity') ?? '',
  ];
  for (const m of mapChildrenByType(path, print, 'parameterModifier')) {
    parts.push(' ', m);
  }
  return parts;
}

function printEndLike(path: AstPath<KlassNode>, print: Print, refType: string): Doc {
  const node = path.node;
  const parts: Doc[] = [
    text(childOfType(node, 'identifier')),
    ': ',
    mapChildByType(path, print, refType) ?? '',
    mapChildByType(path, print, 'multiplicity') ?? '',
  ];
  for (const m of mapChildrenByType(path, print, 'associationEndModifier')) {
    parts.push(' ', m);
  }
  const orderBy = mapChildByType(path, print, 'orderByDeclaration');
  if (orderBy !== undefined) {
    parts.push(indent([hardline, orderBy]));
  }
  parts.push(';');
  return parts;
}

function printParenParams(path: AstPath<KlassNode>, print: Print): Doc {
  const params = mapChildrenByType(path, print, 'parameterDeclaration');
  return ['(', join(', ', params), ')'];
}

/**
 * Map over the children that are of a given type, returning their printed Docs.
 * Uses index-based path.call so comment attachment on each child is preserved.
 */
function mapChildrenByType(path: AstPath<KlassNode>, print: Print, type: string): Doc[] {
  const node = path.node;
  const docs: Doc[] = [];
  node.children.forEach((child, index) => {
    if (child.type === type) {
      docs.push(path.call(print, 'children', index));
    }
  });
  return docs;
}

/** Print the first child of a given type, preserving its path for comments. */
function mapChildByType(path: AstPath<KlassNode>, print: Print, type: string): Doc | undefined {
  const node = path.node;
  const index = node.children.findIndex(c => c.type === type);
  if (index === -1) {
    return undefined;
  }
  return path.call(print, 'children', index);
}

// criteria expressions are printed in a dedicated module (added in B3+).
import { printCriteria } from './criteria.js';
Object.assign(PRINTERS, printCriteria());
