import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

import { GESTURE_LABELS, type DetectedGestureId } from './gestures';

export interface GestureDetectionResult {
  gestureId: DetectedGestureId;
  label: string;
  confidence: number;
  handCount: number;
  landmarks: NormalizedLandmark[][];
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

let landmarkerPromise: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    })().catch(async () => {
      // Fallback to CPU delegate if WebGL GPU delegate fails on some devices
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/mediapipe/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    }).catch(error => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerExtended(
  lm: NormalizedLandmark[],
  tipIdx: number,
  pipIdx: number,
  mcpIdx: number
): boolean {
  const wrist = lm[0];
  const dTip = dist2D(lm[tipIdx], wrist);
  const dPip = dist2D(lm[pipIdx], wrist);
  const dMcp = dist2D(lm[mcpIdx], wrist);
  return dTip > dPip * 1.12 && dTip > dMcp * 1.25;
}

export function classifyHandLandmarks(hands: NormalizedLandmark[][]): GestureDetectionResult {
  if (!hands || hands.length === 0) {
    return {
      gestureId: 'none',
      label: GESTURE_LABELS.none,
      confidence: 0,
      handCount: 0,
      landmarks: [],
    };
  }

  // Two-hand heart check: both hands' index tips and thumb tips close to each other
  if (hands.length >= 2) {
    const h1 = hands[0];
    const h2 = hands[1];
    const palm = Math.max(0.05, (dist2D(h1[0], h1[9]) + dist2D(h2[0], h2[9])) / 2);
    const indexClose = dist2D(h1[8], h2[8]) / palm < 0.9;
    const thumbClose = dist2D(h1[4], h2[4]) / palm < 0.95;
    if (indexClose && thumbClose) {
      return {
        gestureId: 'heart',
        label: GESTURE_LABELS.heart,
        confidence: 94.5,
        handCount: hands.length,
        landmarks: hands,
      };
    }
  }

  const lm = hands[0];
  const palmSize = Math.max(0.05, dist2D(lm[0], lm[9]));

  const indexUp = isFingerExtended(lm, 8, 6, 5);
  const middleUp = isFingerExtended(lm, 12, 10, 9);
  const ringUp = isFingerExtended(lm, 16, 14, 13);
  const pinkyUp = isFingerExtended(lm, 20, 18, 17);

  const thumbIndexRatio = dist2D(lm[4], lm[8]) / palmSize;
  const indexMiddleSpread = dist2D(lm[8], lm[12]) / palmSize;

  // 1. OK gesture: thumb & index form a circle, middle + ring + pinky extended
  if (thumbIndexRatio < 0.45 && middleUp && ringUp && pinkyUp) {
    return {
      gestureId: 'ok',
      label: GESTURE_LABELS.ok,
      confidence: 95.2,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  // 2. Victory / Scissor (✌️): index & middle extended, ring & pinky curled, fingers separated
  if (indexUp && middleUp && !ringUp && !pinkyUp && indexMiddleSpread > 0.18) {
    return {
      gestureId: 'v',
      label: GESTURE_LABELS.v,
      confidence: 96.4,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  // 3. Thumbs Up (👍): thumb pointing upward above index MCP, all 4 other fingers curled
  const thumbUpward =
    lm[4].y < lm[3].y - 0.015 &&
    lm[4].y < lm[2].y - 0.03 &&
    lm[4].y < lm[5].y &&
    dist2D(lm[4], lm[5]) / palmSize > 0.45;
  if (thumbUpward && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    return {
      gestureId: 'thumb',
      label: GESTURE_LABELS.thumb,
      confidence: 95.8,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  // 4. Single-hand Finger Heart (🫶): thumb & index tips close/crossed while middle/ring/pinky curled
  if (thumbIndexRatio < 0.42 && !middleUp && !ringUp && !pinkyUp && !thumbUpward) {
    return {
      gestureId: 'heart',
      label: GESTURE_LABELS.heart,
      confidence: 92.1,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  // 5. Open palm (🖐️)
  if (indexUp && middleUp && ringUp && pinkyUp) {
    return {
      gestureId: 'open',
      label: GESTURE_LABELS.open,
      confidence: 93.0,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  // 6. Fist (✊)
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    return {
      gestureId: 'fist',
      label: GESTURE_LABELS.fist,
      confidence: 91.5,
      handCount: hands.length,
      landmarks: hands,
    };
  }

  return {
    gestureId: 'unknown',
    label: GESTURE_LABELS.unknown,
    confidence: 72.0,
    handCount: hands.length,
    landmarks: hands,
  };
}

export async function detectGestureFromSource(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<GestureDetectionResult> {
  const landmarker = await getHandLandmarker();
  const res = landmarker.detect(source);
  return classifyHandLandmarks(res.landmarks || []);
}

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  hands: NormalizedLandmark[][],
  width: number,
  height: number,
  isMatched: boolean,
  mirror = false
) {
  ctx.clearRect(0, 0, width, height);
  if (!hands || hands.length === 0) return;

  const strokeColor = isMatched ? '#10b981' : '#f43f5e';
  const dotColor = isMatched ? '#6ee7b7' : '#fda4af';

  hands.forEach((lm) => {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    HAND_CONNECTIONS.forEach(([a, b]) => {
      const p1 = lm[a];
      const p2 = lm[b];
      const x1 = (mirror ? 1 - p1.x : p1.x) * width;
      const y1 = p1.y * height;
      const x2 = (mirror ? 1 - p2.x : p2.x) * width;
      const y2 = p2.y * height;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    lm.forEach((p, idx) => {
      const x = (mirror ? 1 - p.x : p.x) * width;
      const y = p.y * height;
      ctx.beginPath();
      ctx.arc(x, y, idx === 4 || idx === 8 || idx === 12 ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });
}
