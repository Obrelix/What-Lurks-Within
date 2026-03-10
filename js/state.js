'use strict';

import { CONFIG } from './config.js';

// ═══════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════
export const APP_STATE = {
  currentScreen: 'landing',
  sourceBuffer: null,
  targetBuffer: null,
  mapping: null,
  selectedResolution: CONFIG.DEFAULT_RESOLUTION,
  selectedPattern: 'luminance_ordered',
  targetMode: 'fate',
  animationFrameId: null,
  noiseFrameId: null,
  sourceObjectURL: null,
  targetObjectURL: null,
  animationStartTime: null,

  // Typed arrays for animation (allocated in Phase 4)
  sourceXY: null,
  targetXY: null,
  colors: null,
  startTimes: null,
  tweenDurations: null,
  easingIndices: null,

  // Dual-canvas layout (allocated in Phase 6)
  animImageSize: null,
  animGapPx: null,
  pixelsPerMs: 0,

  // Ranked default image targets (Phase 9)
  rankedTargets: null,
  rankedTargetIndex: 0,

  // Video recording (Phase 16 — offline render)
  recordedVideoBlob: null,
  resolvedVideoMime: null,

  // HD recording toggle (Phase 19)
  hdRecording: false,

  // Buffer phase state machine (Phase 14d)
  animPhase: null,
  animPhaseStart: null,
  sourceImageCanvas: null,
  targetImageCanvas: null
};
