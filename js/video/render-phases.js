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
  const scaledSize = Math.round(size * scale);
  const centerX = (canvasWidth - scaledSize) / 2;
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
  const scaledSize = Math.round(size * scale);
  const centerX = (canvasWidth - scaledSize) / 2;
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
  const count = APP_STATE.mapping.length;
  const sourceXY = APP_STATE.sourceXY;
  const targetXY = APP_STATE.targetXY;
  const colors = APP_STATE.colors;
  const tweenDurations = APP_STATE.tweenDurations;
  const easingIndices = APP_STATE.easingIndices;

  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const pixels = imageData.data;
  let settled = 0;
  const flightSize = Math.max(CONFIG.PIXEL_FLIGHT_SIZE,
    Math.round(CONFIG.PIXEL_FLIGHT_SIZE * canvasHeight / CONFIG.DEFAULT_RESOLUTION));
  const halfFlight = Math.floor(flightSize / 2);
  const boost = CONFIG.PIXEL_FLIGHT_BOOST;

  // Pass 1: draw stationary pixels (waiting at source or settled at target)
  for (let i = 0; i < count; i++) {
    const dep = departures[i];
    const sx = sourceXY[i * 2] * scale, sy = sourceXY[i * 2 + 1] * scale;
    const tx = targetXY[i * 2] * scale, ty = targetXY[i * 2 + 1] * scale;
    let px, py;

    if (elapsed < dep) {
      px = sx; py = sy;
    } else {
      const pixelElapsed = elapsed - dep;
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
    const dep = departures[i];
    if (elapsed < dep) continue;
    const pixelElapsed = elapsed - dep;
    const dur = tweenDurations[i];
    if (pixelElapsed >= dur) continue;
    const sx = sourceXY[i * 2] * scale, sy = sourceXY[i * 2 + 1] * scale;
    const tx = targetXY[i * 2] * scale, ty = targetXY[i * 2 + 1] * scale;
    const easeFn = EASING_FUNCTIONS[easingIndices[i]];
    const t = easeFn(pixelElapsed / dur);
    const arc = 4 * t * (1 - t);
    const px = sx + (tx - sx) * t + Math.sin(i * 0.1) * CONFIG.ARC_MAGNITUDE * scale * arc;
    const py = sy + (ty - sy) * t + Math.cos(i * 0.07) * CONFIG.ARC_MAGNITUDE * scale * arc;
    const ix = Math.round(px), iy = Math.round(py);
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
  const scaledSize = Math.round(size * scale);
  const fromX = (size + gapPx) * scale;
  const centerX = (canvasWidth - scaledSize) / 2;
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
  const scaledSize = Math.round(size * scale);
  const centerX = (canvasWidth - scaledSize) / 2;
  ctx.clearRect(0, 0, canvasWidth, scaledSize);
  ctx.drawImage(APP_STATE.targetImageCanvas, centerX, 0, scaledSize, scaledSize);
  drawWatermark(ctx, canvasWidth, scaledSize);
}
