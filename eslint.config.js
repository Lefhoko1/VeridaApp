// The architecture rules live here so that a violation fails lint instead of relying on review.
// See docs/ARCHITECTURE.md for the reasoning behind each boundary.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Which modules each module may import, always through the public index.ts. Mirrors section 3
// of the requirements: for example, records and analytics must not depend on the assistant.
const MODULE_DEPENDENCIES = {
  account: [],
  business: ['account'],
  records: ['business'],
  operations: ['business'],
  analytics: ['business'],
  learning: ['business'],
  assistant: ['business'],
  notifications: [],
  administration: ['account'],
};
const MODULES = Object.keys(MODULE_DEPENDENCIES);

const pattern = (group, message) => ({ group, message });
const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

const NO_DEEP_IMPORTS = pattern(['@/modules/*/**'], 'Import other modules through their public index.ts only.');
const NO_MODULES = pattern(['@/modules', '@/modules/**', '@/composition', '@/composition/**'], 'This layer must not know about modules.');
const NO_SUPABASE = pattern(['@supabase/*'], 'Only a module data layer or core/supabase may touch Supabase.');
const NO_DATA_LAYER = pattern(['**/data', '**/data/**'], 'Depend on domain interfaces, not on the data layer.');
const NO_PRESENTATION = pattern(['**/presentation', '**/presentation/**'], 'This layer must not depend on presentation.');
const NO_UI_KITS = pattern(['react-native-paper', '@/design-system', '@/design-system/**', 'expo-router'], 'This layer must not render or navigate.');
const NO_RENDERING = pattern(['react-native', 'react-native-paper', 'expo-router'], 'ViewModels hold state and commands, and must not render or navigate.');
const NO_LOGIC_IN_VIEWS = pattern(
  ['@tanstack/*', '**/domain/repositories/**', '**/di', 'expo-router'],
  'Views only render a ViewModel. Move queries, repositories and navigation out of them.',
);

const moduleImports = (name) =>
  pattern(
    MODULES.filter((other) => other !== name && !MODULE_DEPENDENCIES[name].includes(other)).map((other) => `@/modules/${other}`),
    `Module "${name}" may only import: ${MODULE_DEPENDENCIES[name].join(', ') || 'no other module'}.`,
  );

const moduleLayerRules = MODULES.flatMap((name) => {
  const base = `src/modules/${name}`;
  const boundary = moduleImports(name);
  return [
    { files: [`${base}/**/*.{ts,tsx}`], rules: restrict([NO_DEEP_IMPORTS, NO_SUPABASE, NO_DATA_LAYER, boundary]) },
    {
      files: [`${base}/domain/**/*.{ts,tsx}`],
      rules: restrict([
        pattern(
          ['react', 'react-native', 'expo', 'expo-*', '@tanstack/*', '@supabase/*', '@/modules', '@/modules/**', '@/design-system', '@/design-system/**'],
          'The domain layer is plain TypeScript with no framework or module dependencies.',
        ),
        NO_DATA_LAYER,
        NO_PRESENTATION,
      ]),
    },
    {
      files: [`${base}/data/**/*.{ts,tsx}`],
      rules: restrict([
        NO_DEEP_IMPORTS,
        NO_UI_KITS,
        pattern(['react', 'react-native', '@tanstack/*'], 'The data layer has no UI or query-cache dependencies.'),
        NO_PRESENTATION,
        boundary,
      ]),
    },
    {
      files: [`${base}/presentation/viewmodels/**/*.{ts,tsx}`],
      rules: restrict([NO_DEEP_IMPORTS, NO_SUPABASE, NO_DATA_LAYER, NO_RENDERING, boundary]),
    },
    {
      files: [`${base}/presentation/views/**/*.{ts,tsx}`, `${base}/presentation/components/**/*.{ts,tsx}`],
      rules: restrict([NO_DEEP_IMPORTS, NO_SUPABASE, NO_DATA_LAYER, NO_LOGIC_IN_VIEWS, boundary]),
    },
    // index.ts is each module's composition seam, so it may name its own data layer.
    { files: [`${base}/index.ts`], rules: restrict([NO_DEEP_IMPORTS, NO_SUPABASE, boundary]) },
  ];
});

module.exports = defineConfig([
  expoConfig,
  { ignores: ['node_modules/*', '.expo/*', 'dist/*', 'supabase/*', '*.config.js'] },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: restrict([NO_MODULES, pattern(['@/design-system', '@/design-system/**', 'expo-router', 'react-native-paper'], 'Core has no UI kit or navigation dependencies.')]),
  },
  {
    files: ['src/design-system/**/*.{ts,tsx}'],
    rules: restrict([NO_MODULES, NO_SUPABASE, pattern(['expo-router'], 'Components receive navigation as props.')]),
  },
  ...moduleLayerRules,
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: restrict([NO_DEEP_IMPORTS, NO_SUPABASE, NO_DATA_LAYER, pattern(['@tanstack/*'], 'Routes only compose modules and navigation.')]),
  },
  { files: ['**/*.test.ts', '**/*.test.tsx'], rules: { 'no-restricted-imports': 'off' } },
]);
