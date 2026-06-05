# Netra — Offline Face Attendance + Active Liveness

Netra is a cross-platform (Android 8.0+ / iOS 12+) React Native module + demo app
for **fully offline** facial recognition and **active liveness detection**, built
for field-personnel attendance. The core auth flow (enroll + verify) needs **no
network**. Attendance rows are persisted **encrypted** on-device and are
**synced-and-purged** to a backend only once connectivity returns.

> Prototype for an NHAI hackathon. No model is trained or fine-tuned — a
> pretrained, open-source MobileFaceNet `.tflite` embedder is used as-is.

## Architecture

```
Camera (VisionCamera v4, front)
  └─ Frame Processor (worklet)
       ├─ Face detector (ML Kit) → LivenessSignals ──► useLiveness (challenge FSM)
       └─ on capture: crop+resize 112×112 → MobileFaceNet (fast-tflite) → embedding
                                                          │
                       ┌──────────────────────────────────┘
                       ▼
   match.ts (cosine + threshold)        enroll.ts (average + L2-normalize)
                       │                               │
                       ▼                               ▼
            Encrypted SQLite (SQLCipher via op-sqlite) ── key in Keychain/Keystore
                       │
                       ▼
        syncEngine.ts (netinfo) → POST SYNC_ENDPOINT → mark synced → purge
```

| Layer | Files |
|-------|-------|
| Config (single source) | `src/config/env.ts` |
| Camera + worklet | `src/camera/CameraView.tsx` |
| Liveness | `src/liveness/challenges.ts`, `src/liveness/useLiveness.ts` |
| Recognition | `src/recognition/embedder.ts`, `match.ts`, `enroll.ts`, `useFaceCapture.ts` |
| Storage (encrypted) | `src/storage/db.ts`, `src/storage/repo.ts` |
| Sync + purge | `src/sync/syncEngine.ts`, `src/sync/useSyncEngine.ts` |
| UI | `App.tsx`, `src/screens/*`, `src/components/*` |

## Model — source, license, footprint

- **Model:** MobileFaceNet, INT8-quantized, `assets/models/mobilefacenet_int8.tflite`.
- **Footprint:** ~5 MB (well under a 20 MB budget); 112×112 RGB input, 1-D
  embedding output. Inference runs inside the frame-processor worklet (CPU by
  default; enable CoreML / Android GPU delegates in `useEmbedder` for extra speed).
- **License:** MobileFaceNet is published under permissive open-source terms
  (Apache-2.0). Verify and record the exact source + checksum you ship.
  SHA-256 of the bundled file:
  `b67366e085ec9f6c2afb05c10397a46edeb823367abaec77f64f5ce946ac2847`.
- **No training:** the embedder is used as-is. Liveness is **geometric/derived**
  from face signals — there is no separate liveness model.

> **Open-source compliance note:** landmarks/blendshapes currently come from ML
> Kit via `react-native-vision-camera-face-detector`. There is a `// TODO` in
> `CameraView.tsx` to swap to **MediaPipe Face Landmarker** (Apache-2.0) once its
> RN binding is stable, for a fully open-source pipeline.

## Prerequisites

- Node ≥ 18, Yarn or npm, Watchman (macOS).
- **Android:** JDK 17, Android SDK, an emulator or device (API 26+).
- **iOS:** Xcode 15+, CocoaPods, a physical device recommended (camera).

## Setup

```sh
# 1. Install JS deps
npm install

# 2. Configure environment (NON-SECRET values only — see SECURITY below)
cp .env.example .env
#   then edit .env with your AWS region / sync endpoint / thresholds

# 3. iOS native deps
cd ios && pod install && cd ..
```

### `.env`

All configuration lives in `.env` and is read **only** through `src/config/env.ts`.
`.env.example` is committed; `.env` is git-ignored.

| Key | Meaning |
|-----|---------|
| `AWS_REGION` | AWS region for the sync backend. |
| `SYNC_ENDPOINT` | API Gateway URL the engine POSTs attendance batches to. |
| `AWS_COGNITO_IDENTITY_POOL_ID` | Unauthenticated identity pool id (safe to embed). |
| `MATCH_THRESHOLD` | Cosine-similarity threshold for a positive match (default 0.6). |
| `LIVENESS_BLINK_THRESHOLD` | Eye-open probability below which eyes count as closed. |
| `LIVENESS_SMILE_THRESHOLD` | Smile probability required for the smile challenge. |
| `LIVENESS_YAW_DEGREES` | Head-yaw degrees required for the turn challenge. |
| `MODEL_PATH` | Model filename (mirrors the Metro asset; documents native path). |

## Run

```sh
npm start            # Metro
npm run android      # build + run Android
npm run ios          # build + run iOS
```

Then on the Home screen: **Enroll a person** (enter an id, complete the liveness
challenge, hold still while 5 samples are captured), then **Verify + log
attendance**. Toggle airplane mode to see the offline banner; re-enable
connectivity to watch the sync-and-purge log.

## Tests

```sh
npm test
```

The pure, native-free core — recognition matching (`match.ts`) and liveness
predicates (`challenges.ts`) — is unit-tested in `__tests__/`. The camera,
storage and sync layers depend on native modules and are validated on-device.

## Security

- **No long-lived AWS keys in the client — ever.** `SYNC_ENDPOINT` should front
  an API Gateway + Lambda that performs auth server-side; the app may also use a
  Cognito *unauthenticated* identity pool. See the SECURITY note in
  `src/config/env.ts`.
- The **SQLCipher DB key** is generated once with a CSPRNG at first launch and
  stored in the iOS Keychain / Android Keystore (`react-native-keychain`). It is
  never an env var and never in source.
- Attendance rows are **purged only after a successful sync ACK**; an
  `idempotencyKey` lets the backend dedupe retries safely.

## Backend integration (sync target)

`SYNC_ENDPOINT` receives `POST` requests with body:

```json
{ "records": [ { "id", "personId", "ts", "lat", "lng", "idempotencyKey" } ] }
```

Respond `200 OK` to ACK a batch; the device then marks those rows synced and
purges them. Any non-2xx aborts the pass and the rows remain for the next retry.

## Performance notes

- End-to-end (liveness pass → embedding → match) targets **< 1 s** on a mid-range
  device. Detection + inference run in the worklet, keeping the JS thread free.
- For more speed, enable hardware delegates in `useEmbedder` (`'core-ml'` on iOS,
  `'android-gpu'` / NNAPI on Android) — traded against first-load reliability.
