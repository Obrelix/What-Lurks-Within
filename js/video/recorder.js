'use strict';

import { CONFIG } from '../config.js';

// ═══════════════════════════════════════════
// VIDEO RECORDER (MediaRecorder + captureStream)
// ═══════════════════════════════════════════

/**
 * @description Checks whether the browser supports canvas recording.
 * @returns {boolean}
 */
export function isRecordingSupported() {
  return typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * @description Picks the first supported MIME type from CONFIG.VIDEO_MIME_PRIORITY.
 * @returns {string} The best supported MIME type, or 'video/webm' as last resort
 */
export function resolveVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  const list = CONFIG.VIDEO_MIME_PRIORITY;
  for (let i = 0; i < list.length; i++) {
    if (MediaRecorder.isTypeSupported(list[i])) return list[i];
  }
  return 'video/webm';
}

// ═══════════════════════════════════════════
// WATERMARK + PIXEL BUFFER HELPERS
// ═══════════════════════════════════════════

/**
 * @description Draws the watermark text onto a canvas context (bottom-right corner).
 * @param {CanvasRenderingContext2D} ctx - Target context
 * @param {number} canvasWidth - Width of the canvas
 * @param {number} canvasHeight - Height of the canvas
 */
export function drawWatermark(ctx, canvasWidth, canvasHeight) {
  const fontSize = Math.max(10, Math.round(canvasHeight * CONFIG.WATERMARK_FONT_SIZE_RATIO));
  const padding = Math.max(4, Math.round(canvasHeight * CONFIG.WATERMARK_PADDING_RATIO));
  ctx.save();
  ctx.font = fontSize + 'px "Share Tech Mono", monospace';
  ctx.globalAlpha = CONFIG.WATERMARK_OPACITY;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(CONFIG.WATERMARK_TEXT, canvasWidth - padding, canvasHeight - padding);
  ctx.restore();
}

/**
 * @description Converts a PixelBuffer to an HTMLCanvasElement for efficient drawImage.
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} pixelBuffer - Image data
 * @returns {HTMLCanvasElement}
 */
export function pixelBufferToCanvas(pixelBuffer) {
  const canvas = document.createElement('canvas');
  canvas.width = pixelBuffer.width;
  canvas.height = pixelBuffer.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = new ImageData(
    new Uint8ClampedArray(pixelBuffer.data),
    pixelBuffer.width,
    pixelBuffer.height
  );
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

