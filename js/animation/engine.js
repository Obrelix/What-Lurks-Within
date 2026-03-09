'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { easeInOutCubic } from '../utils.js';
import { showScreen } from '../ui/screens.js';
import { showToast } from '../ui/toast.js';
import { buildMapping } from '../algorithm/pixel-alchemy.js';
import { sortMappingByPattern } from '../algorithm/patterns.js';
import { startRecording, stopRecording, createRecordingCanvas, updateRecordingFrame } from '../video/recorder.js';

// ═══════════════════════════════════════════
// ANIMATION ENGINE
// ═══════════════════════════════════════════

/**
 * @description Builds pre-allocated typed arrays for the animation loop.
 * @param {Array} mapping - The pixel mapping array
 * @param {number} width - Image width (square dimension)
 * @param {number} gapPx - Gap width in pixels between source and target rectangles
 * @returns {{ sourceXY: Float32Array, targetXY: Float32Array, colors: Uint8ClampedArray, startTimes: Float64Array }}
 */
export function buildAnimationArrays(mapping, width, gapPx) {
  var count = mapping.length;
  var sourceXY = new Float32Array(count * 2);
  var targetXY = new Float32Array(count * 2);
  var colors = new Uint8ClampedArray(count * 4);
  var startTimes = new Float64Array(count);
  var targetOffsetX = width + gapPx;

  for (var i = 0; i < count; i++) {
    var m = mapping[i];
    sourceXY[i * 2] = m.sourceIndex % width;
    sourceXY[i * 2 + 1] = Math.floor(m.sourceIndex / width);
    targetXY[i * 2] = (m.targetIndex % width) + targetOffsetX;
    targetXY[i * 2 + 1] = Math.floor(m.targetIndex / width);
    colors[i * 4] = m.r;
    colors[i * 4 + 1] = m.g;
    colors[i * 4 + 2] = m.b;
    colors[i * 4 + 3] = m.a;
    startTimes[i] = 0;
  }

  return {
    sourceXY: sourceXY,
    targetXY: targetXY,
    colors: colors,
    startTimes: startTimes
  };
}

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
      var displayH = Math.floor(displayW / aspectRatio);
      canvas.style.width = displayW + 'px';
      canvas.style.height = displayH + 'px';

      var departureMs = Math.max(1000, CONFIG.TARGET_DURATION_S * 1000 - CONFIG.TWEEN_DURATION_MS);
      APP_STATE.pixelsPerMs = mapping.length / departureMs;

      APP_STATE.animationStartTime = null;
      APP_STATE.animBatchIndex = 0;
      APP_STATE.animSettled = 0;

      var recCanvas = createRecordingCanvas(size);
      APP_STATE.recordingCanvas = recCanvas;

      if (overlay) overlay.classList.remove('active');
      showScreen('animation');
      startRecording(recCanvas);
      APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
    } catch (err) {
      if (overlay) overlay.classList.remove('active');
      showToast('Error building mapping: ' + err.message, 'error');
    }
  }, 0);
}

/**
 * @description The main animation loop — renders pixels each frame.
 * @param {number} timestamp - rAF timestamp
 */
function animationLoop(timestamp) {
  if (APP_STATE.currentScreen !== 'animation') return;

  if (!APP_STATE.animationStartTime) {
    APP_STATE.animationStartTime = timestamp;
  }

  var canvas = document.getElementById('animation-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var canvasWidth = canvas.width;
  var canvasHeight = canvas.height;
  var count = APP_STATE.mapping.length;
  var sourceXY = APP_STATE.sourceXY;
  var targetXY = APP_STATE.targetXY;
  var colors = APP_STATE.colors;
  var startTimes = APP_STATE.startTimes;
  var tweenDur = CONFIG.TWEEN_DURATION_MS;

  var elapsed = timestamp - APP_STATE.animationStartTime;
  var idealIndex = Math.min(count, Math.floor(elapsed * APP_STATE.pixelsPerMs));
  var maxByInflight = APP_STATE.animSettled + CONFIG.MAX_INFLIGHT;
  var targetIndex = Math.min(idealIndex, maxByInflight);

  while (APP_STATE.animBatchIndex < targetIndex) {
    startTimes[APP_STATE.animBatchIndex] = APP_STATE.animationStartTime +
      (APP_STATE.animBatchIndex / APP_STATE.pixelsPerMs);
    APP_STATE.animBatchIndex++;
  }

  var imageData = ctx.createImageData(canvasWidth, canvasHeight);
  var pixels = imageData.data;
  var settled = 0;

  for (var i = 0; i < count; i++) {
    var st = startTimes[i];
    var sx = sourceXY[i * 2];
    var sy = sourceXY[i * 2 + 1];
    var tx = targetXY[i * 2];
    var ty = targetXY[i * 2 + 1];
    var px, py;

    if (st === 0) {
      px = sx;
      py = sy;
    } else {
      var pixelElapsed = timestamp - st;
      if (pixelElapsed >= tweenDur) {
        px = tx;
        py = ty;
        settled++;
      } else {
        var t = easeInOutCubic(pixelElapsed / tweenDur);
        var arcScale = 4 * t * (1 - t);
        var arcX = Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * arcScale;
        var arcY = Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * arcScale;
        px = sx + (tx - sx) * t + arcX;
        py = sy + (ty - sy) * t + arcY;
      }
    }

    var ix = Math.round(px);
    var iy = Math.round(py);
    if (ix < 0) ix = 0;
    if (ix >= canvasWidth) ix = canvasWidth - 1;
    if (iy < 0) iy = 0;
    if (iy >= canvasHeight) iy = canvasHeight - 1;

    var off = (iy * canvasWidth + ix) * 4;
    pixels[off] = colors[i * 4];
    pixels[off + 1] = colors[i * 4 + 1];
    pixels[off + 2] = colors[i * 4 + 2];
    pixels[off + 3] = colors[i * 4 + 3];
  }

  ctx.putImageData(imageData, 0, 0);

  if (APP_STATE.recordingCanvas) {
    updateRecordingFrame(canvas, APP_STATE.recordingCanvas, APP_STATE.animImageSize, APP_STATE.animGapPx);
  }

  APP_STATE.animSettled = settled;
  var pct = count > 0 ? (settled / count) * 100 : 0;
  var fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = pct + '%';
  var text = document.getElementById('progress-text');
  if (text) text.textContent = 'Rearranging ' + settled + ' of ' + count + ' pixels\u2026';

  if (settled >= count) {
    setTimeout(function() {
      finishAnimation();
    }, CONFIG.COMPLETION_DELAY_MS);
    return;
  }

  APP_STATE.animationFrameId = requestAnimationFrame(animationLoop);
}

/**
 * @description Called when animation completes — transitions to result screen.
 */
export function finishAnimation() {
  if (APP_STATE.animationFrameId) {
    cancelAnimationFrame(APP_STATE.animationFrameId);
    APP_STATE.animationFrameId = null;
  }

  stopRecording();

  var animCanvas = document.getElementById('animation-canvas');
  var resultCanvas = document.getElementById('result-canvas');
  if (animCanvas && resultCanvas) {
    var size = APP_STATE.animImageSize || APP_STATE.selectedResolution;
    var gapPx = APP_STATE.animGapPx || Math.round(size * CONFIG.CANVAS_GAP_RATIO);
    resultCanvas.width = size;
    resultCanvas.height = size;
    var displaySize = Math.min(
      Math.floor(window.innerWidth * 0.85),
      Math.floor(window.innerHeight * 0.65)
    );
    resultCanvas.style.width = displaySize + 'px';
    resultCanvas.style.height = displaySize + 'px';
    var ctx = resultCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(animCanvas, size + gapPx, 0, size, size, 0, 0, size, size);
    }
  }

  var elapsed = APP_STATE.animationStartTime
    ? ((performance.now() - APP_STATE.animationStartTime) / 1000).toFixed(1)
    : '?';
  var stats = document.getElementById('result-stats');
  if (stats) {
    stats.textContent = APP_STATE.selectedResolution + '\u00d7' + APP_STATE.selectedResolution +
      ' \u2022 ' + APP_STATE.selectedPattern.replace(/_/g, ' ') +
      ' \u2022 ' + elapsed + 's';
  }

  showScreen('result');
}
