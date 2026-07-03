/**
 * Tree-sitter grammar for the Klass DSL.
 *
 * Ported from the authoritative ANTLR4 grammar:
 *   klass-model-converters/klass-grammar/src/main/antlr4/cool/klass/model/meta/grammar/Klass.g4
 *   (with lexer rules from imports/KlassLexerRules.g4 and imports/JavaLexer.g4)
 *
 * Notable adaptations from ANTLR:
 *   - ANTLR error-recovery alternatives that call notifyErrorListeners
 *     ("Missing semi-colon after ...") are dropped; the corpus is valid, so
 *     the terminating ';' is required.
 *   - The left-recursive criteriaExpression is expressed with tree-sitter
 *     prec.left; '&&' binds tighter than '||' to match ANTLR alternative order.
 *   - keywordValidAsIdentifier is modeled as an explicit choice of keyword
 *     strings plus the raw _identifier token.
 */

const PREC = {
  or: 1,
  and: 2,
};

module.exports = grammar({
  name: 'klass',

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment,
  ],

  word: $ => $._identifier,

  conflicts: $ => [
    [$.url, $.urlPathSegment],
  ],

  rules: {
    compilationUnit: $ => seq(
      $.packageDeclaration,
      repeat($.topLevelDeclaration),
    ),

    packageDeclaration: $ => seq('package', $.packageName),

    packageName: $ => sep1($.identifier, '.'),

    topLevelDeclaration: $ => choice(
      $.interfaceDeclaration,
      $.classDeclaration,
      $.enumerationDeclaration,
      $.associationDeclaration,
      $.projectionDeclaration,
      $.serviceGroupDeclaration,
    ),

    // interface
    interfaceDeclaration: $ => seq($.interfaceHeader, $.interfaceBlock),
    interfaceHeader: $ => seq(
      'interface',
      $.identifier,
      optional($.implementsDeclaration),
      repeat($.classifierModifier),
    ),
    interfaceBlock: $ => seq('{', repeat($.interfaceMember), '}'),

    // class
    classDeclaration: $ => seq($.classHeader, $.classBlock),
    classHeader: $ => seq(
      $.classOrUser,
      $.identifier,
      optional($.abstractDeclaration),
      optional($.extendsDeclaration),
      optional($.implementsDeclaration),
      repeat($.classServiceModifier),
      repeat($.classifierModifier),
    ),
    classOrUser: $ => choice('class', 'user'),
    classServiceModifier: $ => seq(
      $.serviceCategoryModifier,
      optional(seq('(', $.projectionReference, ')')),
    ),
    serviceCategoryModifier: $ => choice('read', 'write', 'create', 'update', 'delete'),
    classBlock: $ => seq('{', repeat($.classMember), '}'),

    // inheritance
    abstractDeclaration: $ => 'abstract',
    extendsDeclaration: $ => seq('extends', $.classReference),
    implementsDeclaration: $ => seq('implements', sep1($.interfaceReference, ',')),

    // enumeration
    enumerationDeclaration: $ => seq('enumeration', $.identifier, $.enumerationBlock),
    enumerationBlock: $ => seq('{', repeat($.enumerationLiteral), '}'),
    enumerationLiteral: $ => seq(
      $.identifier,
      optional(seq('(', $.enumerationPrettyName, ')')),
      ',',
    ),
    enumerationPrettyName: $ => $.string_literal,

    // association
    associationDeclaration: $ => seq('association', $.identifier, $.associationBlock),
    associationBlock: $ => seq(
      '{',
      optional($.associationEnd),
      optional($.associationEnd),
      optional($.relationship),
      '}',
    ),
    associationEnd: $ => seq(
      $.identifier,
      ':',
      $.classReference,
      $.multiplicity,
      repeat($.associationEndModifier),
      optional($.orderByDeclaration),
      ';',
    ),
    associationEndSignature: $ => seq(
      $.identifier,
      ':',
      $.classifierReference,
      $.multiplicity,
      repeat($.associationEndModifier),
      ';',
    ),
    relationship: $ => seq('relationship', $.criteriaExpression),

    // projection
    projectionDeclaration: $ => seq(
      'projection',
      $.identifier,
      optional($.parameterDeclarationList),
      'on',
      $.classifierReference,
      $.projectionBlock,
    ),
    projectionBlock: $ => seq('{', repeat($.projectionMember), '}'),
    projectionMember: $ => choice(
      $.projectionPrimitiveMember,
      $.projectionReferenceProperty,
      $.projectionParameterizedProperty,
      $.projectionProjectionReference,
    ),
    projectionPrimitiveMember: $ => seq(
      optional(seq($.classifierReference, '.')),
      $.identifier,
      ':',
      $.header,
      ',',
    ),
    projectionReferenceProperty: $ => seq(
      optional(seq($.classifierReference, '.')),
      $.identifier,
      ':',
      $.projectionBlock,
      ',',
    ),
    projectionProjectionReference: $ => seq(
      optional(seq($.classifierReference, '.')),
      $.identifier,
      ':',
      $.projectionReference,
      ',',
    ),
    projectionParameterizedProperty: $ => seq(
      optional(seq($.classifierReference, '.')),
      $.identifier,
      $.argumentList,
      ':',
      $.projectionBlock,
      ',',
    ),
    header: $ => $.string_literal,

    // service
    serviceGroupDeclaration: $ => seq(
      'service',
      $.identifier,
      'on',
      $.classReference,
      $.serviceGroupBlock,
    ),
    serviceGroupBlock: $ => seq('{', repeat($.urlDeclaration), '}'),
    urlDeclaration: $ => seq($.url, repeat1($.serviceDeclaration)),
    url: $ => seq(
      repeat1($.urlPathSegment),
      optional('/'),
      optional($.queryParameterList),
    ),
    urlPathSegment: $ => seq('/', choice($.urlConstant, $.urlParameterDeclaration)),
    urlConstant: $ => choice($.identifier, $.url_identifier),
    queryParameterList: $ => seq(
      '?',
      $.urlParameterDeclaration,
      repeat(seq('&', $.urlParameterDeclaration)),
    ),
    urlParameterDeclaration: $ => seq('{', $.parameterDeclaration, '}'),

    serviceDeclaration: $ => seq($.verb, $.serviceBlock),
    serviceBlock: $ => seq(
      '{',
      optional($.serviceMultiplicityDeclaration),
      repeat($.serviceCriteriaDeclaration),
      optional($.serviceProjectionDispatch),
      optional($.serviceOrderByDeclaration),
      '}',
    ),
    serviceMultiplicityDeclaration: $ => seq('multiplicity', ':', $.serviceMultiplicity, ';'),
    serviceMultiplicity: $ => choice('one', 'many'),
    serviceCriteriaDeclaration: $ => seq($.serviceCriteriaKeyword, ':', $.criteriaExpression, ';'),
    serviceCriteriaKeyword: $ => choice('criteria', 'authorize', 'validate', 'conflict'),
    serviceProjectionDispatch: $ => seq(
      'projection',
      ':',
      $.projectionReference,
      optional($.argumentList),
      ';',
    ),
    serviceOrderByDeclaration: $ => seq($.orderByDeclaration, ';'),
    verb: $ => choice('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),

    // member
    interfaceMember: $ => choice(
      $.dataTypeProperty,
      $.parameterizedPropertySignature,
      $.associationEndSignature,
    ),
    classMember: $ => choice(
      $.dataTypeProperty,
      $.parameterizedProperty,
      $.associationEndSignature,
    ),
    dataTypeProperty: $ => choice($.primitiveProperty, $.enumerationProperty),
    primitiveProperty: $ => seq(
      $.identifier,
      ':',
      $.primitiveType,
      optional($.optionalMarker),
      repeat($.dataTypePropertyModifier),
      repeat($.dataTypePropertyValidation),
      ';',
    ),
    enumerationProperty: $ => seq(
      $.identifier,
      ':',
      $.enumerationReference,
      optional($.optionalMarker),
      repeat($.dataTypePropertyModifier),
      repeat($.dataTypePropertyValidation),
      ';',
    ),
    parameterizedProperty: $ => seq(
      $.identifier,
      '(',
      optional(sep1($.parameterDeclaration, ',')),
      ')',
      ':',
      $.classReference,
      $.multiplicity,
      repeat($.parameterizedPropertyModifier),
      optional($.orderByDeclaration),
      '{',
      $.criteriaExpression,
      '}',
    ),
    parameterizedPropertySignature: $ => seq(
      $.identifier,
      '(',
      optional(sep1($.parameterDeclaration, ',')),
      ')',
      ':',
      $.classifierReference,
      $.multiplicity,
      repeat($.parameterizedPropertyModifier),
      ';',
    ),
    optionalMarker: $ => '?',

    dataTypePropertyValidation: $ => choice(
      $.minLengthValidation,
      $.maxLengthValidation,
      $.minValidation,
      $.maxValidation,
    ),
    minLengthValidation: $ => seq($.minLengthValidationKeyword, $.integerValidationParameter),
    maxLengthValidation: $ => seq($.maxLengthValidationKeyword, $.integerValidationParameter),
    minValidation: $ => seq($.minValidationKeyword, $.integerValidationParameter),
    maxValidation: $ => seq($.maxValidationKeyword, $.integerValidationParameter),
    integerValidationParameter: $ => seq('(', $.integerLiteral, ')'),
    minLengthValidationKeyword: $ => choice('minLength', 'minimumLength'),
    maxLengthValidationKeyword: $ => choice('maxLength', 'maximumLength'),
    minValidationKeyword: $ => choice('min', 'minimum'),
    maxValidationKeyword: $ => choice('max', 'maximum'),

    // parameter
    parameterDeclaration: $ => choice(
      $.primitiveParameterDeclaration,
      $.enumerationParameterDeclaration,
    ),
    primitiveParameterDeclaration: $ => seq(
      $.identifier,
      ':',
      $.primitiveType,
      $.multiplicity,
      repeat($.parameterModifier),
    ),
    enumerationParameterDeclaration: $ => seq(
      $.identifier,
      ':',
      $.enumerationReference,
      $.multiplicity,
      repeat($.parameterModifier),
    ),
    parameterDeclarationList: $ => seq('(', sep1($.parameterDeclaration, ','), ')'),

    // argument
    argumentList: $ => seq('(', optional(sep1($.argument, ',')), ')'),
    argument: $ => choice(
      $.literal,
      $.literalList,
      $.nativeLiteral,
      $.parameterReference,
    ),

    // multiplicity
    multiplicity: $ => seq('[', $.multiplicityBody, ']'),
    multiplicityBody: $ => seq(
      field('lowerBound', $.integer_literal),
      '..',
      field('upperBound', choice($.integer_literal, '*')),
    ),

    primitiveType: $ => prec(1, choice(
      'Boolean', 'Integer', 'Long', 'Double', 'Float', 'String',
      'Instant', 'LocalDate', 'TemporalInstant', 'TemporalRange',
    )),

    // modifiers
    classifierModifier: $ => choice(
      'systemTemporal', 'validTemporal', 'bitemporal', 'versioned', 'audited', 'transient',
    ),
    dataTypePropertyModifier: $ => choice(
      'key', 'private', 'userId', 'id', 'valid', 'system', 'from', 'to',
      'createdBy', 'createdOn', 'lastUpdatedBy', 'version', 'derived', 'final',
    ),
    associationEndModifier: $ => choice(
      'owned', 'final', 'version', 'private', 'createdBy', 'lastUpdatedBy',
    ),
    parameterizedPropertyModifier: $ => choice('createdBy', 'lastUpdatedBy'),
    parameterModifier: $ => choice('version', 'userId', 'id'),

    // order by
    orderByDeclaration: $ => seq('orderBy', ':', sep1($.orderByMemberReferencePath, ',')),
    orderByMemberReferencePath: $ => seq($.thisMemberReferencePath, optional($.orderByDirection)),
    orderByDirection: $ => choice('ascending', 'descending'),

    // criteria
    criteriaExpression: $ => choice(
      prec.left(PREC.and, seq(
        field('left', $.criteriaExpression),
        '&&',
        field('right', $.criteriaExpression),
      )),
      prec.left(PREC.or, seq(
        field('left', $.criteriaExpression),
        '||',
        field('right', $.criteriaExpression),
      )),
      seq('(', $.criteriaExpression, ')'),
      'all',
      seq(
        field('source', $.expressionValue),
        $.operator,
        field('target', $.expressionValue),
      ),
      seq($.expressionMemberReference, 'equalsEdgePoint'),
      seq('native', '(', $.identifier, ')'),
    ),
    expressionValue: $ => choice(
      $.literal,
      $.literalList,
      $.thisMemberReferencePath,
      $.typeMemberReferencePath,
      $.nativeLiteral,
      $.parameterReference,
    ),
    expressionMemberReference: $ => choice($.thisMemberReferencePath, $.typeMemberReferencePath),
    literalList: $ => seq('(', sep1($.literal, ','), ')'),
    nativeLiteral: $ => prec(1, 'user'),
    operator: $ => choice(
      $.equalityOperator,
      $.inequalityOperator,
      $.inOperator,
      $.stringOperator,
    ),
    equalityOperator: $ => choice('==', '!='),
    inequalityOperator: $ => choice('<', '>', '<=', '>='),
    inOperator: $ => 'in',
    stringOperator: $ => choice('contains', 'startsWith', 'endsWith'),

    // references
    interfaceReference: $ => $.identifier,
    classReference: $ => $.identifier,
    classifierReference: $ => $.identifier,
    enumerationReference: $ => $.identifier,
    projectionReference: $ => $.identifier,
    memberReference: $ => $.identifier,
    associationEndReference: $ => $.identifier,
    parameterReference: $ => $.identifier,

    thisMemberReferencePath: $ => seq(
      'this',
      repeat(seq('.', $.associationEndReference)),
      '.',
      $.memberReference,
    ),
    typeMemberReferencePath: $ => seq(
      $.classReference,
      repeat(seq('.', $.associationEndReference)),
      '.',
      $.memberReference,
    ),

    identifier: $ => choice(
      $._identifier,
      $.keywordValidAsIdentifier,
    ),

    keywordValidAsIdentifier: $ => choice(
      'package',
      'enumeration', 'interface', 'class', 'association', 'projection', 'service', 'user',
      'abstract', 'extends', 'implements',
      'native',
      'relationship',
      'multiplicity', 'orderBy',
      'criteria', 'authorize', 'validate', 'conflict',
      // classifierModifier
      'systemTemporal', 'validTemporal', 'bitemporal', 'versioned', 'audited', 'transient',
      // dataTypePropertyModifier
      'key', 'private', 'userId', 'id', 'valid', 'system', 'from', 'to',
      'createdBy', 'createdOn', 'lastUpdatedBy', 'version', 'derived',
      // associationEndModifier
      'owned', 'final',
      // service verbs
      'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
      // serviceCategoryModifier
      'read', 'write', 'create', 'update', 'delete',
      // inOperator, stringOperator
      'in', 'contains', 'startsWith', 'endsWith',
      // primitiveType
      'Boolean', 'Integer', 'Long', 'Double', 'Float', 'String',
      'Instant', 'LocalDate', 'TemporalInstant', 'TemporalRange',
    ),

    literal: $ => choice(
      $.integerLiteral,
      $.floatingPointLiteral,
      $.booleanLiteral,
      $.characterLiteral,
      $.stringLiteral,
      $.nullLiteral,
    ),
    integerLiteral: $ => $.integer_literal,
    floatingPointLiteral: $ => $.floating_point_literal,
    booleanLiteral: $ => $.boolean_literal,
    characterLiteral: $ => $.character_literal,
    stringLiteral: $ => $.string_literal,
    nullLiteral: $ => 'null',

    // ---- lexer tokens ----

    _identifier: $ => /[a-zA-Z$_][a-zA-Z0-9$_]*/,

    // URL identifiers that contain at least one dash (e.g. /api/user-profile)
    url_identifier: $ => /[a-zA-Z][a-zA-Z0-9_]*-[a-zA-Z0-9_-]*/,

    integer_literal: $ => token(choice(
      /0[xX][0-9a-fA-F_]+[lL]?/,
      /0[bB][01_]+[lL]?/,
      /[0-9][0-9_]*[lL]?/,
    )),

    floating_point_literal: $ => token(choice(
      /[0-9][0-9_]*\.[0-9][0-9_]*([eE][+-]?[0-9]+)?[fFdD]?/,
      /\.[0-9][0-9_]*([eE][+-]?[0-9]+)?[fFdD]?/,
      /[0-9][0-9_]*[eE][+-]?[0-9]+[fFdD]?/,
      /[0-9][0-9_]*[fFdD]/,
    )),

    boolean_literal: $ => choice('true', 'false'),

    character_literal: $ => token(seq(
      "'",
      choice(/[^'\\\r\n]/, /\\[btnfr"'\\]/, /\\[0-3]?[0-7]?[0-7]/, /\\u+[0-9a-fA-F]{4}/),
      "'",
    )),

    string_literal: $ => token(seq(
      '"',
      repeat(choice(/[^"\\\r\n]/, /\\[btnfr"'\\]/, /\\[0-3]?[0-7]?[0-7]/, /\\u+[0-9a-fA-F]{4}/)),
      '"',
    )),

    line_comment: $ => token(seq('//', /[^\r\n]*/)),
    block_comment: $ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),
  },
});

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
