// Jest only defaults this when it is unset. A machine-wide NODE_ENV=production would load
// React's production build, which has no act() and fails every ViewModel test.
process.env.NODE_ENV = 'test';

// babel-preset-expo ships nested inside the expo package.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
      moduleNameMapper,
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-paper|react-native-vector-icons|@supabase/.*))',
      ],
    },
    {
      // Plain Node: the data layer has no React Native dependency, and jest-expo's fetch mock
      // would stop supabase-js from reaching the emulator.
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/*.test.ts'],
      moduleNameMapper,
      transform: { '\\.[jt]sx?$': ['babel-jest', { presets: [babelPresetExpo] }] },
    },
  ],
};
