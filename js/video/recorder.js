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
  var list = CONFIG.VIDEO_MIME_PRIORITY;
  for (var i = 0; i < list.length; i++) {
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
  var fontSize = Math.max(10, Math.round(canvasHeight * CONFIG.WATERMARK_FONT_SIZE_RATIO));
  var padding = Math.max(4, Math.round(canvasHeight * CONFIG.WATERMARK_PADDING_RATIO));
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
  var canvas = document.createElement('canvas');
  canvas.width = pixelBuffer.width;
  canvas.height = pixelBuffer.height;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var imageData = new ImageData(
    new Uint8ClampedArray(pixelBuffer.data),
    pixelBuffer.width,
    pixelBuffer.height
  );
  ctx.putImageData(imageData, 0, 0);
  return canvas;
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

  try {
    var mimeType = resolveVideoMimeType();
    APP_STATE.resolvedVideoMime = mimeType;
    APP_STATE.recordedChunks = [];

    var stream = canvas.captureStream(CONFIG.VIDEO_FRAMERATE);

    // Polyfill requestFrame if missing — some browsers lack it on
    // CanvasCaptureMediaStreamTrack, causing "track.requestFrame is not a function".
    var track = stream.getVideoTracks()[0];
    if (track && typeof track.requestFrame !== 'function') {
      track.requestFrame = function() {};
    }

    var recorder = new MediaRecorder(stream, { mimeType: mimeType });

    recorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) {
        APP_STATE.recordedChunks.push(e.data);
      }
    };

    recorder.onerror = function(e) {
      console.warn('MediaRecorder error:', e.error || e);
    };

    recorder.start();
    APP_STATE.mediaRecorder = recorder;
  } catch (err) {
    console.warn('Video recording failed to start:', err.message);
    APP_STATE.mediaRecorder = null;
  }
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
