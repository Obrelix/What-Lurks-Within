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
