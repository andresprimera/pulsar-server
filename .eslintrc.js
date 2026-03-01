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
      { type: 'channels', pattern: 'src/channels/**' },
      { type: 'orchestrator', pattern: 'src/agent/incoming-message.orchestrator.ts' },
      { type: 'agent', pattern: 'src/agent/**' },
      { type: 'database', pattern: 'src/database/**' },
      { type: 'domain', pattern: 'src/domain/**' },
    ],
  },

  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',

    // Prevent parent relative imports
    'import/no-relative-parent-imports': 'error',

    // Prevent circular dependencies
    'import/no-cycle': ['error', { maxDepth: 1 }],

    // Force alias usage
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['src/**'],
            message: 'Use path aliases (@agent, @database, etc.) instead of raw src imports.',
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
          { from: 'channels', allow: ['orchestrator'] },
          { from: 'orchestrator', allow: ['agent', 'database', 'domain'] },
          { from: 'agent', allow: ['database', 'domain'] },
          { from: 'database', allow: [] },
        ],
      },
    ],
  },
};