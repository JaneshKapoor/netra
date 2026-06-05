/**
 * globals.d.ts — ambient types for runtime polyfills.
 *
 * `react-native-get-random-values` installs a Web-Crypto `getRandomValues`
 * onto the global `crypto` object but ships no type declarations, so we declare
 * the minimal surface the app uses (CSPRNG for the DB key + UUIDs).
 */
declare global {
  var crypto: {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  };
}

export {};
