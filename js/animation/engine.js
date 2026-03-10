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
  var overlay = document.getElementById('processing-overlay');
  if (overlay) overlay.classList.add('active');

  setTimeout(function() {
    try {
      var srcBuf = APP_STATE.sourceBuffer;
      var tgtBuf = APP_STATE.targetBuffer;
      if (!srcBuf || !tgtBuf) {
        showToast('Missing image data.', 'error');
        if (overlay) overlay.classList.remove('active');
        return;
      }

      var mapping = buildMapping(srcBuf, tgtBuf);
      sortMappingByPattern(mapping, APP_STATE.selectedPattern, srcBuf.width);
      APP_STATE.mapping = mapping;

      var size = srcBuf.width;
      var gapPx = Math.max(1, Math.round(size * CONFIG.CANVAS_GAP_RATIO));
      var canvasWidth = size * 2 + gapPx;
      var arrays = buildAnimationArrays(mapping, size, gapPx);
      APP_STATE.sourceXY = arrays.sourceXY;
      APP_STATE.targetXY = arrays.targetXY;
      APP_STATE.colors = arrays.colors;
      APP_STATE.startTimes = arrays.startTimes;
      APP_STATE.tweenDurations = arrays.tweenDurations;
      APP_STATE.easingIndices = arrays.easingIndices;
      APP_STATE.animImageSize = size;
      APP_STATE.animGapPx = gapPx;

      var canvas = document.getElementById('animation-canvas');
      if (!canvas) {
        showToast('Animation canvas not found.', 'error');
        if (overlay) overlay.classList.remove('active');
        return;
      }
      canvas.width = canvasWidth;
      canvas.height = size;

      var maxW = Math.floor(window.innerWidth * 0.95);
      var maxH = Math.floor(window.innerHeight * 0.65);
      var aspectRatio = canvasWidth / size;
      var displayW = Math.min(maxW, Math.floor(maxH * aspectRatio));
      canvas.style.width = displayW + 'px';
      canvas.style.height = Math.floor(displayW / aspectRatio) + 'px';

      var maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
      var departureMs = Math.max(1000, maxTween > 0 ? CONFIG.TARGET_DURATION_S * 1000 - maxTween : 1000);
      APP_STATE.pixelsPerMs = mapping.length / departureMs;
      APP_STATE.animationStartTime = null;
      APP_STATE.animBatchIndex = 0;
      APP_STATE.animSettled = 0;
      APP_STATE.sourceImageCanvas = pixelBufferToCanvas(srcBuf);
      APP_STATE.targetImageCanvas = pixelBufferToCanvas(tgtBuf);
      APP_STATE.animPhase = 'opening_hold';
      APP_STATE.animPhaseStart = null;

      // Draw initial frame before recording so the stream has content
      var initCtx = canvas.getContext('2d');
      var centerX = (canvasWidth - size) / 2;
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
  var canvas = document.getElementById('animation-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (APP_STATE.animPhase !== 'animating') {
    renderBufferFrame(ctx, canvas.width, canvas.height, timestamp);
    if (APP_STATE.animPhase === 'done') { finishAnimation(); return; }
    if (APP_STATE.animPhase === 'animating') APP_STATE.animationStartTime = timestamp;
    APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
    return;
  }

  if (!APP_STATE.animationStartTime) APP_STATE.animationStartTime = timestamp;

  var canvasWidth = canvas.width;
  var canvasHeight = canvas.height;
  var count = APP_STATE.mapping.length;
  var sourceXY = APP_STATE.sourceXY;
  var targetXY = APP_STATE.targetXY;
  var colors = APP_STATE.colors;
  var startTimes = APP_STATE.startTimes;
  var tweenDurations = APP_STATE.tweenDurations;
  var easingIndices = APP_STATE.easingIndices;
  var elapsed = timestamp - APP_STATE.animationStartTime;
  var idealIndex = Math.min(count, Math.floor(elapsed * APP_STATE.pixelsPerMs));
  var defRes = CONFIG.DEFAULT_RESOLUTION;
  var maxInFlight = Math.round(CONFIG.MAX_INFLIGHT * count / (defRes * defRes));
  var targetIndex = Math.min(idealIndex, APP_STATE.animSettled + maxInFlight);

  while (APP_STATE.animBatchIndex < targetIndex) {
    startTimes[APP_STATE.animBatchIndex] = APP_STATE.animationStartTime +
      (APP_STATE.animBatchIndex / APP_STATE.pixelsPerMs);
    APP_STATE.animBatchIndex++;
  }

  var imageData = ctx.createImageData(canvasWidth, canvasHeight);
  var pixels = imageData.data;
  var settled = 0;
  var flightSize = Math.max(CONFIG.PIXEL_FLIGHT_SIZE,
    Math.round(CONFIG.PIXEL_FLIGHT_SIZE * canvasHeight / CONFIG.DEFAULT_RESOLUTION));
  var halfFlight = Math.floor(flightSize / 2);
  var boost = CONFIG.PIXEL_FLIGHT_BOOST;

  // Pass 1: draw stationary pixels (waiting at source or settled at target)
  for (var i = 0; i < count; i++) {
    var st = startTimes[i];
    var sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    var tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    var px, py;
    if (st === 0) {
      px = sx; py = sy;
    } else {
      var pixelElapsed = timestamp - st;
      if (pixelElapsed >= tweenDurations[i]) {
        px = tx; py = ty; settled++;
      } else {
        continue;
      }
    }
    var ix = Math.round(px), iy = Math.round(py);
    if (ix < 0) ix = 0; if (ix >= canvasWidth) ix = canvasWidth - 1;
    if (iy < 0) iy = 0; if (iy >= canvasHeight) iy = canvasHeight - 1;
    var cr = colors[i * 4], cg = colors[i * 4 + 1], cb = colors[i * 4 + 2], ca = colors[i * 4 + 3];
    var off = (iy * canvasWidth + ix) * 4;
    pixels[off] = cr; pixels[off + 1] = cg; pixels[off + 2] = cb; pixels[off + 3] = ca;
  }

  // Pass 2: draw in-flight pixels on top so they are always visible
  for (var i = 0; i < count; i++) {
    var st = startTimes[i];
    if (st === 0) continue;
    var pixelElapsed = timestamp - st;
    var dur = tweenDurations[i];
    if (pixelElapsed >= dur) continue;
    var sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    var tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    var easeFn = EASING_FUNCTIONS[easingIndices[i]];
    var t = easeFn(pixelElapsed / dur);
    var arcScale = 4 * t * (1 - t);
    var px = sx + (tx - sx) * t + Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * arcScale;
    var py = sy + (ty - sy) * t + Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * arcScale;
    var ix = Math.round(px), iy = Math.round(py);
    var cr = colors[i * 4], cg = colors[i * 4 + 1], cb = colors[i * 4 + 2], ca = colors[i * 4 + 3];
    var br = Math.min(255, cr + boost), bg = Math.min(255, cg + boost), bb = Math.min(255, cb + boost);
    for (var dy = -halfFlight; dy < flightSize - halfFlight; dy++) {
      var wy = iy + dy;
      if (wy < 0 || wy >= canvasHeight) continue;
      for (var dx = -halfFlight; dx < flightSize - halfFlight; dx++) {
        var wx = ix + dx;
        if (wx < 0 || wx >= canvasWidth) continue;
        var off = (wy * canvasWidth + wx) * 4;
        pixels[off] = br; pixels[off + 1] = bg; pixels[off + 2] = bb; pixels[off + 3] = ca;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  drawWatermark(ctx, canvasWidth, canvasHeight);

  APP_STATE.animSettled = settled;
  var pct = count > 0 ? (settled / count) * 100 : 0;
  var fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = pct + '%';
  var text = document.getElementById('progress-text');
  if (text) text.textContent = 'Rearranging ' + settled + ' of ' + count + ' pixels\u2026';

  if (settled >= count) {
    var size = APP_STATE.animImageSize;
    var resultImg = document.createElement('canvas');
    resultImg.width = size;
    resultImg.height = size;
    var rCtx = resultImg.getContext('2d');
    if (rCtx) rCtx.drawImage(canvas, size + APP_STATE.animGapPx, 0, size, size, 0, 0, size, size);
    APP_STATE.targetImageCanvas = resultImg;
    APP_STATE.animPhase = 'closing_slide';
    APP_STATE.animPhaseStart = null;
  }
  APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
}
