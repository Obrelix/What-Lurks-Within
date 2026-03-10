'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { isRecordingSupported, resolveVideoMimeType } from './recorder.js';
import {
  renderOpenHold, renderOpenSlide, renderPixelFrame,
  renderCloseSlide, renderCloseHold
} from './render-phases.js';

// ═══════════════════════════════════════════
// OFFLINE VIDEO RENDERER
// ═══════════════════════════════════════════

/**
 * @description Calculates total animation duration in milliseconds across all phases.
 * @returns {number} Total duration in ms
 */
function calcTotalDuration() {
  var openHold = Math.max(0, CONFIG.VIDEO_BUFFER_OPEN_MS - CONFIG.VIDEO_BUFFER_SLIDE_MS);
  var openSlide = CONFIG.VIDEO_BUFFER_SLIDE_MS;
  var maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
  var departureMs = Math.max(1000, CONFIG.TARGET_DURATION_S * 1000 - maxTween);
  var animDuration = departureMs + maxTween;
  var closeSlide = CONFIG.VIDEO_BUFFER_SLIDE_MS;
  var closeHold = Math.max(0, CONFIG.VIDEO_BUFFER_CLOSE_MS - CONFIG.VIDEO_BUFFER_SLIDE_MS);
  return openHold + openSlide + animDuration + closeSlide + closeHold;
}

/**
 * @description Pre-computes departure times for all pixels.
 * @param {number} count - Number of pixels
 * @param {number} pixelsPerMs - Departure rate
 * @returns {Float64Array} Departure time for each pixel
 */
function buildDepartureTimes(count, pixelsPerMs) {
  var times = new Float64Array(count);
  for (var i = 0; i < count; i++) {
    times[i] = i / pixelsPerMs;
  }
  return times;
}

/**
 * @description Dispatches to the correct phase renderer for a given simulated time.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw - Canvas width
 * @param {number} size - Image size
 * @param {number} gapPx
 * @param {number} t - Simulated time in ms
 * @param {Array<number>} bounds - [openHoldMs, openSlideMs, animMs, closeSlideMs]
 * @param {Float64Array} departures
 */
function renderFrameAtTime(ctx, cw, size, gapPx, t, bounds, departures) {
  if (t < bounds[0]) { renderOpenHold(ctx, cw, size); return; }
  t -= bounds[0];
  if (t < bounds[1]) { renderOpenSlide(ctx, cw, size, t / bounds[1]); return; }
  t -= bounds[1];
  if (t < bounds[2]) { renderPixelFrame(ctx, cw, size, t, departures); return; }
  t -= bounds[2];
  if (t < bounds[3]) { renderCloseSlide(ctx, cw, size, gapPx, t / bounds[3]); return; }
  renderCloseHold(ctx, cw, size);
}

// ═══════════════════════════════════════════
// MAIN OFFLINE RENDER
// ═══════════════════════════════════════════

/**
 * @description Re-renders the full animation offline and encodes it as a high-bitrate video.
 *              Uses captureStream(0) + requestFrame() for precise frame control.
 * @param {function(number): void} onProgress - Called with percentage (0-100)
 * @returns {Promise<Blob>} Resolves with the video Blob
 */
export function renderOfflineVideo(onProgress) {
  if (!isRecordingSupported()) {
    return Promise.reject(new Error('Video recording not supported in this browser.'));
  }

  var size = APP_STATE.animImageSize;
  var gapPx = APP_STATE.animGapPx;
  var cw = size * 2 + gapPx;
  var canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = size;
  var ctx = canvas.getContext('2d');

  var mimeType = resolveVideoMimeType();
  APP_STATE.resolvedVideoMime = mimeType;
  var stream = canvas.captureStream(0);
  var track = stream.getVideoTracks()[0];
  var recorder = new MediaRecorder(stream, {
    mimeType: mimeType,
    videoBitsPerSecond: CONFIG.VIDEO_BITRATE
  });

  var chunks = [];
  recorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  var frameMs = 1000 / CONFIG.VIDEO_FRAMERATE;
  var totalFrames = Math.ceil(calcTotalDuration() / frameMs);
  var count = APP_STATE.mapping.length;
  var maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
  var departureMs = Math.max(1000, CONFIG.TARGET_DURATION_S * 1000 - maxTween);
  var departures = buildDepartureTimes(count, count / departureMs);
  var bounds = [
    Math.max(0, CONFIG.VIDEO_BUFFER_OPEN_MS - CONFIG.VIDEO_BUFFER_SLIDE_MS),
    CONFIG.VIDEO_BUFFER_SLIDE_MS,
    departureMs + maxTween,
    CONFIG.VIDEO_BUFFER_SLIDE_MS
  ];

  return new Promise(function(resolve, reject) {
    recorder.onstop = function() {
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = function(e) { reject(e.error || new Error('Recording error')); };
    recorder.start();

    var frame = 0;
    function renderNext() {
      if (frame >= totalFrames) { recorder.stop(); return; }
      renderFrameAtTime(ctx, cw, size, gapPx, frame * frameMs, bounds, departures);
      track.requestFrame();
      frame++;
      if (onProgress) onProgress(Math.round((frame / totalFrames) * 100));
      setTimeout(renderNext, frameMs);
    }
    renderNext();
  });
}
