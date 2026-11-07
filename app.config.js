// Expo Go only opens an uploaded update whose runtime version names its SDK, so that value is used
// only when publishing for Expo Go (EXPO_GO_UPDATE=1). Store builds keep the normal policy.
module.exports = ({ config }) => ({
  ...config,
  runtimeVersion: process.env.EXPO_GO_UPDATE ? `exposdk:${require('expo/package.json').version.split('.')[0]}.0.0` : { policy: 'appVersion' },
});
