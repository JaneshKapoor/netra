/**
 * env.ts — the ONE place in the codebase that reads environment configuration.
 *
 * Everything is sourced from `.env` via react-native-config. Nothing else in the
 * app should import `react-native-config` directly — import from here instead so
 * there is a single typed, validated surface for all configuration.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SECURITY (read before adding anything here):
 *
 * Anything bundled into a mobile app — including values in `.env` — is extractable
 * from the shipped binary. Therefore:
 *
 *   • NEVER put a long-lived AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in `.env`
 *     or anywhere in the client. If a key-based flow is unavoidable for a demo,
 *     isolate it behind an API Gateway + Lambda backend and call that endpoint.
 *   • The app authenticates to AWS using a Cognito *unauthenticated* identity pool
 *     id (safe to embed) OR by POSTing to an API Gateway endpoint that performs
 *     auth server-side. Both the pool id and the endpoint live in `.env`.
 *   • The SQLCipher DB encryption key is NOT an env var. It is generated once with
 *     a CSPRNG at first launch and stored in the device Keychain/Keystore
 *     (see src/storage/db.ts).
 * ──────────────────────────────────────────────────────────────────────────────
 */
import Config from 'react-native-config';

function str(key: string, fallback = ''): string {
  const v = Config[key];
  return v === undefined || v === null || v === '' ? fallback : v;
}

function num(key: string, fallback: number): number {
  const raw = Config[key];
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface NetraEnv {
  // AWS / sync
  readonly AWS_REGION: string;
  readonly SYNC_ENDPOINT: string;
  readonly AWS_COGNITO_IDENTITY_POOL_ID: string;
  // Recognition tuning
  readonly MATCH_THRESHOLD: number;
  readonly LIVENESS_BLINK_THRESHOLD: number;
  readonly LIVENESS_SMILE_THRESHOLD: number;
  readonly LIVENESS_YAW_DEGREES: number;
  // Model
  readonly MODEL_PATH: string;
}

export const env: NetraEnv = {
  AWS_REGION: str('AWS_REGION', 'ap-south-1'),
  SYNC_ENDPOINT: str('SYNC_ENDPOINT'),
  AWS_COGNITO_IDENTITY_POOL_ID: str('AWS_COGNITO_IDENTITY_POOL_ID'),

  MATCH_THRESHOLD: num('MATCH_THRESHOLD', 0.6),
  LIVENESS_BLINK_THRESHOLD: num('LIVENESS_BLINK_THRESHOLD', 0.45),
  LIVENESS_SMILE_THRESHOLD: num('LIVENESS_SMILE_THRESHOLD', 0.5),
  LIVENESS_YAW_DEGREES: num('LIVENESS_YAW_DEGREES', 20),

  MODEL_PATH: str('MODEL_PATH', 'mobilefacenet_int8.tflite'),
};

export default env;
