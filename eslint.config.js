const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const tsEslintRecommendedRules = tsPlugin.configs['eslint-recommended'].overrides?.[0]?.rules ?? {};
const tsRecommendedRules = tsPlugin.configs.recommended.rules ?? {};

module.exports = [
  {
    ignores: [
      'build/**',
      'node_modules/**',
      'src/public/react/stock-app-frontend/**',
      'src/shared/services/mtsi-testing/**'
    ]
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsEslintRecommendedRules,
      ...tsRecommendedRules
    }
  }
];
