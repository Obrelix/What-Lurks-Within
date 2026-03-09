'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { showToast } from '../ui/toast.js';
import { showScreen } from '../ui/screens.js';

// ═══════════════════════════════════════════
// IMAGE PIPELINE
// ═══════════════════════════════════════════

/**
 * @description Computes cover-crop source rectangle for drawImage.
 * @param {number} srcW - Source image width
 * @param {number} srcH - Source image height
 * @param {number} dst - Target square dimension
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function computeCoverCrop(srcW, srcH, dst) {
  const aspect = srcW / srcH;
  let sx, sy, sw, sh;
  if (aspect > 1) {
    sh = srcH;
    sw = srcH;
    sx = Math.floor((srcW - sw) / 2);
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW;
    sx = 0;
    sy = Math.floor((srcH - sh) / 2);
  }
  return { sx: sx, sy: sy, sw: sw, sh: sh };
}

/**
 * @description Creates a PixelBuffer from an Image element at the given resolution.
 * @param {HTMLImageElement} img - Loaded image
 * @param {number} size - Target square dimension (256/512/768)
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function createPixelBuffer(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  const crop = computeCoverCrop(img.naturalWidth || img.width, img.naturalHeight || img.height, size);
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: imageData.data,
    count: size * size
  };
}

/**
 * @description Creates a PixelBuffer from raw Uint8ClampedArray data.
 * @param {Uint8ClampedArray} data - Raw RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function createPixelBufferFromData(data, width, height) {
  return {
    width: width,
    height: height,
    data: data,
    count: width * height
  };
}

/**
 * @description Loads an image file and returns a Promise resolving to an HTMLImageElement.
 * @param {File} file - Image file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
  return new Promise(function(resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
    img._objectURL = url;
  });
}

/**
 * @description Enables or disables the Reveal button based on buffer state.
 */
export function updateRevealButton() {
  const btn = document.getElementById('btn-reveal');
  if (!btn) return;
  const hasSource = APP_STATE.sourceBuffer !== null;
  const hasTarget = APP_STATE.targetBuffer !== null || APP_STATE.targetMode === 'fate';
  btn.disabled = !(hasSource && hasTarget);
}

/**
 * @description Handles source image upload — creates preview and PixelBuffer.
 * @param {File} file - Image file from input
 */
export async function handleSourceUpload(file) {
  if (!file) return;
  if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
    showToast('File is over 10 MB — processing may be slow.', 'info');
  }
  try {
    const img = await loadImageFromFile(file);

    const preview = document.getElementById('source-preview');
    if (preview) {
      if (APP_STATE.sourceObjectURL) URL.revokeObjectURL(APP_STATE.sourceObjectURL);
      APP_STATE.sourceObjectURL = img._objectURL;
      preview.src = img._objectURL;
      preview.classList.remove('hidden');
    }

    const res = APP_STATE.selectedResolution;
    if ((img.naturalWidth || img.width) < res || (img.naturalHeight || img.height) < res) {
      showToast('Image is smaller than target resolution — upscaling may reduce quality.', 'info');
    }

    APP_STATE.sourceBuffer = createPixelBuffer(img, res);
    showScreen('setup');
    updateRevealButton();
  } catch (err) {
    showToast('Error loading image: ' + err.message, 'error');
  }
}

/**
 * @description Loads an image from a URL string (object URL or data URL).
 * @param {string} url - Image URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageFromURL(url) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Failed to load image from URL')); };
    img.src = url;
  });
}

/**
 * @description Reprocesses loaded source and custom-target images at a new resolution.
 *              Called when the quality dropdown changes after images are already loaded.
 * @param {number} newResolution - New square dimension (256/512/768)
 * @returns {Promise<void>}
 */
export async function reprocessOnResolutionChange(newResolution) {
  APP_STATE.rankedTargets = null;
  APP_STATE.rankedTargetIndex = 0;

  if (APP_STATE.sourceObjectURL && APP_STATE.sourceBuffer) {
    try {
      var srcImg = await loadImageFromURL(APP_STATE.sourceObjectURL);
      APP_STATE.sourceBuffer = createPixelBuffer(srcImg, newResolution);
    } catch (err) {
      showToast('Error reprocessing source image: ' + err.message, 'error');
    }
  }

  if (APP_STATE.targetObjectURL && APP_STATE.targetBuffer) {
    try {
      var tgtImg = await loadImageFromURL(APP_STATE.targetObjectURL);
      APP_STATE.targetBuffer = createPixelBuffer(tgtImg, newResolution);
    } catch (err) {
      showToast('Error reprocessing target image: ' + err.message, 'error');
    }
  }
}

/**
 * @description Handles target image upload — creates preview and PixelBuffer.
 * @param {File} file - Image file from input
 */
export async function handleTargetUpload(file) {
  if (!file) return;
  if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
    showToast('File is over 10 MB — processing may be slow.', 'info');
  }
  try {
    const img = await loadImageFromFile(file);

    const preview = document.getElementById('target-preview');
    const toggleCheckbox = document.getElementById('toggle-target-preview');
    if (preview) {
      if (APP_STATE.targetObjectURL) URL.revokeObjectURL(APP_STATE.targetObjectURL);
      APP_STATE.targetObjectURL = img._objectURL;
      preview.src = img._objectURL;
      if (toggleCheckbox && toggleCheckbox.checked) {
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    }

    APP_STATE.targetBuffer = createPixelBuffer(img, APP_STATE.selectedResolution);
    updateRevealButton();
  } catch (err) {
    showToast('Error loading target image: ' + err.message, 'error');
  }
}
