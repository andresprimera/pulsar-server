module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'boundaries', 'import'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],

  settings: {
    'boundaries/elements': [
      { type: 'channels', pattern: 'src/core/channels/**' },
      { type: 'orchestrator', pattern: 'src/core/orchestrator/**' },
      { type: 'agent', pattern: 'src/core/agent/**' },
      { type: 'persistence', pattern: 'src/core/persistence/**' },
      { type: 'domain', pattern: 'src/core/domain/**' },
    ],
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },

  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',

    // Prevent circular dependencies
    'import/no-cycle': ['error', { maxDepth: 1 }],

    // Force alias usage and block parent-relative imports
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['src/**'],
            message: 'Use path aliases (@agent, @persistence, etc.) instead of raw src imports.',
          },
          {
            group: ['../*', '../../*', '../../../*', '../../../../*', '../../../../../*'],
            message:
              'Parent-relative imports are forbidden in src/. Use aliases (@agent, @channels, @persistence, etc.) for cross-folder imports.',
          },
        ],
      },
    ],

    // Enforce layer architecture
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'channels', allow: ['orchestrator', 'domain'] },
          { from: 'orchestrator', allow: ['domain', 'agent', 'persistence'] },
          { from: 'agent', allow: ['domain', 'persistence'] },
          { from: 'domain', allow: [] },
          { from: 'persistence', allow: [] },
        ],
      },
    ],
  },

  overrides: [
    {
      files: ['test/**/*.ts', '**/*.spec.ts'],
      rules: {
        // Tests may import fixtures/helpers from parent paths.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['src/**'],
                message:
                  'Use path aliases (@agent, @persistence, etc.) instead of raw src imports.',
              },
            ],
          },
        ],
      },
    },
  ],
};
