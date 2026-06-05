/**
 * embedder.ts — MobileFaceNet face embedder (react-native-fast-tflite).
 *
 * The `.tflite` model is bundled as a Metro asset (see metro.config.js + the
 * `MODEL_PATH` note in .env). Pre-processing crops + resizes the detected face
 * to 112x112 RGB via vision-camera-resize-plugin and normalizes to the range the
 * model expects, then runs inference and returns the embedding vector.
 *
 * The crop + resize + inference all run inside the Frame Processor worklet
 * (worklets-core) so the JS thread stays free (<1s end-to-end on mid-range).
 */
import { useTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import { useResizePlugin, type ResizePlugin } from 'vision-camera-resize-plugin';
import type { Frame } from 'react-native-vision-camera';
import type { Bounds } from 'react-native-vision-camera-face-detector';

// react-native-fast-tflite v3 exposes the model as a Nitro HybridObject. The
// `.inputs` / `.outputs` getters require the C++ NativeState attached to the
// JS instance — that state does NOT survive the worklet boundary, and may be
// unavailable across re-renders. Rather than try to snapshot the dtypes on
// the JS thread (which still hits the same getter), we hardcode them: the
// bundled MobileFaceNet model has been inspected offline (Python tflite) and
// is float32 in / float32 out. If you swap the .tflite asset, update these.
type TensorDataType = 'uint8' | 'float32';
const MODEL_INPUT_DTYPE: TensorDataType = 'float32';
const MODEL_OUTPUT_DTYPE: TensorDataType = 'float32';

// NOTE: require() is static (Metro), so the model file name here is the source
// of truth for bundling. `env.MODEL_PATH` documents/mirrors it for native code.
const MODEL = require('../../assets/models/mobilefacenet_int8.tflite');

export const INPUT_SIZE = 112;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute a padded, square, frame-clamped crop around a detected face.
 * Runs in the worklet. Coordinates are in frame pixel space.
 */
export function faceCropRect(bounds: Bounds, frameWidth: number, frameHeight: number): CropRect {
  'worklet';
  const pad = 0.2;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const side = Math.max(bounds.width, bounds.height) * (1 + pad);
  let x = cx - side / 2;
  let y = cy - side / 2;
  let w = side;
  let h = side;
  if (x < 0) { x = 0; }
  if (y < 0) { y = 0; }
  if (x + w > frameWidth) { w = frameWidth - x; }
  if (y + h > frameHeight) { h = frameHeight - y; }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

/**
 * Crop+resize the face to 112x112, run MobileFaceNet, return the embedding.
 * Worklet — call from inside a Frame Processor. `inputType` / `outputType`
 * must be resolved on the JS thread and passed in (see comment at top).
 */
export function frameToEmbedding(
  frame: Frame,
  resize: ResizePlugin,
  model: TfliteModel,
  crop: CropRect,
  inputType: TensorDataType,
  outputType: TensorDataType,
): number[] {
  'worklet';
  let inputBuffer: ArrayBuffer;
  if (inputType === 'uint8') {
    const u = resize.resize(frame, {
      crop,
      scale: { width: INPUT_SIZE, height: INPUT_SIZE },
      pixelFormat: 'rgb',
      dataType: 'uint8',
    });
    inputBuffer = u.buffer as ArrayBuffer;
  } else {
    const f = resize.resize(frame, {
      crop,
      scale: { width: INPUT_SIZE, height: INPUT_SIZE },
      pixelFormat: 'rgb',
      dataType: 'float32',
    });
    // resize-plugin float32 output is [0,1]; MobileFaceNet expects ~[-1,1].
    const norm = new Float32Array(f.length);
    for (let i = 0; i < f.length; i++) {
      norm[i] = f[i] * 2 - 1;
    }
    inputBuffer = norm.buffer;
  }
  const outputs = model.runSync([inputBuffer]);
  const raw = outputType === 'uint8'
    ? Array.from(new Uint8Array(outputs[0]))
    : Array.from(new Float32Array(outputs[0]));
  return raw;
}

export type EmbedderState = 'loading' | 'loaded' | 'error';

export interface EmbedderHandle {
  model: TfliteModel | undefined;
  resize: ResizePlugin;
  state: EmbedderState;
  /** Snapshotted on the JS thread; safe to read inside a worklet. */
  inputDataType?: TensorDataType;
  outputDataType?: TensorDataType;
  error?: Error;
}

/**
 * Hook that loads the model + resize plugin for use in a Frame Processor.
 * Delegates default to CPU for reliability; enable 'core-ml' / 'android-gpu'
 * in production for extra speed (see README perf notes).
 */
export function useEmbedder(): EmbedderHandle {
  const plugin = useTensorflowModel(MODEL, []);
  const resize = useResizePlugin();
  if (plugin.state === 'loaded') {
    return {
      model: plugin.model,
      resize,
      state: 'loaded',
      inputDataType: MODEL_INPUT_DTYPE,
      outputDataType: MODEL_OUTPUT_DTYPE,
    };
  }
  if (plugin.state === 'error') {
    return { model: undefined, resize, state: 'error', error: plugin.error };
  }
  return { model: undefined, resize, state: 'loading' };
}
