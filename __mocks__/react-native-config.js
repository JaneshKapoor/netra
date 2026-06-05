/**
 * Jest manual mock for react-native-config.
 *
 * The real module ships ESM that Jest doesn't transform and reads values from
 * native at runtime. Under test we return an empty config object so the typed
 * wrapper in src/config/env.ts falls back to its built-in defaults.
 */
module.exports = {
  __esModule: true,
  default: {},
};
