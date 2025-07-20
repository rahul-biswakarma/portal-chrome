// ESLint Flat Config (modern style)
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';

export default tseslint.config(
  // Ignore build/dist folders
  { ignores: ['dist', 'build'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettier,
    },
    rules: {
      // Prettier integration: show Prettier errors as ESLint errors
      'prettier/prettier': 'error',
      // React Hooks best practices
      ...reactHooks.configs.recommended.rules,
      // Only allow exporting components for React Fast Refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // TypeScript/JS best practices
      'no-unused-vars': 'off', // Disable base rule in favor of TS rule
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // React 17+ does not require React in scope
      'react/react-in-jsx-scope': 'off',
    },
  }
);
