'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { EASING_FUNCTIONS } from '../utils.js';
import { showScreen } from '../ui/screens.js';
import { showToast } from '../ui/toast.js';
import { buildMapping } from '../algorithm/pixel-alchemy.js';
import { sortMappingByPattern } from '../algorithm/patterns.js';
import { pixelBufferToCanvas, drawWatermark } from '../video/recorder.js';
import { buildAnimationArrays, renderBufferFrame, finishAnimation } from './buffer-phases.js';

// Re-export for external consumers
export { buildAnimationArrays, finishAnimation };

// ═══════════════════════════════════════════
// ANIMATION ENGINE
// ═══════════════════════════════════════════

/**
 * @description Starts the pixel reveal animation.
 */
export function startReveal() {
  const overlay = document.getElementById('processing-overlay');
  if (overlay) overlay.classList.add('active');

  setTimeout(function() {
    try {
      const srcBuf = APP_STATE.sourceBuffer;
      const tgtBuf = APP_STATE.targetBuffer;
      if (!srcBuf || !tgtBuf) {
        showToast('Missing image data.', 'error');
        if (overlay) overlay.classList.remove('active');
        return;
      }

      const mapping = buildMapping(srcBuf, tgtBuf);
      sortMappingByPattern(mapping, APP_STATE.selectedPattern, srcBuf.width);
      APP_STATE.mapping = mapping;

      const size = srcBuf.width;
      const gapPx = Math.max(1, Math.round(size * CONFIG.CANVAS_GAP_RATIO));
      const canvasWidth = size * 2 + gapPx;
      const arrays = buildAnimationArrays(mapping, size, gapPx);
      APP_STATE.sourceXY = arrays.sourceXY;
      APP_STATE.targetXY = arrays.targetXY;
      APP_STATE.colors = arrays.colors;
      APP_STATE.startTimes = arrays.startTimes;
      APP_STATE.tweenDurations = arrays.tweenDurations;
      APP_STATE.easingIndices = arrays.easingIndices;
      APP_STATE.animImageSize = size;
      APP_STATE.animGapPx = gapPx;

      const canvas = document.getElementById('animation-canvas');
      if (!canvas) {
        showToast('Animation canvas not found.', 'error');
        if (overlay) overlay.classList.remove('active');
        return;
      }
      canvas.width = canvasWidth;
      canvas.height = size;

      const maxW = Math.floor(window.innerWidth * 0.95);
      const maxH = Math.floor(window.innerHeight * 0.65);
      const aspectRatio = canvasWidth / size;
      const displayW = Math.min(maxW, Math.floor(maxH * aspectRatio));
      canvas.style.width = displayW + 'px';
      canvas.style.height = Math.floor(displayW / aspectRatio) + 'px';

      const maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
      const departureMs = Math.max(1000, maxTween > 0 ? CONFIG.TARGET_DURATION_S * 1000 - maxTween : 1000);
      APP_STATE.pixelsPerMs = mapping.length / departureMs;
      APP_STATE.animationStartTime = null;
      APP_STATE.animBatchIndex = 0;
      APP_STATE.animSettled = 0;
      APP_STATE.sourceImageCanvas = pixelBufferToCanvas(srcBuf);
      APP_STATE.targetImageCanvas = pixelBufferToCanvas(tgtBuf);
      APP_STATE.animPhase = 'opening_hold';
      APP_STATE.animPhaseStart = null;
      APP_STATE.animImageData = new ImageData(canvasWidth, size);

      // Draw initial frame before recording so the stream has content
      const initCtx = canvas.getContext('2d');
      const centerX = (canvasWidth - size) / 2;
      initCtx.clearRect(0, 0, canvasWidth, size);
      initCtx.drawImage(APP_STATE.sourceImageCanvas, centerX, 0);

      if (overlay) overlay.classList.remove('active');
      showScreen('animation');
      APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
    } catch (err) {
      if (overlay) overlay.classList.remove('active');
      showToast('Error building mapping: ' + err.message, 'error');
    }
  }, 0);
}

// ═══════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════

/**
 * @description The main animation loop — handles buffer phases and pixel rendering.
 * @param {number} timestamp - rAF timestamp
 */
function animationLoop(timestamp) {
  if (APP_STATE.currentScreen !== 'animation') return;
  const canvas = document.getElementById('animation-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (APP_STATE.animPhase !== 'animating') {
    renderBufferFrame(ctx, canvas.width, canvas.height, timestamp);
    if (APP_STATE.animPhase === 'done') { finishAnimation(); return; }
    if (APP_STATE.animPhase === 'animating') APP_STATE.animationStartTime = timestamp;
    APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
    return;
  }

  if (!APP_STATE.animationStartTime) APP_STATE.animationStartTime = timestamp;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const count = APP_STATE.mapping.length;
  const sourceXY = APP_STATE.sourceXY;
  const targetXY = APP_STATE.targetXY;
  const colors = APP_STATE.colors;
  const startTimes = APP_STATE.startTimes;
  const tweenDurations = APP_STATE.tweenDurations;
  const easingIndices = APP_STATE.easingIndices;
  const elapsed = timestamp - APP_STATE.animationStartTime;
  const idealIndex = Math.min(count, Math.floor(elapsed * APP_STATE.pixelsPerMs));
  const defRes = CONFIG.DEFAULT_RESOLUTION;
  const maxInFlight = Math.round(CONFIG.MAX_INFLIGHT * count / (defRes * defRes));
  const targetIndex = Math.min(idealIndex, APP_STATE.animSettled + maxInFlight);

  while (APP_STATE.animBatchIndex < targetIndex) {
    startTimes[APP_STATE.animBatchIndex] = APP_STATE.animationStartTime +
      (APP_STATE.animBatchIndex / APP_STATE.pixelsPerMs);
    APP_STATE.animBatchIndex++;
  }

  const imageData = APP_STATE.animImageData;
  const pixels = imageData.data;
  pixels.fill(0);
  let settled = 0;
  const flightSize = Math.max(CONFIG.PIXEL_FLIGHT_SIZE,
    Math.round(CONFIG.PIXEL_FLIGHT_SIZE * canvasHeight / CONFIG.DEFAULT_RESOLUTION));
  const halfFlight = Math.floor(flightSize / 2);
  const boost = CONFIG.PIXEL_FLIGHT_BOOST;

  // Pass 1: draw stationary pixels (waiting at source or settled at target)
  for (let i = 0; i < count; i++) {
    const st = startTimes[i];
    const sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    const tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    let px, py;
    if (st === 0) {
      px = sx; py = sy;
    } else {
      const pixelElapsed = timestamp - st;
      if (pixelElapsed >= tweenDurations[i]) {
        px = tx; py = ty; settled++;
      } else {
        continue;
      }
    }
    let ix = Math.round(px), iy = Math.round(py);
    if (ix < 0) ix = 0; if (ix >= canvasWidth) ix = canvasWidth - 1;
    if (iy < 0) iy = 0; if (iy >= canvasHeight) iy = canvasHeight - 1;
    const cr = colors[i * 4], cg = colors[i * 4 + 1], cb = colors[i * 4 + 2], ca = colors[i * 4 + 3];
    const off = (iy * canvasWidth + ix) * 4;
    pixels[off] = cr; pixels[off + 1] = cg; pixels[off + 2] = cb; pixels[off + 3] = ca;
  }

  // Pass 2: draw in-flight pixels on top so they are always visible
  for (let i = 0; i < count; i++) {
    const st = startTimes[i];
    if (st === 0) continue;
    const pixelElapsed = timestamp - st;
    const dur = tweenDurations[i];
    if (pixelElapsed >= dur) continue;
    const sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    const tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    const easeFn = EASING_FUNCTIONS[easingIndices[i]];
    const t = easeFn(pixelElapsed / dur);
    const arcScale = 4 * t * (1 - t);
    const px = sx + (tx - sx) * t + Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * arcScale;
    const py = sy + (ty - sy) * t + Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * arcScale;
    let ix = Math.round(px), iy = Math.round(py);
    const cr = colors[i * 4], cg = colors[i * 4 + 1], cb = colors[i * 4 + 2], ca = colors[i * 4 + 3];
    const br = Math.min(255, cr + boost), bg = Math.min(255, cg + boost), bb = Math.min(255, cb + boost);
    for (let dy = -halfFlight; dy < flightSize - halfFlight; dy++) {
      const wy = iy + dy;
      if (wy < 0 || wy >= canvasHeight) continue;
      for (let dx = -halfFlight; dx < flightSize - halfFlight; dx++) {
        const wx = ix + dx;
        if (wx < 0 || wx >= canvasWidth) continue;
        const off = (wy * canvasWidth + wx) * 4;
        pixels[off] = br; pixels[off + 1] = bg; pixels[off + 2] = bb; pixels[off + 3] = ca;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  drawWatermark(ctx, canvasWidth, canvasHeight);

  APP_STATE.animSettled = settled;
  const pct = count > 0 ? (settled / count) * 100 : 0;
  const fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = pct + '%';
  const text = document.getElementById('progress-text');
  if (text) text.textContent = 'Rearranging ' + settled + ' of ' + count + ' pixels\u2026';

  if (settled >= count) {
    const size = APP_STATE.animImageSize;
    const resultImg = document.createElement('canvas');
    resultImg.width = size;
    resultImg.height = size;
    const rCtx = resultImg.getContext('2d');
    if (rCtx) rCtx.drawImage(canvas, size + APP_STATE.animGapPx, 0, size, size, 0, 0, size, size);
    APP_STATE.targetImageCanvas = resultImg;
    APP_STATE.animPhase = 'closing_slide';
    APP_STATE.animPhaseStart = null;
  }
  APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
}
