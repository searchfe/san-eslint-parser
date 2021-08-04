/**
 * @author BUPTlhuanyu
 *
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("assert")
const parse = require("../src").parseForESLint

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const PARSER_OPTIONS = {
    comment: true,
    ecmaVersion: 6,
    loc: true,
    range: true,
    tokens: true,
    parser: "@typescript-eslint/parser",
    sourceType: "module",
}

/**
 * Get the value of the given node.
 * @param {ASTNode} token The node to get value.
 * @returns {string} The value of the node.
 */
function toValue(token) {
    if (token.type === "HTMLAssociation") {
        return "="
    }
    if (token.type === "HTMLTagClose") {
        return ">"
    }
    return token.value
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------
describe("multi templateBodys", () => {
    const code = `const a = {
        template: "<!--comment--><div s-for='item in list'>{{item}}</div>"
    };const b = {
        template: "<!--comment--><span s-for='item in list'>{{item}}</span>"
    }`
    let ast = null
    let tokens = null

    before(() => {
        const result = parse(
            code,
            Object.assign({ filePath: "test.ts" }, PARSER_OPTIONS)
        )
        ast = result.ast
        tokens = result.services.getTemplateBodyTokenStore()
    })

    describe("ast.templateBody", () => {
        it("should return all tokens (except comments) in the first template.", () => {
            const actual = tokens.getTokens(ast.templateBody[0]).map(toValue)
            assert.deepStrictEqual(actual, [
                "div",
                "s-for",
                "=",
                "'",
                "item",
                "in",
                "list",
                "'",
                ">",
                "{{",
                "item",
                "}}",
                "div",
                ">",
            ])
        })

        it("should return all tokens (except comments) in the second template.", () => {
            const actual = tokens.getTokens(ast.templateBody[1]).map(toValue)
            assert.deepStrictEqual(actual, [
                "span",
                "s-for",
                "=",
                "'",
                "item",
                "in",
                "list",
                "'",
                ">",
                "{{",
                "item",
                "}}",
                "span",
                ">",
            ])
        })

        it("should return all tokens (include comments) in the first template if you give {includeComments: true} option.", () => {
            const actual = tokens
                .getTokens(ast.templateBody[0], { includeComments: true })
                .map(toValue)
            assert.deepStrictEqual(actual, [
                "comment",
                "div",
                "s-for",
                "=",
                "'",
                "item",
                "in",
                "list",
                "'",
                ">",
                "{{",
                "item",
                "}}",
                "div",
                ">",
            ])
        })

        it("should return all tokens (include comments) in the second template if you give {includeComments: true} option.", () => {
            const actual = tokens
                .getTokens(ast.templateBody[1], { includeComments: true })
                .map(toValue)
            assert.deepStrictEqual(actual, [
                "comment",
                "span",
                "s-for",
                "=",
                "'",
                "item",
                "in",
                "list",
                "'",
                ">",
                "{{",
                "item",
                "}}",
                "span",
                ">",
            ])
        })
    })
})
