'use strict';

import { CONFIG } from './config.js';
import { APP_STATE } from './state.js';
import { showScreen } from './ui/screens.js';
import { showToast } from './ui/toast.js';
import { startReveal } from './animation/engine.js';

// ═══════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════

/**
 * @description Resets all mutable state, revokes object URLs, cancels animations.
 */
export function resetState() {
  if (APP_STATE.animationFrameId) {
    cancelAnimationFrame(APP_STATE.animationFrameId);
    APP_STATE.animationFrameId = null;
  }
  if (APP_STATE.sourceObjectURL) {
    URL.revokeObjectURL(APP_STATE.sourceObjectURL);
    APP_STATE.sourceObjectURL = null;
  }
  if (APP_STATE.targetObjectURL) {
    URL.revokeObjectURL(APP_STATE.targetObjectURL);
    APP_STATE.targetObjectURL = null;
  }

  APP_STATE.sourceBuffer = null;
  APP_STATE.targetBuffer = null;
  APP_STATE.mapping = null;
  APP_STATE.sourceXY = null;
  APP_STATE.targetXY = null;
  APP_STATE.colors = null;
  APP_STATE.startTimes = null;
  APP_STATE.animImageSize = null;
  APP_STATE.animGapPx = null;
  APP_STATE.pixelsPerMs = 0;
  APP_STATE.animationStartTime = null;
  APP_STATE.animBatchIndex = 0;
  APP_STATE.animSettled = 0;
  APP_STATE.rankedTargets = null;
  APP_STATE.rankedTargetIndex = 0;

  if (APP_STATE.mediaRecorder && APP_STATE.mediaRecorder.state !== 'inactive') {
    APP_STATE.mediaRecorder.stop();
  }
  APP_STATE.mediaRecorder = null;
  APP_STATE.recordedChunks = [];
  APP_STATE.resolvedVideoMime = null;
  APP_STATE.recordingCanvas = null;
  var videoBtn = document.getElementById('btn-download-video');
  if (videoBtn) videoBtn.disabled = true;

  var preview = document.getElementById('source-preview');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  var tgtPreview = document.getElementById('target-preview');
  if (tgtPreview) { tgtPreview.src = ''; tgtPreview.classList.add('hidden'); }
  var revealBtn = document.getElementById('btn-reveal');
  if (revealBtn) revealBtn.disabled = true;
}

/**
 * @description Downloads the result canvas as a PNG.
 */
export function downloadResult() {
  var canvas = document.getElementById('result-canvas');
  if (!canvas) {
    showToast('No result canvas found.', 'error');
    return;
  }
  try {
    canvas.toBlob(function(blob) {
      if (!blob) {
        showToast('Failed to create image blob.', 'error');
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'what-lurks-within-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

/**
 * @description Downloads the recorded animation as a video file (MP4 or WebM).
 */
export function downloadVideo() {
  if (!APP_STATE.recordedChunks || APP_STATE.recordedChunks.length === 0) {
    showToast('No video recorded yet.', 'error');
    return;
  }
  try {
    var mime = APP_STATE.resolvedVideoMime || 'video/webm';
    var ext = mime.startsWith('video/mp4') ? '.mp4' : '.webm';
    var blob = new Blob(APP_STATE.recordedChunks, { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'what-lurks-within-' + Date.now() + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Video download failed: ' + err.message, 'error');
  }
}

/**
 * @description Re-runs the reveal. In fate mode, cycles to the next ranked default image.
 *              In custom mode, re-runs with the same custom target.
 */
export function tryAgain() {
  if (APP_STATE.animationFrameId) {
    cancelAnimationFrame(APP_STATE.animationFrameId);
    APP_STATE.animationFrameId = null;
  }

  var videoBtn = document.getElementById('btn-download-video');
  if (videoBtn) videoBtn.disabled = true;

  if (APP_STATE.targetMode === 'fate' && APP_STATE.rankedTargets && APP_STATE.rankedTargets.length > 0) {
    APP_STATE.rankedTargetIndex = (APP_STATE.rankedTargetIndex + 1) % APP_STATE.rankedTargets.length;
    APP_STATE.targetBuffer = APP_STATE.rankedTargets[APP_STATE.rankedTargetIndex].buffer;
  }

  startReveal();
}
