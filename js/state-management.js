'use strict';

import { CONFIG } from './config.js';
import { APP_STATE } from './state.js';
import { showScreen } from './ui/screens.js';
import { showToast } from './ui/toast.js';
import { startReveal } from './animation/engine.js';
import { renderOfflineVideo } from './video/offline-render.js';

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
  APP_STATE.tweenDurations = null;
  APP_STATE.easingIndices = null;
  APP_STATE.animImageSize = null;
  APP_STATE.animGapPx = null;
  APP_STATE.pixelsPerMs = 0;
  APP_STATE.animationStartTime = null;
  APP_STATE.animBatchIndex = 0;
  APP_STATE.animSettled = 0;
  APP_STATE.rankedTargets = null;
  APP_STATE.rankedTargetIndex = 0;

  APP_STATE.recordedVideoBlob = null;
  APP_STATE.resolvedVideoMime = null;
  APP_STATE.hdRecording = false;
  APP_STATE.animPhase = null;
  APP_STATE.animPhaseStart = null;
  APP_STATE.sourceImageCanvas = null;
  APP_STATE.targetImageCanvas = null;
  APP_STATE.animImageData = null;
  const videoBtn = document.getElementById('btn-download-video');
  if (videoBtn) videoBtn.disabled = true;

  const preview = document.getElementById('source-preview');
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  const tgtPreview = document.getElementById('target-preview');
  if (tgtPreview) { tgtPreview.src = ''; tgtPreview.classList.add('hidden'); }
  const revealBtn = document.getElementById('btn-reveal');
  if (revealBtn) revealBtn.disabled = true;
}

/**
 * @description Downloads the result canvas as a PNG.
 */
export function downloadResult() {
  const canvas = document.getElementById('result-canvas');
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
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
 * @description Renders the animation offline then downloads as a video file.
 */
export function downloadVideo() {
  if (!APP_STATE.mapping || !APP_STATE.sourceImageCanvas || !APP_STATE.targetImageCanvas) {
    showToast('No animation data available.', 'error');
    return;
  }

  if (APP_STATE.recordedVideoBlob) {
    triggerVideoDownload(APP_STATE.recordedVideoBlob, APP_STATE.resolvedVideoMime);
    return;
  }

  const btn = document.getElementById('btn-download-video');
  if (btn) { btn.disabled = true; btn.textContent = 'Rendering 0%...'; }

  renderOfflineVideo(function(pct) {
    if (btn) btn.textContent = 'Rendering ' + pct + '%...';
  }).then(function(blob) {
    APP_STATE.recordedVideoBlob = blob;
    if (btn) { btn.disabled = false; btn.textContent = 'Download Video'; }
    triggerVideoDownload(blob, APP_STATE.resolvedVideoMime);
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Download Video'; }
    showToast('Video render failed: ' + err.message, 'error');
  });
}

/**
 * @description Triggers browser download of a video blob.
 * @param {Blob} blob - The video blob
 * @param {string} mime - MIME type
 */
function triggerVideoDownload(blob, mime) {
  const ext = (mime && mime.startsWith('video/mp4')) ? '.mp4' : '.webm';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'what-lurks-within-' + Date.now() + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  const videoBtn = document.getElementById('btn-download-video');
  if (videoBtn) videoBtn.disabled = true;
  APP_STATE.recordedVideoBlob = null;

  if (APP_STATE.targetMode === 'fate' && APP_STATE.rankedTargets && APP_STATE.rankedTargets.length > 0) {
    APP_STATE.rankedTargetIndex = (APP_STATE.rankedTargetIndex + 1) % APP_STATE.rankedTargets.length;
    APP_STATE.targetBuffer = APP_STATE.rankedTargets[APP_STATE.rankedTargetIndex].buffer;
  }

  startReveal();
}
