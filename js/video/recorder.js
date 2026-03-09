'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { showToast } from '../ui/toast.js';

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
  var list = CONFIG.VIDEO_MIME_PRIORITY;
  for (var i = 0; i < list.length; i++) {
    if (MediaRecorder.isTypeSupported(list[i])) return list[i];
  }
  return 'video/webm';
}

// ═══════════════════════════════════════════
// RECORDING CANVAS + WATERMARK
// ═══════════════════════════════════════════

/**
 * @description Creates a hidden off-screen canvas for recording the target side only.
 * @param {number} size - Square dimension (matches image resolution)
 * @returns {HTMLCanvasElement}
 */
export function createRecordingCanvas(size) {
  var canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * @description Draws the watermark text onto a canvas context (bottom-right corner).
 * @param {CanvasRenderingContext2D} ctx - Target context
 * @param {number} size - Square dimension of the canvas
 */
export function drawWatermark(ctx, size) {
  var fontSize = Math.max(10, Math.round(size * CONFIG.WATERMARK_FONT_SIZE_RATIO));
  var padding = Math.max(4, Math.round(size * CONFIG.WATERMARK_PADDING_RATIO));
  ctx.save();
  ctx.font = fontSize + 'px "Share Tech Mono", monospace';
  ctx.globalAlpha = CONFIG.WATERMARK_OPACITY;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(CONFIG.WATERMARK_TEXT, size - padding, size - padding);
  ctx.restore();
}

/**
 * @description Copies the target region from the display canvas to the recording canvas,
 *              then draws the watermark overlay.
 * @param {HTMLCanvasElement} displayCanvas - The dual-layout animation canvas
 * @param {HTMLCanvasElement} recordingCanvas - The square recording canvas
 * @param {number} size - Image square dimension
 * @param {number} gapPx - Gap width between source and target on the display canvas
 */
export function updateRecordingFrame(displayCanvas, recordingCanvas, size, gapPx) {
  var ctx = recordingCanvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(displayCanvas, size + gapPx, 0, size, size, 0, 0, size, size);
  drawWatermark(ctx, size);
}

/**
 * @description Draws a PixelBuffer as a full-frame image on the recording canvas with watermark.
 *              Used for opening buffer (source image) and closing buffer (target image).
 * @param {HTMLCanvasElement} recordingCanvas - The square recording canvas
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} pixelBuffer - Image data
 */
export function drawBufferFrame(recordingCanvas, pixelBuffer) {
  var ctx = recordingCanvas.getContext('2d');
  if (!ctx) return;
  var size = recordingCanvas.width;
  var imageData = ctx.createImageData(size, size);
  imageData.data.set(pixelBuffer.data);
  ctx.putImageData(imageData, 0, 0);
  drawWatermark(ctx, size);
}

// ═══════════════════════════════════════════
// START / STOP RECORDING
// ═══════════════════════════════════════════

/**
 * @description Starts recording the given canvas element.
 * @param {HTMLCanvasElement} canvas - The canvas to record
 */
export function startRecording(canvas) {
  if (!isRecordingSupported()) {
    showToast('Video recording not supported in this browser.', 'error');
    return;
  }

  var mimeType = resolveVideoMimeType();
  APP_STATE.resolvedVideoMime = mimeType;
  APP_STATE.recordedChunks = [];

  var stream = canvas.captureStream(CONFIG.VIDEO_FRAMERATE);
  var recorder = new MediaRecorder(stream, { mimeType: mimeType });

  recorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) {
      APP_STATE.recordedChunks.push(e.data);
    }
  };

  recorder.start();
  APP_STATE.mediaRecorder = recorder;
}

/**
 * @description Stops the active recording and enables the download button.
 * @returns {Promise<void>} Resolves when the recorder has fully stopped
 */
export function stopRecording() {
  var recorder = APP_STATE.mediaRecorder;
  if (!recorder || recorder.state === 'inactive') return Promise.resolve();

  return new Promise(function(resolve) {
    recorder.onstop = function() {
      APP_STATE.mediaRecorder = null;
      var btn = document.getElementById('btn-download-video');
      if (btn) btn.disabled = false;
      resolve();
    };
    recorder.stop();
  });
}
