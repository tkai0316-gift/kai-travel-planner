import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // CDN globals（MapLibre / Chart.js / ExcelJS）
        maplibregl: 'readonly',
        Chart: 'readonly',
        ExcelJS: 'readonly',
      },
    },
    rules: {
      // console.log 禁止；console.warn / error 保留給合法錯誤處理
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // 未使用的變數警告（_ 開頭例外）
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 禁止 == 危險比較；null: 'ignore' 允許 == null / != null（同時捕 null + undefined 的慣用法）
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      // 禁止 var
      'no-var': 'error',
      // 能用 const 就用 const
      'prefer-const': 'warn',
    },
  },
  {
    // 忽略：worker（CF Runtime）、測試檔（Node.js）、service worker
    ignores: ['worker/**', 'test-full.mjs', 'sw.js'],
  },
];
