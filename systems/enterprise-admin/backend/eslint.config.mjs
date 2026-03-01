import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    // Global ignores
    {
        ignores: ['dist/', 'node_modules/', 'prisma/'],
    },

    // Base recommended rules
    eslint.configs.recommended,

    // TypeScript recommended rules
    ...tseslint.configs.recommended,

    // Prettier (disables conflicting rules)
    eslintConfigPrettier,

    // Custom overrides
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
);
