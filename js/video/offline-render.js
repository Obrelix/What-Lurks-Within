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
  const openHold = Math.max(0, CONFIG.VIDEO_BUFFER_OPEN_MS - CONFIG.VIDEO_BUFFER_SLIDE_MS);
  const openSlide = CONFIG.VIDEO_BUFFER_SLIDE_MS;
  const maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
  const departureMs = Math.max(1000, CONFIG.TARGET_DURATION_S * 1000 - maxTween);
  const animDuration = departureMs + maxTween;
  const closeSlide = CONFIG.VIDEO_BUFFER_SLIDE_MS;
  const closeHold = Math.max(0, CONFIG.VIDEO_BUFFER_CLOSE_MS - CONFIG.VIDEO_BUFFER_SLIDE_MS);
  return openHold + openSlide + animDuration + closeSlide + closeHold;
}

/**
 * @description Pre-computes departure times for all pixels.
 * @param {number} count - Number of pixels
 * @param {number} pixelsPerMs - Departure rate
 * @returns {Float64Array} Departure time for each pixel
 */
function buildDepartureTimes(count, pixelsPerMs) {
  const times = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    times[i] = i / pixelsPerMs;
  }
  return times;
}

/**
 * @description Dispatches to the correct phase renderer for a given simulated time.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw - Scaled canvas width
 * @param {number} ch - Scaled canvas height
 * @param {number} size - Original image size (unscaled)
 * @param {number} gapPx - Original gap (unscaled)
 * @param {number} scale - Render scale multiplier
 * @param {number} t - Simulated time in ms
 * @param {Array<number>} bounds - [openHoldMs, openSlideMs, animMs, closeSlideMs]
 * @param {Float64Array} departures
 */
function renderFrameAtTime(ctx, cw, ch, size, gapPx, scale, t, bounds, departures) {
  if (t < bounds[0]) { renderOpenHold(ctx, cw, size, scale); return; }
  t -= bounds[0];
  if (t < bounds[1]) { renderOpenSlide(ctx, cw, size, scale, t / bounds[1]); return; }
  t -= bounds[1];
  if (t < bounds[2]) { renderPixelFrame(ctx, cw, ch, scale, t, departures); return; }
  t -= bounds[2];
  if (t < bounds[3]) { renderCloseSlide(ctx, cw, size, gapPx, scale, t / bounds[3]); return; }
  renderCloseHold(ctx, cw, size, scale);
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

  const size = APP_STATE.animImageSize;
  const gapPx = APP_STATE.animGapPx;
  const scale = APP_STATE.hdRecording ? CONFIG.VIDEO_RENDER_SCALE : 1;
  const cw = size * 2 + gapPx;
  const scaledCw = Math.round(cw * scale);
  const scaledSize = Math.round(size * scale);
  const canvas = document.createElement('canvas');
  canvas.width = scaledCw;
  canvas.height = scaledSize;
  const ctx = canvas.getContext('2d');

  const mimeType = resolveVideoMimeType();
  APP_STATE.resolvedVideoMime = mimeType;

  // Prefer captureStream(0) + requestFrame() for precise frame control.
  // Fall back to auto-capture if requestFrame is not supported.
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0];
  const hasRequestFrame = track && typeof track.requestFrame === 'function';
  if (!hasRequestFrame) {
    stream = canvas.captureStream(CONFIG.VIDEO_FRAMERATE);
    track = stream.getVideoTracks()[0];
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType,
    videoBitsPerSecond: CONFIG.VIDEO_BITRATE
  });

  const chunks = [];
  recorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const frameMs = 1000 / CONFIG.VIDEO_FRAMERATE;
  const totalFrames = Math.ceil(calcTotalDuration() / frameMs);
  const count = APP_STATE.mapping.length;
  const maxTween = CONFIG.TWEEN_DURATION_MS * (1 + CONFIG.TWEEN_SPEED_VARIANCE);
  const departureMs = Math.max(1000, CONFIG.TARGET_DURATION_S * 1000 - maxTween);
  const departures = buildDepartureTimes(count, count / departureMs);
  const bounds = [
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

    let frame = 0;
    function renderNext() {
      if (frame >= totalFrames) { recorder.stop(); return; }
      renderFrameAtTime(ctx, scaledCw, scaledSize, size, gapPx, scale, frame * frameMs, bounds, departures);
      if (hasRequestFrame) track.requestFrame();
      frame++;
      if (onProgress) onProgress(Math.round((frame / totalFrames) * 100));
      setTimeout(renderNext, frameMs);
    }
    renderNext();
  });
}
