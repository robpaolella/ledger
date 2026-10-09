import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      'data/',
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Shared & Server config (Node.js)
  {
    files: ['packages/server/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Client config (Browser + React)
  {
    files: ['packages/client/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['useAuth', 'useToast', 'initOwnerSlots'] }],
    },
  },

  // Practical rule overrides for all packages
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'no-console': 'off',
    },
  },
);
