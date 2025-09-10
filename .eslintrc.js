module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module',
        project: './tsconfig.json'
    },
    plugins: [
        '@typescript-eslint',
        'security'
    ],
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:security/recommended'
    ],
    rules: {
        '@typescript-eslint/naming-convention': [
            'warn',
            {
                'selector': 'import',
                'format': ['camelCase', 'PascalCase']
            }
        ],
        '@typescript-eslint/semi': 'warn',
        'curly': 'warn',
        'eqeqeq': 'warn',
        'no-throw-literal': 'warn',
        'semi': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/prefer-const': 'error',
        '@typescript-eslint/no-inferrable-types': 'off',
        'security/detect-object-injection': 'warn',
        'security/detect-non-literal-fs-filename': 'warn',
        'security/detect-eval-with-expression': 'error',
        'security/detect-new-buffer': 'error'
    },
    ignorePatterns: ['out', 'dist', '**/*.d.ts', 'webpack.config.js', 'scripts/**/*.js']
};
