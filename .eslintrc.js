module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": [
        "prettier",
        "prettier/@typescript-eslint"
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "sourceType": "module",
        "project": "./tsconfig.json"
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "rules": {
        "@typescript-eslint/member-delimiter-style": [
            "warn",
            {
                multiline: {
                    delimiter: "semi",
                    requireLast: true
                },
                singleline: {
                    delimiter: "semi",
                    requireLast: false
                }
            }
        ],
        "@typescript-eslint/no-unused-expressions": "warn",
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "@typescript-eslint/explicit-function-return-type": [
            "error",
            {
                allowExpressions: true,
                allowTypedFunctionExpressions: true,
                allowHigherOrderFunctions: true,
                allowDirectConstAssertionInArrowFunctions: true,
                allowConciseArrowFunctionExpressionsStartingWithVoid: false
            }
        ],
        "@typescript-eslint/no-confusing-non-null-assertion": "warn",
        "@typescript-eslint/no-confusing-void-expression": [
            "warn",
            {
                ignoreArrowShorthand: true
            }
        ],
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-invalid-void-type": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "warn",
        "@typescript-eslint/prefer-for-of": "warn",
        "@typescript-eslint/prefer-includes": "warn",
        "@typescript-eslint/prefer-nullish-coalescing": [
            "warn",
            {
                ignoreConditionalTests: true,
                ignoreMixedLogicalExpressions: true
            }
        ],
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-readonly": "warn",
        // "@typescript-eslint/prefer-regexp-exec": "error",
        "@typescript-eslint/prefer-string-starts-ends-with": "warn",
        "@typescript-eslint/type-annotation-spacing": "warn",
        "curly": "warn",
        "eqeqeq": [
            "error",
            "always"
        ],
        "prefer-const": "warn",
        "no-redeclare": "error",
        "no-eval": "error",
        "no-return-await": "warn",
        "no-unsafe-finally": "warn",
        "no-unused-expressions": "warn",
        "no-unused-labels": "error",
        "no-var": "error",
        "valid-typeof": "error",
        "no-duplicate-imports": "error",
        "no-caller": "error",
        "no-duplicate-case": "error",
        "no-irregular-whitespace": "error",
        "no-undef-init": "warn",
        "use-isnan": "error",
        "yoda": "warn",
        "new-parens": "warn",
        "eol-last": "warn",
        "constructor-super": "warn",
        "for-direction": "error",
        "getter-return": "error",
        "no-constant-condition": "warn",
        "no-dupe-args": "warn",
        "no-dupe-else-if": "warn",
        "no-dupe-keys": "error",
        "no-empty-character-class": "error",
        "no-extra-boolean-cast": [
            "warn",
            {
                enforceForLogicalOperands: true
            }
        ],
        "no-extra-semi": "warn",
        "no-func-assign": "warn",
        "no-import-assign": "error",
        "no-invalid-regexp": "error",
        "no-unreachable": "warn",
        "no-useless-backreference": "error",
        "require-atomic-updates": "error",
        "no-fallthrough": [
            "error",
            {
                commentPattern: "\\[\\[fallthrough\\]\\]"
            }
        ]
    }
};
