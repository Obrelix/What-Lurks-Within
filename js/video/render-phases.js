'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { easeInOutCubic } from '../utils.js';
import { drawWatermark } from './recorder.js';

// ═══════════════════════════════════════════
// OFFLINE RENDER — PHASE RENDERERS
// ═══════════════════════════════════════════

/**
 * @description Renders the opening hold phase (source centered).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} size
 */
export function renderOpenHold(ctx, canvasWidth, size) {
  var centerX = (canvasWidth - size) / 2;
  ctx.clearRect(0, 0, canvasWidth, size);
  ctx.drawImage(APP_STATE.sourceImageCanvas, centerX, 0);
  drawWatermark(ctx, canvasWidth, size);
}

/**
 * @description Renders the opening slide phase (source sliding from center to left).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} size
 * @param {number} t - Progress 0..1
 */
export function renderOpenSlide(ctx, canvasWidth, size, t) {
  var centerX = (canvasWidth - size) / 2;
  ctx.clearRect(0, 0, canvasWidth, size);
  ctx.drawImage(APP_STATE.sourceImageCanvas, centerX * (1 - easeInOutCubic(t)), 0);
  drawWatermark(ctx, canvasWidth, size);
}

/**
 * @description Renders one frame of the pixel migration phase.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} elapsed - Time since animation phase started (ms)
 * @param {Float64Array} departures - Pre-computed departure times
 * @returns {number} Number of settled pixels
 */
export function renderPixelFrame(ctx, canvasWidth, canvasHeight, elapsed, departures) {
  var count = APP_STATE.mapping.length;
  var sourceXY = APP_STATE.sourceXY;
  var targetXY = APP_STATE.targetXY;
  var colors = APP_STATE.colors;
  var tweenDur = CONFIG.TWEEN_DURATION_MS;

  var imageData = ctx.createImageData(canvasWidth, canvasHeight);
  var pixels = imageData.data;
  var settled = 0;

  for (var i = 0; i < count; i++) {
    var dep = departures[i];
    var sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    var tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    var px, py;

    if (elapsed < dep) {
      px = sx; py = sy;
    } else {
      var pixelElapsed = elapsed - dep;
      if (pixelElapsed >= tweenDur) {
        px = tx; py = ty; settled++;
      } else {
        var t = easeInOutCubic(pixelElapsed / tweenDur);
        var arc = 4 * t * (1 - t);
        px = sx + (tx - sx) * t + Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * arc;
        py = sy + (ty - sy) * t + Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * arc;
      }
    }

    var ix = Math.round(px), iy = Math.round(py);
    if (ix < 0) ix = 0; if (ix >= canvasWidth) ix = canvasWidth - 1;
    if (iy < 0) iy = 0; if (iy >= canvasHeight) iy = canvasHeight - 1;
    var off = (iy * canvasWidth + ix) * 4;
    pixels[off] = colors[i * 4];
    pixels[off + 1] = colors[i * 4 + 1];
    pixels[off + 2] = colors[i * 4 + 2];
    pixels[off + 3] = colors[i * 4 + 3];
  }

  ctx.putImageData(imageData, 0, 0);
  drawWatermark(ctx, canvasWidth, canvasHeight);
  return settled;
}

/**
 * @description Renders the closing slide phase (result sliding from right to center).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} size
 * @param {number} gapPx
 * @param {number} t - Progress 0..1
 */
export function renderCloseSlide(ctx, canvasWidth, size, gapPx, t) {
  var fromX = size + gapPx;
  var centerX = (canvasWidth - size) / 2;
  ctx.clearRect(0, 0, canvasWidth, size);
  ctx.drawImage(APP_STATE.targetImageCanvas, fromX + (centerX - fromX) * easeInOutCubic(t), 0);
  drawWatermark(ctx, canvasWidth, size);
}

/**
 * @description Renders the closing hold phase (result centered).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} size
 */
export function renderCloseHold(ctx, canvasWidth, size) {
  var centerX = (canvasWidth - size) / 2;
  ctx.clearRect(0, 0, canvasWidth, size);
  ctx.drawImage(APP_STATE.targetImageCanvas, centerX, 0);
  drawWatermark(ctx, canvasWidth, size);
}
