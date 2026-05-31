import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'public/'] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
    },
  },
];
