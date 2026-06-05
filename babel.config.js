module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Required for react-native-worklets-core (vision-camera frame processors +
  // vision-camera-resize-plugin run on a worklet runtime). Keep this LAST.
  plugins: ['react-native-worklets-core/plugin'],
};
