// ESLint flat config for the frontend: catches undefined names, unused code
// and writes to imported bindings across the ES modules in src/.
import js from '@eslint/js';
import globals from 'globals';

export default [
    {ignores: ['dist/', 'wailsjs/']},
    js.configs.recommended,
    {
        files: ['src/**/*.js', 'test/**/*.js', '*.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.browser},
        },
        rules: {
            'no-unused-vars': ['error', {args: 'none'}],
            'no-import-assign': 'error',
        },
    },
];
