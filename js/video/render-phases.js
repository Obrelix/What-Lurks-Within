'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { easeInOutCubic, EASING_FUNCTIONS } from '../utils.js';
import { drawWatermark } from './recorder.js';

// ═══════════════════════════════════════════
// OFFLINE RENDER — PHASE RENDERERS
// ═══════════════════════════════════════════

/**
 * @description Renders the opening hold phase (source centered).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth - Scaled canvas width
 * @param {number} size - Original image size (unscaled)
 * @param {number} scale - Render scale multiplier
 */
export function renderOpenHold(ctx, canvasWidth, size, scale) {
  var scaledSize = Math.round(size * scale);
  var centerX = (canvasWidth - scaledSize) / 2;
  ctx.clearRect(0, 0, canvasWidth, scaledSize);
  ctx.drawImage(APP_STATE.sourceImageCanvas, centerX, 0, scaledSize, scaledSize);
  drawWatermark(ctx, canvasWidth, scaledSize);
}

/**
 * @description Renders the opening slide phase (source sliding from center to left).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth - Scaled canvas width
 * @param {number} size - Original image size (unscaled)
 * @param {number} scale - Render scale multiplier
 * @param {number} t - Progress 0..1
 */
export function renderOpenSlide(ctx, canvasWidth, size, scale, t) {
  var scaledSize = Math.round(size * scale);
  var centerX = (canvasWidth - scaledSize) / 2;
  ctx.clearRect(0, 0, canvasWidth, scaledSize);
  ctx.drawImage(APP_STATE.sourceImageCanvas, centerX * (1 - easeInOutCubic(t)), 0, scaledSize, scaledSize);
  drawWatermark(ctx, canvasWidth, scaledSize);
}

/**
 * @description Renders one frame of the pixel migration phase.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth - Scaled canvas width
 * @param {number} canvasHeight - Scaled canvas height
 * @param {number} scale - Render scale multiplier
 * @param {number} elapsed - Time since animation phase started (ms)
 * @param {Float64Array} departures - Pre-computed departure times
 * @returns {number} Number of settled pixels
 */
export function renderPixelFrame(ctx, canvasWidth, canvasHeight, scale, elapsed, departures) {
  var count = APP_STATE.mapping.length;
  var sourceXY = APP_STATE.sourceXY;
  var targetXY = APP_STATE.targetXY;
  var colors = APP_STATE.colors;
  var tweenDurations = APP_STATE.tweenDurations;
  var easingIndices = APP_STATE.easingIndices;

  var imageData = ctx.createImageData(canvasWidth, canvasHeight);
  var pixels = imageData.data;
  var settled = 0;
  var flightSize = Math.max(CONFIG.PIXEL_FLIGHT_SIZE,
    Math.round(CONFIG.PIXEL_FLIGHT_SIZE * canvasHeight / CONFIG.DEFAULT_RESOLUTION));
  var halfFlight = Math.floor(flightSize / 2);
  var boost = CONFIG.PIXEL_FLIGHT_BOOST;

  // Pass 1: draw stationary pixels (waiting at source or settled at target)
  for (var i = 0; i < count; i++) {
    var dep = departures[i];
    var sx = sourceXY[i * 2] * scale, sy = sourceXY[i * 2 + 1] * scale;
    var tx = targetXY[i * 2] * scale, ty = targetXY[i * 2 + 1] * scale;
    var px, py;

    if (elapsed < dep) {
      px = sx; py = sy;
    } else {
      var pixelElapsed = elapsed - dep;
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
    var dep = departures[i];
    if (elapsed < dep) continue;
    var pixelElapsed = elapsed - dep;
    var dur = tweenDurations[i];
    if (pixelElapsed >= dur) continue;
    var sx = sourceXY[i * 2] * scale, sy = sourceXY[i * 2 + 1] * scale;
    var tx = targetXY[i * 2] * scale, ty = targetXY[i * 2 + 1] * scale;
    var easeFn = EASING_FUNCTIONS[easingIndices[i]];
    var t = easeFn(pixelElapsed / dur);
    var arc = 4 * t * (1 - t);
    var px = sx + (tx - sx) * t + Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * scale * arc;
    var py = sy + (ty - sy) * t + Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * scale * arc;
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
  return settled;
}

/**
 * @description Renders the closing slide phase (result sliding from right to center).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth - Scaled canvas width
 * @param {number} size - Original image size (unscaled)
 * @param {number} gapPx - Original gap (unscaled)
 * @param {number} scale - Render scale multiplier
 * @param {number} t - Progress 0..1
 */
export function renderCloseSlide(ctx, canvasWidth, size, gapPx, scale, t) {
  var scaledSize = Math.round(size * scale);
  var fromX = (size + gapPx) * scale;
  var centerX = (canvasWidth - scaledSize) / 2;
  ctx.clearRect(0, 0, canvasWidth, scaledSize);
  ctx.drawImage(APP_STATE.targetImageCanvas, fromX + (centerX - fromX) * easeInOutCubic(t), 0, scaledSize, scaledSize);
  drawWatermark(ctx, canvasWidth, scaledSize);
}

/**
 * @description Renders the closing hold phase (result centered).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth - Scaled canvas width
 * @param {number} size - Original image size (unscaled)
 * @param {number} scale - Render scale multiplier
 */
export function renderCloseHold(ctx, canvasWidth, size, scale) {
  var scaledSize = Math.round(size * scale);
  var centerX = (canvasWidth - scaledSize) / 2;
  ctx.clearRect(0, 0, canvasWidth, scaledSize);
  ctx.drawImage(APP_STATE.targetImageCanvas, centerX, 0, scaledSize, scaledSize);
  drawWatermark(ctx, canvasWidth, scaledSize);
}
