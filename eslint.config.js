import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// eslint-plugin-react does not support ESLint 10 yet. This is the one piece of it we need:
// count <Component /> and <Foo.Bar /> as uses, so no-unused-vars sees JSX.
const jsxUsesVars = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      JSXOpeningElement(node) {
        let name = node.name
        while (name.type === 'JSXMemberExpression') name = name.object
        if (name.type === 'JSXIdentifier') context.sourceCode.markVariableAsUsed(name.name, node)
      },
    }
  },
}

export default [
  { ignores: ['dist', 'dev-dist', 'node_modules', 'supabase/functions/**/*.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, local: { rules: { 'jsx-uses-vars': jsxUsesVars } } },
    rules: {
      // The classic hook rules. v7's React Compiler rules are left off on purpose.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'local/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/test/**', '**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
  },
  {
    files: ['scripts/**', '*.config.js', '*.cjs', 'supabase/functions/_shared/**'],
    languageOptions: { globals: { ...globals.node, Deno: 'readonly' } },
  },
]
