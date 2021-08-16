import sortedIndexBy from "lodash/sortedIndexBy"
import sortedLastIndexBy from "lodash/sortedLastIndexBy"
import {
    ESLintExpression,
    ParseError,
    Reference,
    Token,
    VAttribute,
    VDirective,
    VDirectiveKey,
    VDocumentFragment,
    VElement,
    VExpressionContainer,
    VFilterSequenceExpression,
    VForExpression,
    VIdentifier,
    VLiteral,
    VNode,
    VOnExpression,
    VSlotScopeExpression,
    ESLintExtendedProgram,
    traverseNodes,
    LocationRange,
} from "../ast"
import { debug } from "../common/debug"
import { LocationCalculator } from "../common/location-calculator"
import {
    ExpressionParseResult,
    parseExpressionBody,
    parseExpression,
    parseVForExpression,
    parseVOnExpression,
    parseSlotScopeExpression,
} from "../script"

const shorthandSign = /^[.:@#]/u
const shorthandNameMap = {
    ":": "bind",
    ".": "bind",
    "@": "on",
    "#": "slot",
    "on-": "on",
}
const invalidDynamicArgumentNextChar = /^[\s\r\n=/>]$/u

/**
 * Get the belonging document of the given node.
 * @param leafNode The node to get.
 * @returns The belonging document.
 */
function getOwnerDocument(leafNode: VNode): VDocumentFragment | null {
    let node: VNode | null = leafNode
    while (node != null && node.type !== "VDocumentFragment") {
        node = node.parent
    }
    return node
}

/**
 * Create a simple token.
 * @param type The type of new token.
 * @param start The offset of the start position of new token.
 * @param end The offset of the end position of new token.
 * @param value The value of new token.
 * @returns The new token.
 */
function createSimpleToken(
    type: string,
    start: number,
    end: number,
    value: string,
    globalLocationCalculator: LocationCalculator,
): Token {
    return {
        type,
        range: [start, end],
        loc: {
            start: globalLocationCalculator.getLocation(start),
            end: globalLocationCalculator.getLocation(end),
        },
        value,
    }
}

/**
 * Parse the given attribute name as a directive key.
 * @param node The identifier node to parse.
 * @param document The document to add parsing errors.
 * @returns The directive key node.
 */
function parseDirectiveKeyStatically(
    node: VIdentifier,
    document: VDocumentFragment | null,
): VDirectiveKey {
    const {
        name: text,
        rawName: rawText,
        range: [offset],
        loc: {
            start: { column, line },
        },
    } = node
    const directiveKey: VDirectiveKey = {
        type: "VDirectiveKey",
        range: node.range,
        loc: node.loc,
        parent: node.parent as any,
        name: null as any,
        argument: null as VIdentifier | null,
        modifiers: [] as VIdentifier[],
    }
    let i = 0

    function createIdentifier(
        start: number,
        end: number,
        name?: string,
    ): VIdentifier {
        return {
            type: "VIdentifier",
            parent: directiveKey,
            range: [offset + start, offset + end],
            loc: {
                start: { column: column + start, line },
                end: { column: column + end, line },
            },
            name: name || text.slice(start, end),
            rawName: rawText.slice(start, end),
        }
    }

    // Parse.
    if (shorthandSign.test(text) || text.includes("on-")) {
        if (text.includes("on-")) {
            const sign = "on-"
            directiveKey.name = createIdentifier(0, 3, shorthandNameMap[sign])
            i = 3
        } else {
            const sign = text[0] as ":" | "." | "@" | "#"
            directiveKey.name = createIdentifier(0, 1, shorthandNameMap[sign])
            i = 1
        }
    } else {
        const colon = text.indexOf(":")
        if (colon !== -1) {
            directiveKey.name = createIdentifier(0, colon)
            i = colon + 1
        }
    }

    if (directiveKey.name != null && text[i] === "[") {
        // Dynamic argument.
        const len = text.slice(i).lastIndexOf("]")
        if (len !== -1) {
            directiveKey.argument = createIdentifier(i, i + len + 1)
            i = i + len + 1 + (text[i + len + 1] === "." ? 1 : 0)
        }
    }

    const modifiers = text
        .slice(i)
        .split(".")
        .map(modifierName => {
            const modifier = createIdentifier(i, i + modifierName.length)
            if (modifierName === "" && i < text.length) {
                insertError(
                    document,
                    new ParseError(
                        `Unexpected token '${text[i]}'`,
                        undefined,
                        offset + i,
                        line,
                        column + i,
                    ),
                )
            }
            i += modifierName.length + 1
            return modifier
        })

    if (directiveKey.name == null) {
        directiveKey.name = modifiers.shift()!
    } else if (directiveKey.argument == null && modifiers[0].name !== "") {
        directiveKey.argument = modifiers.shift() || null
    }
    directiveKey.modifiers = modifiers.filter(isNotEmptyModifier)

    if (directiveKey.name.name === "s-") {
        insertError(
            document,
            new ParseError(
                `Unexpected token '${
                    text[directiveKey.name.range[1] - offset]
                }'`,
                undefined,
                directiveKey.name.range[1],
                directiveKey.name.loc.end.line,
                directiveKey.name.loc.end.column,
            ),
        )
    }

    // s-bind.prop shorthand
    if (
        directiveKey.name.rawName === "." &&
        !directiveKey.modifiers.some(isPropModifier)
    ) {
        const pos =
            (directiveKey.argument || directiveKey.name).range[1] - offset
        const propModifier = createIdentifier(pos, pos, "prop")
        directiveKey.modifiers.unshift(propModifier)
    }

    return directiveKey
}

/**
 * Check whether a given identifier node is `prop` or not.
 * @param node The identifier node to check.
 */
function isPropModifier(node: VIdentifier): boolean {
    return node.name === "prop"
}

/**
 * Check whether a given identifier node is empty or not.
 * @param node The identifier node to check.
 */
function isNotEmptyModifier(node: VIdentifier): boolean {
    return node.name !== ""
}

/**
 * Parse the tokens of a given key node.
 * @param node The key node to parse.
 */
function parseDirectiveKeyTokens(node: VDirectiveKey): Token[] {
    const { name, argument, modifiers } = node
    let shorthand = name.range[1] - name.range[0] === 1
    if (name.rawName === "on-") {
        shorthand = name.range[1] - name.range[0] === 3
    }
    const tokens: Token[] = []

    if (shorthand) {
        tokens.push({
            type: "Punctuator",
            range: name.range,
            loc: name.loc,
            value: name.rawName,
        })
    } else {
        tokens.push({
            type: "HTMLIdentifier",
            range: name.range,
            loc: name.loc,
            value: name.rawName,
        })

        if (argument) {
            tokens.push({
                type: "Punctuator",
                range: [name.range[1], argument.range[0]],
                loc: { start: name.loc.end, end: argument.loc.start },
                value: ":",
            })
        }
    }

    if (argument) {
        tokens.push({
            type: "HTMLIdentifier",
            range: argument.range,
            loc: argument.loc,
            value: (argument as VIdentifier).rawName,
        })
    }

    let lastNode = (argument as VIdentifier | null) || name
    for (const modifier of modifiers) {
        if (modifier.rawName === "") {
            continue
        }

        tokens.push(
            {
                type: "Punctuator",
                range: [lastNode.range[1], modifier.range[0]],
                loc: { start: lastNode.loc.end, end: modifier.loc.start },
                value: ".",
            },
            {
                type: "HTMLIdentifier",
                range: modifier.range,
                loc: modifier.loc,
                value: modifier.rawName,
            },
        )
        lastNode = modifier
    }

    return tokens
}

/**
 * Convert `node.argument` property to a `VExpressionContainer` node if it's a dynamic argument.
 * @param text The source code text of the directive key node.
 * @param node The directive key node to convert.
 * @param document The belonging document node.
 * @param parserOptions The parser options to parse.
 * @param locationCalculator The location calculator to parse.
 */
function convertDynamicArgument(
    node: VDirectiveKey,
    document: VDocumentFragment | null,
    parserOptions: any,
    locationCalculator: LocationCalculator,
): void {
    const { argument } = node
    if (
        !(
            argument != null &&
            argument.type === "VIdentifier" &&
            argument.name.startsWith("[") &&
            argument.name.endsWith("]")
        )
    ) {
        return
    }

    const { rawName, range, loc } = argument
    try {
        const { comments, expression, references, tokens } = parseExpression(
            rawName.slice(1, -1),
            locationCalculator.getSubCalculatorAfter(range[0] + 1),
            parserOptions,
        )

        node.argument = {
            type: "VExpressionContainer",
            range,
            loc,
            parent: node,
            expression,
            references,
        }

        if (expression != null) {
            expression.parent = node.argument
        }

        // Add tokens of `[` and `]`.
        tokens.unshift(
            createSimpleToken(
                "Punctuator",
                range[0],
                range[0] + 1,
                "[",
                locationCalculator,
            ),
        )
        tokens.push(
            createSimpleToken(
                "Punctuator",
                range[1] - 1,
                range[1],
                "]",
                locationCalculator,
            ),
        )

        replaceTokens(document, node.argument, tokens)
        insertComments(document, comments)
    } catch (error) {
        debug("[template] Parse error: %s", error)

        if (ParseError.isParseError(error)) {
            node.argument = {
                type: "VExpressionContainer",
                range,
                loc,
                parent: node,
                expression: null,
                references: [],
            }
            insertError(document, error)
        } else {
            throw error
        }
    }
}

/**
 * Parse the given attribute name as a directive key.
 * @param node The identifier node to parse.
 * @returns The directive key node.
 */
function createDirectiveKey(
    node: VIdentifier,
    document: VDocumentFragment | null,
    parserOptions: any,
    locationCalculator: LocationCalculator,
): VDirectiveKey {
    // Parse node and tokens.
    const directiveKey = parseDirectiveKeyStatically(node, document)
    const tokens = parseDirectiveKeyTokens(directiveKey)
    replaceTokens(document, directiveKey, tokens)

    // Drop `s-` prefix.
    if (directiveKey.name.name.startsWith("s-")) {
        directiveKey.name.name = directiveKey.name.name.slice(2)
    }
    if (directiveKey.name.rawName.startsWith("s-")) {
        directiveKey.name.rawName = directiveKey.name.rawName.slice(2)
    }

    // Parse dynamic argument.
    convertDynamicArgument(
        directiveKey,
        document,
        parserOptions,
        locationCalculator,
    )

    return directiveKey
}

interface HasRange {
    range: [number, number]
}

/**
 * Get `x.range[0]`.
 * @param x The object to get.
 * @returns `x.range[0]`.
 */
function byRange0(x: HasRange): number {
    return x.range[0]
}

/**
 * Get `x.range[1]`.
 * @param x The object to get.
 * @returns `x.range[1]`.
 */
function byRange1(x: HasRange): number {
    return x.range[1]
}

/**
 * Get `x.pos`.
 * @param x The object to get.
 * @returns `x.pos`.
 */
function byIndex(x: ParseError): number {
    return x.index
}

/**
 * Replace the tokens in the given range.
 * @param document The document that the node is belonging to.
 * @param node The node to specify the range of replacement.
 * @param newTokens The new tokens.
 */
function replaceTokens(
    document: VDocumentFragment | null,
    node: HasRange,
    newTokens: Token[],
): void {
    if (document == null) {
        return
    }

    const index = sortedIndexBy(document.tokens, node, byRange0)
    const count = sortedLastIndexBy(document.tokens, node, byRange1) - index
    document.tokens.splice(index, count, ...newTokens)
}

/**
 * Insert the given comment tokens.
 * @param document The document that the node is belonging to.
 * @param newComments The comments to insert.
 */
function insertComments(
    document: VDocumentFragment | null,
    newComments: Token[],
): void {
    if (document == null || newComments.length === 0) {
        return
    }

    const index = sortedIndexBy(document.comments, newComments[0], byRange0)
    document.comments.splice(index, 0, ...newComments)
}

/**
 * Insert the given error.
 * @param document The document that the node is belonging to.
 * @param error The error to insert.
 */
function insertError(
    document: VDocumentFragment | null,
    error: ParseError,
): void {
    if (document == null) {
        return
    }

    const index = sortedIndexBy(document.errors, error, byIndex)
    document.errors.splice(index, 0, error)
}

/**
 * Parse the given attribute value as an expression.
 * @param code Whole source code text.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The attribute node to replace. This function modifies this node directly.
 * @param tagName The name of this tag.
 * @param directiveKey The key of this directive.
 */
function parseInterpolationAttributeValue(
    code: string,
    parserOptions: any,
    globalLocationCalculator: LocationCalculator,
    node: VLiteral,
) {
    const firstChar = code[node.range[0]]
    const quoted = firstChar === '"' || firstChar === "'"
    const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
        node.range[0] + (quoted ? 1 : 0),
    )
    const reg = /\{\{((?:.|\r?\n)+?)\}\}/gu
    let matchedCode = reg.exec(node.value)
    const result = []
    let ast
    while (matchedCode && matchedCode[1].trim()) {
        ast = parseExpressionBody(
            matchedCode[1],
            locationCalculator,
            parserOptions,
            false,
        )
        result.push(ast)
        matchedCode = reg.exec(node.value)
    }
    return result
}

/**
 * Parse the given attribute value as an expression.
 * @param code Whole source code text.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The attribute node to replace. This function modifies this node directly.
 * @param tagName The name of this tag.
 * @param directiveKey The key of this directive.
 */
function parseAttributeValue(
    code: string,
    parserOptions: any,
    globalLocationCalculator: LocationCalculator,
    node: VLiteral,
    tagName: string,
    directiveKey: VDirectiveKey,
): ExpressionParseResult<
    | ESLintExpression
    | VFilterSequenceExpression
    | VForExpression
    | VOnExpression
    | VSlotScopeExpression
> {
    const firstChar = code[node.range[0]]
    const quoted = firstChar === '"' || firstChar === "'"
    const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
        node.range[0] + (quoted ? 1 : 0),
    )
    const directiveName = directiveKey.name.name

    let result: ExpressionParseResult<
        | ESLintExpression
        | VFilterSequenceExpression
        | VForExpression
        | VOnExpression
        | VSlotScopeExpression
    >
    if (quoted && node.value === "") {
        result = {
            expression: null,
            tokens: [],
            comments: [],
            variables: [],
            references: [],
        }
    } else if (directiveName === "for") {
        result = parseVForExpression(
            node.value,
            locationCalculator,
            parserOptions,
        )
    } else if (directiveName === "on" && directiveKey.argument != null) {
        result = parseVOnExpression(
            node.value,
            locationCalculator,
            parserOptions,
        )
    } else if (
        directiveName === "slot" ||
        directiveName === "slot-scope" ||
        (tagName === "template" && directiveName === "scope")
    ) {
        result = parseSlotScopeExpression(
            node.value,
            locationCalculator,
            parserOptions,
        )
    } else {
        let codeWithoutInterpolation = node.value
        let matched = false
        let locationCalculatorInterpolation = locationCalculator
        const match = /^\{\{((?:.|\r?\n)+?)\}\}$/gu.exec(
            codeWithoutInterpolation,
        )

        if (match) {
            matched = true
            codeWithoutInterpolation = match[1]
            locationCalculatorInterpolation = globalLocationCalculator.getSubCalculatorAfter(
                node.range[0] + (quoted ? 1 : 0) + 2,
            )
        }
        if (directiveName === "bind") {
            result = parseExpression(
                codeWithoutInterpolation,
                locationCalculatorInterpolation,
                parserOptions,
                { allowFilters: true },
            )
        } else {
            result = parseExpression(
                codeWithoutInterpolation,
                locationCalculatorInterpolation,
                parserOptions,
            )
        }

        if (matched) {
            result.tokens.unshift(
                createSimpleToken(
                    "Punctuator",
                    node.range[0] + 1,
                    node.range[0] + 3,
                    "{{",
                    globalLocationCalculator,
                ),
            )
            result.tokens.push(
                createSimpleToken(
                    "Punctuator",
                    node.range[1] - 3,
                    node.range[1] - 1,
                    "}}",
                    globalLocationCalculator,
                ),
            )
        }
    }

    // Add the tokens of quotes.
    if (quoted) {
        result.tokens.unshift(
            createSimpleToken(
                "Punctuator",
                node.range[0],
                node.range[0] + 1,
                firstChar,
                globalLocationCalculator,
            ),
        )
        result.tokens.push(
            createSimpleToken(
                "Punctuator",
                node.range[1] - 1,
                node.range[1],
                firstChar,
                globalLocationCalculator,
            ),
        )
    }

    return result
}

/**
 * Resolve the variable of the given reference.
 * @param referene The reference to resolve.
 * @param element The belonging element of the reference.
 */
function resolveReference(referene: Reference, element: VElement): void {
    let node: VNode | null = element

    // Find the variable of this reference.
    while (node != null && node.type === "VElement") {
        for (const variable of node.variables) {
            if (variable.id.name === referene.id.name) {
                referene.variable = variable
                variable.references.push(referene)
                return
            }
        }

        node = node.parent
    }
}

/**
 * Information of a mustache.
 */
export interface Mustache {
    value: string
    startToken: Token
    endToken: Token
}

/**
 * Replace the given attribute by a directive.
 * @param code Whole source code text.
 * @param parserOptions The parser options to parse expressions.
 * @param locationCalculator The location calculator to adjust the locations of nodes.
 * @param node The attribute node to replace. This function modifies this node directly.
 */
export function convertToInterpolation(
    code: string,
    parserOptions: any,
    locationCalculator: LocationCalculator,
    node: VAttribute,
): void {
    const document = getOwnerDocument(node)
    const interpolation = node
    interpolation.interpolative = true
    if (node.value == null) {
        return
    }
    try {
        const rets = parseInterpolationAttributeValue(
            code,
            parserOptions,
            locationCalculator,
            node.value,
        )
        interpolation.interpolativeValues = rets.map(ret => ({
            parent: interpolation,
            references: ret.references,
            expression: ret.expression,
        }))
    } catch (err) {
        debug("[template] Parse error: %s", err)
        if (ParseError.isParseError(err)) {
            insertError(document, err)
        } else {
            throw err
        }
    }
}

/**
 * Replace the given attribute by a directive.
 * @param code Whole source code text.
 * @param parserOptions The parser options to parse expressions.
 * @param locationCalculator The location calculator to adjust the locations of nodes.
 * @param node The attribute node to replace. This function modifies this node directly.
 */
export function convertToDirective(
    code: string,
    parserOptions: any,
    locationCalculator: LocationCalculator,
    node: VAttribute,
): void {
    debug(
        '[template] convert to directive: %s="%s" %j',
        node.key.name,
        node.value && node.value.value,
        node.range,
    )

    const document = getOwnerDocument(node)
    const directive: VDirective = node as any
    directive.directive = true
    directive.key = createDirectiveKey(
        node.key,
        document,
        parserOptions,
        locationCalculator,
    )

    const { argument } = directive.key
    if (
        argument &&
        argument.type === "VIdentifier" &&
        argument.name.startsWith("[")
    ) {
        const nextChar = code[argument.range[1]]
        if (nextChar == null || invalidDynamicArgumentNextChar.test(nextChar)) {
            const char =
                nextChar == null ? "EOF" : JSON.stringify(nextChar).slice(1, -1)
            insertError(
                document,
                new ParseError(
                    `Dynamic argument cannot contain the '${char}' character.`,
                    undefined,
                    argument.range[1],
                    argument.loc.end.line,
                    argument.loc.end.column,
                ),
            )
        }
    }

    if (node.value == null) {
        return
    }

    try {
        const ret = parseAttributeValue(
            code,
            parserOptions,
            locationCalculator,
            node.value,
            node.parent.parent.name,
            directive.key,
        )

        directive.value = {
            type: "VExpressionContainer",
            range: node.value.range,
            loc: node.value.loc,
            parent: directive,
            expression: ret.expression,
            references: ret.references,
        }
        if (ret.expression != null) {
            ret.expression.parent = directive.value
        }

        for (const variable of ret.variables) {
            node.parent.parent.variables.push(variable)
        }

        replaceTokens(document, node.value, ret.tokens)
        insertComments(document, ret.comments)
    } catch (err) {
        debug("[template] Parse error: %s", err)

        if (ParseError.isParseError(err)) {
            directive.value = {
                type: "VExpressionContainer",
                range: node.value.range,
                loc: node.value.loc,
                parent: directive,
                expression: null,
                references: [],
            }
            insertError(document, err)
        } else {
            throw err
        }
    }
}

/**
 * Parse the content of the given mustache.
 * @param parserOptions The parser options to parse expressions.
 * @param globalLocationCalculator The location calculator to adjust the locations of nodes.
 * @param node The expression container node. This function modifies the `expression` and `references` properties of this node.
 * @param mustache The information of mustache to parse.
 */
export function processMustache(
    parserOptions: any,
    globalLocationCalculator: LocationCalculator,
    node: VExpressionContainer,
    mustache: Mustache,
): void {
    const range: [number, number] = [
        mustache.startToken.range[1],
        mustache.endToken.range[0],
    ]
    debug("[template] convert mustache {{%s}} %j", mustache.value, range)

    const document = getOwnerDocument(node)
    try {
        const locationCalculator = globalLocationCalculator.getSubCalculatorAfter(
            range[0],
        )
        const ret = parseExpression(
            mustache.value,
            locationCalculator,
            parserOptions,
            { allowEmpty: true, allowFilters: true },
        )

        node.expression = ret.expression || null
        node.references = ret.references
        if (ret.expression != null) {
            ret.expression.parent = node
        }

        replaceTokens(document, { range }, ret.tokens)
        insertComments(document, ret.comments)
    } catch (err) {
        debug("[template] Parse error: %s", err)

        if (ParseError.isParseError(err)) {
            insertError(document, err)
        } else {
            throw err
        }
    }
}

/**
 * Resolve all references of the given expression container.
 * @param container The expression container to resolve references.
 */
export function resolveReferences(container: VExpressionContainer): void {
    let element: VNode | null = container.parent

    // Get the belonging element.
    while (element != null && element.type !== "VElement") {
        element = element.parent
    }

    // Resolve.
    if (element != null) {
        for (const reference of container.references) {
            resolveReference(reference, element)
        }
    }
}

interface TemplateData {
    templateRaw: string
    templateRawLoc: LocationRange
    templateRawOffset: number
}

/**
 * Get the raw data from the script template in ts/js file.
 *
 * @param result The ast of source code.
 * @param code The source code.
 * @returns The result of template data.
 */
export function getTemplateRawData(
    result: ESLintExtendedProgram,
    code: string,
): TemplateData[] {
    const templateData: TemplateData[] = []
    traverseNodes(result.ast, {
        enterNode(node: any) {
            if (
                node &&
                (node.type === "ClassProperty" || node.type === "Property") &&
                node.key.name === "template"
            ) {
                if (
                    node.value &&
                    node.value.loc &&
                    Array.isArray(node.value.range)
                ) {
                    let templateRaw = ""
                    let templateRawLoc: LocationRange = {
                        start: {
                            line: 0,
                            column: 0,
                        },
                        end: {
                            line: 0,
                            column: 0,
                        },
                    }
                    let templateRawOffset = 0
                    const start: number = node.value.range[0]
                    const end: number = node.value.range[1]
                    templateRawLoc = {
                        start: Object.assign({}, node.value.loc.start),
                        end: Object.assign({}, node.value.loc.end),
                    }
                    templateRawOffset = node.value.range[0]
                    templateRaw = code.slice(start + 1, end - 1)
                    templateData.push({
                        templateRaw,
                        templateRawLoc,
                        templateRawOffset,
                    })
                }
            }
        },
        leaveNode() {
            // Do nothing.
        },
    })
    return templateData
}

/**
 * Get location by offset loc
 * @param loc current loc
 * @param offsetLoc offset loc
 * @returns fixed loc
 */
function getLoc(loc: LocationRange, offsetLoc: LocationRange) {
    if (!offsetLoc) {
        return loc
    }
    return {
        start: {
            line: loc.start.line + offsetLoc.start.line - 1,
            column:
                loc.start.line === 1
                    ? loc.start.column + offsetLoc.start.column + 1
                    : loc.start.column,
        },
        end: {
            line: loc.end.line + offsetLoc.start.line - 1,
            column:
                loc.start.line === 1
                    ? loc.end.column + offsetLoc.start.column + 1
                    : loc.end.column,
        },
    }
}

/**
 * fix tokens/comments/nodes in the root ast from source code in ts/js files
 * @param rootAST root ast
 * @param templateRawLoc location of template in source code
 * @param templateRawOffset offset of template in source code
 */
export function fixLocation(
    rootAST: VDocumentFragment,
    templateRawLoc: LocationRange,
    templateRawOffset: number,
) {
    traverseNodes(rootAST, {
        enterNode(node) {
            const range: number[] = node.range
            node.range = [
                templateRawOffset + range[0] + 1,
                templateRawOffset + range[1] + 1,
            ]
            node.loc = getLoc(node.loc, templateRawLoc)
        },
        leaveNode() {
            // Do nothing.
        },
    })
    for (const token of rootAST.tokens || []) {
        if (!token) {
            continue
        }
        const range: number[] = token.range
        token.range = [
            templateRawOffset + range[0] + 1,
            templateRawOffset + range[1] + 1,
        ]
        token.loc = getLoc(token.loc, templateRawLoc)
    }
    for (const comment of rootAST.comments || []) {
        if (!comment) {
            continue
        }
        const range: number[] = comment.range
        comment.range = [
            templateRawOffset + range[0] + 1,
            templateRawOffset + range[1] + 1,
        ]
        comment.loc = getLoc(comment.loc, templateRawLoc)
    }
    for (const error of rootAST.errors || []) {
        if (!error) {
            continue
        }
        const { lineNumber, column } = error
        error.lineNumber = lineNumber + templateRawLoc.start.line - 1
        error.column =
            lineNumber === 1 ? column + templateRawLoc.start.column + 1 : column
    }
}
