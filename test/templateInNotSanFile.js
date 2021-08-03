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

describe("templateBody in class component", () => {
    const code = `class Test {
        template = "<!--comment--><div s-for='item in list'>{{item}}</div>";
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
        it("should return all tokens (except comments) in the template.", () => {
            const actual = tokens.getTokens(ast.templateBody).map(toValue)
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

        it("should return all tokens (include comments) in the template if you give {includeComments: true} option.", () => {
            const actual = tokens
                .getTokens(ast.templateBody, { includeComments: true })
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
    })

    describe("ast.templateBody.children[0] (VElement)", () => {
        it("should return a element token.", () => {
            const node = ast.templateBody.children[0]
            const actual = tokens.getTokens(node).map(toValue)

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
    })

    describe("ast.templateBody.children[0].startTag (VStartTag)", () => {
        it("should return all tokens in the tag.", () => {
            const node = ast.templateBody.children[0].startTag
            const actual = tokens.getTokens(node).map(toValue)

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
            ])
        })
    })

    describe("ast.templateBody.children[0].startTag.attributes[0] (VAttribute)", () => {
        it("should return all tokens in the attribute.", () => {
            const node = ast.templateBody.children[0].startTag.attributes[0]
            const actual = tokens.getTokens(node).map(toValue)

            assert.deepStrictEqual(actual, [
                "s-for",
                "=",
                "'",
                "item",
                "in",
                "list",
                "'",
            ])
        })
    })

    describe("ast.templateBody.children[0].endTag (VEndTag)", () => {
        it("should return all tokens in the tag.", () => {
            const node = ast.templateBody.children[0].endTag
            const actual = tokens.getTokens(node).map(toValue)

            assert.deepStrictEqual(actual, ["div", ">"])
        })
    })

    describe("ast.templateBody location and range", () => {
        it("should return the right range and locations in root node", () => {
            const node = ast.templateBody
            const loc = node.loc
            const range = node.range

            assert.deepStrictEqual(loc, {
                start: {
                    line: 2,
                    column: 20,
                },
                end: {
                    line: 2,
                    column: 74,
                },
            })
            assert.deepStrictEqual(range, [33, 87])
        })
        it("should return the right range and locations in children[0] (VElement<div>)", () => {
            const node = ast.templateBody.children[0]
            const loc = node.loc
            const range = node.range

            assert.deepStrictEqual(loc, {
                start: {
                    line: 2,
                    column: 34,
                },
                end: {
                    line: 2,
                    column: 74,
                },
            })
            assert.deepStrictEqual(range, [47, 87])
        })

        it("should return the right range and locations in children[0][0] (VExpressionContainer<s-for>)", () => {
            const node = ast.templateBody.children[0].children[0]
            const loc = node.loc
            const range = node.range

            assert.deepStrictEqual(loc, {
                start: {
                    line: 2,
                    column: 60,
                },
                end: {
                    line: 2,
                    column: 68,
                },
            })
            assert.deepStrictEqual(range, [73, 81])
        })

        it("should return the right range and locations in children[0][0].expression (Identifier)", () => {
            const node = ast.templateBody.children[0].children[0].expression
            const loc = node.loc
            const range = node.range

            assert.deepStrictEqual(loc, {
                start: {
                    line: 2,
                    column: 62,
                },
                end: {
                    line: 2,
                    column: 66,
                },
            })
            assert.deepStrictEqual(range, [75, 79])
            assert(node.name === "item")
        })

        it("should return the right range and locations in comment (HTMLComment)", () => {
            const node = ast.templateBody.comments[0]
            const loc = node.loc
            const range = node.range

            assert.deepStrictEqual(loc, {
                start: {
                    line: 2,
                    column: 20,
                },
                end: {
                    line: 2,
                    column: 34,
                },
            })
            assert.deepStrictEqual(range, [33, 47])
        })
    })

    describe("ast.templateBody tokens", () => {
        it("should return all tokens.", () => {
            const node = ast.templateBody.tokens

            assert.deepStrictEqual(node, [
                {
                    loc: {
                        end: {
                            column: 38,
                            line: 2,
                        },
                        start: {
                            column: 34,
                            line: 2,
                        },
                    },
                    range: [47, 51],
                    type: "HTMLTagOpen",
                    value: "div",
                },
                {
                    loc: {
                        end: {
                            column: 44,
                            line: 2,
                        },
                        start: {
                            column: 39,
                            line: 2,
                        },
                    },
                    range: [52, 57],
                    type: "HTMLIdentifier",
                    value: "s-for",
                },
                {
                    loc: {
                        end: {
                            column: 45,
                            line: 2,
                        },
                        start: {
                            column: 44,
                            line: 2,
                        },
                    },
                    range: [57, 58],
                    type: "HTMLAssociation",
                    value: "",
                },
                {
                    loc: {
                        end: {
                            column: 46,
                            line: 2,
                        },
                        start: {
                            column: 45,
                            line: 2,
                        },
                    },
                    range: [58, 59],
                    type: "Punctuator",
                    value: "'",
                },
                {
                    loc: {
                        end: {
                            column: 50,
                            line: 2,
                        },
                        start: {
                            column: 46,
                            line: 2,
                        },
                    },
                    range: [59, 63],
                    type: "Identifier",
                    value: "item",
                },
                {
                    loc: {
                        end: {
                            column: 53,
                            line: 2,
                        },
                        start: {
                            column: 51,
                            line: 2,
                        },
                    },
                    range: [64, 66],
                    type: "Keyword",
                    value: "in",
                },
                {
                    loc: {
                        end: {
                            column: 58,
                            line: 2,
                        },
                        start: {
                            column: 54,
                            line: 2,
                        },
                    },
                    range: [67, 71],
                    type: "Identifier",
                    value: "list",
                },
                {
                    loc: {
                        end: {
                            column: 59,
                            line: 2,
                        },
                        start: {
                            column: 58,
                            line: 2,
                        },
                    },
                    range: [71, 72],
                    type: "Punctuator",
                    value: "'",
                },
                {
                    loc: {
                        end: {
                            column: 60,
                            line: 2,
                        },
                        start: {
                            column: 59,
                            line: 2,
                        },
                    },
                    range: [72, 73],
                    type: "HTMLTagClose",
                    value: "",
                },
                {
                    loc: {
                        end: {
                            column: 62,
                            line: 2,
                        },
                        start: {
                            column: 60,
                            line: 2,
                        },
                    },
                    range: [73, 75],
                    type: "VExpressionStart",
                    value: "{{",
                },
                {
                    loc: {
                        end: {
                            column: 66,
                            line: 2,
                        },
                        start: {
                            column: 62,
                            line: 2,
                        },
                    },
                    range: [75, 79],
                    type: "Identifier",
                    value: "item",
                },
                {
                    loc: {
                        end: {
                            column: 68,
                            line: 2,
                        },
                        start: {
                            column: 66,
                            line: 2,
                        },
                    },
                    range: [79, 81],
                    type: "VExpressionEnd",
                    value: "}}",
                },
                {
                    loc: {
                        end: {
                            column: 73,
                            line: 2,
                        },
                        start: {
                            column: 68,
                            line: 2,
                        },
                    },
                    range: [81, 86],
                    type: "HTMLEndTagOpen",
                    value: "div",
                },
                {
                    loc: {
                        end: {
                            column: 74,
                            line: 2,
                        },
                        start: {
                            column: 73,
                            line: 2,
                        },
                    },
                    range: [86, 87],
                    type: "HTMLTagClose",
                    value: "",
                },
            ])
        })
    })
})

describe("templateBody in san.defineComponent", () => {
    const code = `san.defineComponent({
        template: "<!--comment--><div s-for='item in list'>{{item}}</div>"
    })`
    let ast = null

    before(() => {
        const result = parse(
            code,
            Object.assign({ filePath: "test.ts" }, PARSER_OPTIONS)
        )
        ast = result.ast
    })

    describe("ast.templateBody tokens", () => {
        it("should return all tokens.", () => {
            const node = ast.templateBody.tokens

            assert.deepStrictEqual(node, [
                {
                    loc: {
                        end: {
                            column: 37,
                            line: 2,
                        },
                        start: {
                            column: 33,
                            line: 2,
                        },
                    },
                    range: [55, 59],
                    type: "HTMLTagOpen",
                    value: "div",
                },
                {
                    loc: {
                        end: {
                            column: 43,
                            line: 2,
                        },
                        start: {
                            column: 38,
                            line: 2,
                        },
                    },
                    range: [60, 65],
                    type: "HTMLIdentifier",
                    value: "s-for",
                },
                {
                    loc: {
                        end: {
                            column: 44,
                            line: 2,
                        },
                        start: {
                            column: 43,
                            line: 2,
                        },
                    },
                    range: [65, 66],
                    type: "HTMLAssociation",
                    value: "",
                },
                {
                    loc: {
                        end: {
                            column: 45,
                            line: 2,
                        },
                        start: {
                            column: 44,
                            line: 2,
                        },
                    },
                    range: [66, 67],
                    type: "Punctuator",
                    value: "'",
                },
                {
                    loc: {
                        end: {
                            column: 49,
                            line: 2,
                        },
                        start: {
                            column: 45,
                            line: 2,
                        },
                    },
                    range: [67, 71],
                    type: "Identifier",
                    value: "item",
                },
                {
                    loc: {
                        end: {
                            column: 52,
                            line: 2,
                        },
                        start: {
                            column: 50,
                            line: 2,
                        },
                    },
                    range: [72, 74],
                    type: "Keyword",
                    value: "in",
                },
                {
                    loc: {
                        end: {
                            column: 57,
                            line: 2,
                        },
                        start: {
                            column: 53,
                            line: 2,
                        },
                    },
                    range: [75, 79],
                    type: "Identifier",
                    value: "list",
                },
                {
                    loc: {
                        end: {
                            column: 58,
                            line: 2,
                        },
                        start: {
                            column: 57,
                            line: 2,
                        },
                    },
                    range: [79, 80],
                    type: "Punctuator",
                    value: "'",
                },
                {
                    loc: {
                        end: {
                            column: 59,
                            line: 2,
                        },
                        start: {
                            column: 58,
                            line: 2,
                        },
                    },
                    range: [80, 81],
                    type: "HTMLTagClose",
                    value: "",
                },
                {
                    loc: {
                        end: {
                            column: 61,
                            line: 2,
                        },
                        start: {
                            column: 59,
                            line: 2,
                        },
                    },
                    range: [81, 83],
                    type: "VExpressionStart",
                    value: "{{",
                },
                {
                    loc: {
                        end: {
                            column: 65,
                            line: 2,
                        },
                        start: {
                            column: 61,
                            line: 2,
                        },
                    },
                    range: [83, 87],
                    type: "Identifier",
                    value: "item",
                },
                {
                    loc: {
                        end: {
                            column: 67,
                            line: 2,
                        },
                        start: {
                            column: 65,
                            line: 2,
                        },
                    },
                    range: [87, 89],
                    type: "VExpressionEnd",
                    value: "}}",
                },
                {
                    loc: {
                        end: {
                            column: 72,
                            line: 2,
                        },
                        start: {
                            column: 67,
                            line: 2,
                        },
                    },
                    range: [89, 94],
                    type: "HTMLEndTagOpen",
                    value: "div",
                },
                {
                    loc: {
                        end: {
                            column: 73,
                            line: 2,
                        },
                        start: {
                            column: 72,
                            line: 2,
                        },
                    },
                    range: [94, 95],
                    type: "HTMLTagClose",
                    value: "",
                },
            ])
        })
    })
})

describe("templateBody in object", () => {
    const code = `export default {
        template: "<!--comment--><div s-for='item in list'>{{item}}</div>"
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
        it("should return all tokens (except comments) in the template.", () => {
            const actual = tokens.getTokens(ast.templateBody).map(toValue)
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

        it("should return all tokens (include comments) in the template if you give {includeComments: true} option.", () => {
            const actual = tokens
                .getTokens(ast.templateBody, { includeComments: true })
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
    })
})

describe("only one templateBody", () => {
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
        it("should return all tokens (except comments) in the template.", () => {
            const actual = tokens.getTokens(ast.templateBody).map(toValue)
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

        it("should return all tokens (include comments) in the template if you give {includeComments: true} option.", () => {
            const actual = tokens
                .getTokens(ast.templateBody, { includeComments: true })
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
    })
})
