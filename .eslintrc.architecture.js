module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['boundaries', 'import'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', '.eslintrc.architecture.js'],
  settings: {
    'boundaries/elements': [
      { type: 'channels', pattern: 'src/core/channels/**' },
      {
        type: 'orchestrator',
        pattern: 'src/core/orchestrator/**',
      },
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
    'import/no-cycle': ['error', { maxDepth: 1 }],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['src/**'],
            message:
              'Use path aliases (@agent, @persistence, etc.) instead of raw src imports.',
          },
          {
            group: ['../*', '../../*', '../../../*', '../../../../*', '../../../../../*'],
            message:
              'Parent-relative imports are forbidden in src/. Use aliases (@agent, @channels, @persistence, etc.) for cross-folder imports.',
          },
        ],
      },
    ],
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
