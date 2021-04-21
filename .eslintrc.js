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
        sourceType: "module",
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json']
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "rules": {
        // Base eslint rules.
        "curly": "warn",
        "eqeqeq": ["error", "always"],
        "prefer-const": "warn",
        "no-eval": "error",
        "no-unsafe-finally": "warn",
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
        "getter-return": "warn",
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
        "no-func-assign": "warn",
        "no-import-assign": "error",
        "no-invalid-regexp": "error",
        "no-unreachable": "warn",
        "no-useless-backreference": "error",
        "require-atomic-updates": "error",
        "no-fallthrough": [
            "warn",
            {
                // Add a "// [[fallthrough]]" comment to indicate intentional (non-empty) fallthrough.
                commentPattern: "\\[\\[fallthrough\\]\\]"
            }
        ],

        // Override base eslint rules with the equivalent typescript-eslint rule.
        "brace-style": "off",
        "@typescript-eslint/brace-style": [
            "warn",
            "1tbs",
            {
                // Reserve this for simple functions (no control-flow).
                allowSingleLine: true
            }
        ],
        "comma-spacing": "off",
        "@typescript-eslint/comma-spacing": "warn",
        "comma-dangle": "off",
        "@typescript-eslint/comma-dangle": ["error", "never"],
        "keyword-spacing": "off",
        "@typescript-eslint/keyword-spacing": ["warn"],
        "lines-between-class-members": "off",
        "@typescript-eslint/lines-between-class-members": [
            "error",
            "always",
            {
                exceptAfterSingleLine: true,
                exceptAfterOverload: true
            }
        ],
        "no-duplicate-imports": "off",
        "@typescript-eslint/no-duplicate-imports": ["warn"],
        "no-extra-semi": "off",
        "@typescript-eslint/no-extra-semi": ["warn"],
        "no-implied-eval": "off",
        "@typescript-eslint/no-implied-eval": ["error"],
        "no-redeclare": "off",
        "@typescript-eslint/no-redeclare": [
            "error",
            {
                ignoreDeclarationMerge: true
            }
        ],
        "quotes": "off",
        "@typescript-eslint/quotes": [
            "warn",
            "single",
            {
                allowTemplateLiterals: true
            }
        ],
        "no-unused-expressions": "off",
        "@typescript-eslint/no-unused-expressions": "warn",
        "no-return-await": "off",
        "@typescript-eslint/return-await": ["warn", "in-try-catch"],
        "semi": "off",
        "@typescript-eslint/semi": ["warn", "always"],
        "space-before-function-paren": "off",
        "@typescript-eslint/space-before-function-paren": [
            "warn",
            {
                anonymous: "always",
                named: "never",
                asyncArrow: "always"
            }
        ],
        "space-infix-ops": "off",
        "@typescript-eslint/space-infix-ops": [
            "error",
            {
                int32Hint: false
            }
        ],

        // typescript-eslint specific rules
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
        "@typescript-eslint/explicit-function-return-type": [
            "error",
            {
                allowExpressions: true,
                allowTypedFunctionExpressions: true,
                allowHigherOrderFunctions: true,
                allowDirectConstAssertionInArrowFunctions: true,
                allowConciseArrowFunctionExpressionsStartingWithVoid: true
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
    }
};
