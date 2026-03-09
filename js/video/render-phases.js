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
  var flightSize = CONFIG.PIXEL_FLIGHT_SIZE;
  var halfFlight = Math.floor(flightSize / 2);
  var boost = CONFIG.PIXEL_FLIGHT_BOOST;

  for (var i = 0; i < count; i++) {
    var dep = departures[i];
    var sx = sourceXY[i * 2], sy = sourceXY[i * 2 + 1];
    var tx = targetXY[i * 2], ty = targetXY[i * 2 + 1];
    var px, py;
    var inFlight = false;

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
        inFlight = true;
      }
    }

    var ix = Math.round(px), iy = Math.round(py);
    var cr = colors[i * 4], cg = colors[i * 4 + 1], cb = colors[i * 4 + 2], ca = colors[i * 4 + 3];
    if (inFlight) {
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
    } else {
      if (ix < 0) ix = 0; if (ix >= canvasWidth) ix = canvasWidth - 1;
      if (iy < 0) iy = 0; if (iy >= canvasHeight) iy = canvasHeight - 1;
      var off = (iy * canvasWidth + ix) * 4;
      pixels[off] = cr; pixels[off + 1] = cg; pixels[off + 2] = cb; pixels[off + 3] = ca;
    }
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
