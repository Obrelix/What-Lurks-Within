'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { easeInOutCubic, EASING_FUNCTIONS } from '../utils.js';
import { showScreen } from '../ui/screens.js';
import { drawWatermark } from '../video/recorder.js';

// ═══════════════════════════════════════════
// TYPED ARRAY BUILDER
// ═══════════════════════════════════════════

/**
 * @description Deterministic hash for per-pixel randomisation (Knuth multiplicative hash).
 * @param {number} i - Pixel index
 * @returns {number} Pseudo-random value in [0, 1)
 */
function pixelHash(i) {
  return ((i * 2654435761) >>> 0) / 4294967296;
}

/**
 * @description Builds pre-allocated typed arrays for the animation loop.
 * @param {Array} mapping - The pixel mapping array
 * @param {number} width - Image width (square dimension)
 * @param {number} gapPx - Gap width in pixels between source and target rectangles
 * @returns {{ sourceXY: Float32Array, targetXY: Float32Array, colors: Uint8ClampedArray, startTimes: Float64Array, tweenDurations: Float32Array, easingIndices: Uint8Array }}
 */
export function buildAnimationArrays(mapping, width, gapPx) {
  const count = mapping.length;
  const sourceXY = new Float32Array(count * 2);
  const targetXY = new Float32Array(count * 2);
  const colors = new Uint8ClampedArray(count * 4);
  const startTimes = new Float64Array(count);
  const tweenDurations = new Float32Array(count);
  const easingIndices = new Uint8Array(count);
  const targetOffsetX = width + gapPx;
  const baseDur = CONFIG.TWEEN_DURATION_MS;
  const variance = CONFIG.TWEEN_SPEED_VARIANCE;
  const easingCount = EASING_FUNCTIONS.length;

  for (let i = 0; i < count; i++) {
    const m = mapping[i];
    sourceXY[i * 2] = m.sourceIndex % width;
    sourceXY[i * 2 + 1] = Math.floor(m.sourceIndex / width);
    targetXY[i * 2] = (m.targetIndex % width) + targetOffsetX;
    targetXY[i * 2 + 1] = Math.floor(m.targetIndex / width);
    colors[i * 4] = m.r;
    colors[i * 4 + 1] = m.g;
    colors[i * 4 + 2] = m.b;
    colors[i * 4 + 3] = m.a;
    startTimes[i] = 0;

    const h = pixelHash(i);
    tweenDurations[i] = baseDur * (1 + (h * 2 - 1) * variance);
    easingIndices[i] = Math.floor(pixelHash(i + 99991) * easingCount);
  }

  return {
    sourceXY: sourceXY, targetXY: targetXY, colors: colors, startTimes: startTimes,
    tweenDurations: tweenDurations, easingIndices: easingIndices
  };
}

// ═══════════════════════════════════════════
// BUFFER PHASE RENDERER
// ═══════════════════════════════════════════

/**
 * @description Renders a single frame for the current buffer phase (opening or closing).
 *              Mutates APP_STATE.animPhase and animPhaseStart to advance the state machine.
 * @param {CanvasRenderingContext2D} ctx - Display canvas context
 * @param {number} canvasWidth - Full wide canvas width
 * @param {number} canvasHeight - Canvas height (= image size)
 * @param {number} timestamp - rAF timestamp
 */
export function renderBufferFrame(ctx, canvasWidth, canvasHeight, timestamp) {
  const phase = APP_STATE.animPhase;
  const size = APP_STATE.animImageSize;
  const gapPx = APP_STATE.animGapPx;
  const centerX = (canvasWidth - size) / 2;
  const slideMs = CONFIG.VIDEO_BUFFER_SLIDE_MS;

  if (!APP_STATE.animPhaseStart) APP_STATE.animPhaseStart = timestamp;
  const elapsed = timestamp - APP_STATE.animPhaseStart;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (phase === 'opening_hold') {
    ctx.drawImage(APP_STATE.sourceImageCanvas, centerX, 0);
    drawWatermark(ctx, canvasWidth, canvasHeight);
    if (elapsed >= CONFIG.VIDEO_BUFFER_OPEN_MS - slideMs) {
      APP_STATE.animPhase = 'opening_slide';
      APP_STATE.animPhaseStart = null;
    }
    return;
  }

  if (phase === 'opening_slide') {
    const t = Math.min(1, elapsed / slideMs);
    ctx.drawImage(APP_STATE.sourceImageCanvas, centerX * (1 - easeInOutCubic(t)), 0);
    drawWatermark(ctx, canvasWidth, canvasHeight);
    if (t >= 1) {
      APP_STATE.animPhase = 'animating';
      APP_STATE.animPhaseStart = null;
    }
    return;
  }

  if (phase === 'closing_slide') {
    const tc = Math.min(1, elapsed / slideMs);
    const fromX = size + gapPx;
    ctx.drawImage(APP_STATE.targetImageCanvas, fromX + (centerX - fromX) * easeInOutCubic(tc), 0);
    drawWatermark(ctx, canvasWidth, canvasHeight);
    if (tc >= 1) {
      APP_STATE.animPhase = 'closing_hold';
      APP_STATE.animPhaseStart = null;
    }
    return;
  }

  if (phase === 'closing_hold') {
    ctx.drawImage(APP_STATE.targetImageCanvas, centerX, 0);
    drawWatermark(ctx, canvasWidth, canvasHeight);
    if (elapsed >= CONFIG.VIDEO_BUFFER_CLOSE_MS - slideMs) {
      APP_STATE.animPhase = 'done';
    }
  }
}

// ═══════════════════════════════════════════
// FINISH ANIMATION
// ═══════════════════════════════════════════

/**
 * @description Called when animation completes — transitions to result screen.
 */
export function finishAnimation() {
  if (APP_STATE.animationFrameId) {
    cancelAnimationFrame(APP_STATE.animationFrameId);
    APP_STATE.animationFrameId = null;
  }

  const videoBtn = document.getElementById('btn-download-video');
  if (videoBtn) videoBtn.disabled = false;

  const resultCanvas = document.getElementById('result-canvas');
  if (resultCanvas && APP_STATE.targetImageCanvas) {
    const size = APP_STATE.animImageSize || APP_STATE.selectedResolution;
    resultCanvas.width = size;
    resultCanvas.height = size;
    const displaySize = Math.min(
      Math.floor(window.innerWidth * 0.85),
      Math.floor(window.innerHeight * 0.65)
    );
    resultCanvas.style.width = displaySize + 'px';
    resultCanvas.style.height = displaySize + 'px';
    const ctx = resultCanvas.getContext('2d');
    if (ctx) ctx.drawImage(APP_STATE.targetImageCanvas, 0, 0);
  }

  const elapsed = APP_STATE.animationStartTime
    ? ((performance.now() - APP_STATE.animationStartTime) / 1000).toFixed(1)
    : '?';
  const stats = document.getElementById('result-stats');
  if (stats) {
    stats.textContent = APP_STATE.selectedResolution + '\u00d7' + APP_STATE.selectedResolution +
      ' \u2022 ' + APP_STATE.selectedPattern.replace(/_/g, ' ') +
      ' \u2022 ' + elapsed + 's';
  }

  showScreen('result');
}
