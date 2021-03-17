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
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "rules": {
        "@typescript-eslint/member-delimiter-style": [
            "warn",
            {
                "multiline": {
                    "delimiter": "semi",
                    "requireLast": true
                },
                "singleline": {
                    "delimiter": "semi",
                    "requireLast": false
                }
            }
        ],
        "@typescript-eslint/no-unused-expressions": "warn",
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "curly": "warn",
        "eqeqeq": [
            "error",
            "always"
        ],
        "prefer-const": "error",
        "no-redeclare": "error",
        "no-eval": "error",
        "no-return-await": "warn",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "error",
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
        "constructor-super": "error",
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
                "enforceForLogicalOperands": true
            }
        ],
        "no-extra-semi": "warn",
        "no-func-assign": "warn",
        "no-import-assign": "error",
        "no-invalid-regexp": "error",
        "no-unreachable": "warn",
        "no-useless-backreference": "error",
        "require-atomic-updates": "error"
    }
};
