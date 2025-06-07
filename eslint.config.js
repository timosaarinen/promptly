// eslint.config.js
import globals from 'globals';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // Global ignores
    ignores: ['dist/', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js'],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-specific config for TS/TSX files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Include the recommended rules from the react-hooks plugin
      ...reactHooks.configs.recommended.rules,

      // Custom rules
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  }
);
