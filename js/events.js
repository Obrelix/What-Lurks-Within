'use strict';

import { APP_STATE } from './state.js';
import { showScreen } from './ui/screens.js';
import { showToast } from './ui/toast.js';
import { handleSourceUpload, handleTargetUpload, updateRevealButton, reprocessOnResolutionChange } from './image/pipeline.js';
import { generateRandomTarget } from './image/procedural.js';
import { loadBestMatchingDefaultImage } from './image/matching.js';
import { startReveal } from './animation/engine.js';
import { resetState, downloadResult, downloadVideo, tryAgain } from './state-management.js';

// ═══════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════

/**
 * @description Binds all UI event listeners.
 */
export function initEvents() {
  // Upload button triggers file input
  const btnUpload = document.getElementById('btn-upload');
  const sourceInput = document.getElementById('source-file-input');
  btnUpload?.addEventListener('click', function() {
    sourceInput?.click();
  });

  // Source file selected (from landing)
  sourceInput?.addEventListener('change', function(e) {
    const file = e.target?.files?.[0];
    if (file) handleSourceUpload(file);
  });

  // Change source photo (from setup screen)
  const changeSourceInput = document.getElementById('change-source-input');
  changeSourceInput?.addEventListener('change', function(e) {
    const file = e.target?.files?.[0];
    if (file) handleSourceUpload(file);
  });

  // Target file selected
  const targetInput = document.getElementById('target-file-input');
  targetInput?.addEventListener('change', function(e) {
    const file = e.target?.files?.[0];
    if (file) handleTargetUpload(file);
  });

  // Reveal button
  const btnReveal = document.getElementById('btn-reveal');
  btnReveal?.addEventListener('click', async function() {
    if (!APP_STATE.sourceBuffer) return;
    if (APP_STATE.targetMode === 'fate') {
      const overlay = document.getElementById('processing-overlay');
      if (overlay) overlay.classList.add('active');
      try {
        APP_STATE.targetBuffer = await loadBestMatchingDefaultImage(
          APP_STATE.sourceBuffer, APP_STATE.selectedResolution
        );
      } catch (err) {
        APP_STATE.targetBuffer = generateRandomTarget(APP_STATE.selectedResolution);
      }
      if (overlay) overlay.classList.remove('active');
    }
    if (!APP_STATE.targetBuffer) {
      showToast('No target image available.', 'error');
      return;
    }
    startReveal();
  });

  // Drag and drop
  document.addEventListener('dragover', function(e) { e.preventDefault(); });
  document.addEventListener('drop', function(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (APP_STATE.currentScreen === 'landing' || APP_STATE.currentScreen === 'setup') {
      if (!APP_STATE.sourceBuffer) {
        handleSourceUpload(file);
      } else if (APP_STATE.targetMode === 'custom' && !APP_STATE.targetBuffer) {
        handleTargetUpload(file);
      }
    }
  });

  // How It Works modal
  const btnHow = document.getElementById('btn-how');
  const modal = document.getElementById('modal-how');
  const modalClose = document.getElementById('modal-close');
  btnHow?.addEventListener('click', function() {
    modal?.classList.add('active');
  });
  modalClose?.addEventListener('click', function() {
    modal?.classList.remove('active');
  });
  modal?.addEventListener('click', function(e) {
    if (e.target === modal) modal.classList.remove('active');
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal?.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });

  // Quality select
  const selectQuality = document.getElementById('select-quality');
  selectQuality?.addEventListener('change', function() {
    const newRes = parseInt(selectQuality.value, 10);
    APP_STATE.selectedResolution = newRes;
    reprocessOnResolutionChange(newRes);
    if (APP_STATE.hdRecording && newRes >= 768) {
      showToast('HD recording at 768px may be slow on some devices.', 'info');
    }
  });

  // Pattern select
  const selectPattern = document.getElementById('select-pattern');
  selectPattern?.addEventListener('change', function() {
    APP_STATE.selectedPattern = selectPattern.value;
  });

  // Target mode select
  const selectTargetMode = document.getElementById('select-target-mode');
  const customArea = document.getElementById('custom-target-area');
  selectTargetMode?.addEventListener('change', function() {
    APP_STATE.targetMode = selectTargetMode.value;
    if (selectTargetMode.value === 'custom') {
      customArea?.classList.remove('hidden');
    } else {
      customArea?.classList.add('hidden');
    }
    updateRevealButton();
  });

  // Target preview toggle
  const togglePreview = document.getElementById('toggle-target-preview');
  const targetPreviewImg = document.getElementById('target-preview');
  togglePreview?.addEventListener('change', function() {
    if (targetPreviewImg && targetPreviewImg.src && targetPreviewImg.src !== '') {
      if (togglePreview.checked) {
        targetPreviewImg.classList.remove('hidden');
      } else {
        targetPreviewImg.classList.add('hidden');
      }
    }
  });

  // HD recording toggle
  const toggleHd = document.getElementById('toggle-hd-recording');
  toggleHd?.addEventListener('change', function() {
    APP_STATE.hdRecording = toggleHd.checked;
    if (toggleHd.checked && APP_STATE.selectedResolution >= 768) {
      showToast('HD recording at 768px may be slow on some devices.', 'info');
    }
  });

  // ─── Result screen buttons ───
  const btnDownload = document.getElementById('btn-download');
  btnDownload?.addEventListener('click', downloadResult);

  const btnDownloadVideo = document.getElementById('btn-download-video');
  btnDownloadVideo?.addEventListener('click', downloadVideo);

  const btnRetry = document.getElementById('btn-retry');
  btnRetry?.addEventListener('click', tryAgain);

  const btnStartOver = document.getElementById('btn-start-over');
  btnStartOver?.addEventListener('click', function() {
    resetState();
    showScreen('landing');
  });
}
