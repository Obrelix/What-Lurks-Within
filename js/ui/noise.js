'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { showToast } from './toast.js';

// ═══════════════════════════════════════════
// NOISE CANVAS
// ═══════════════════════════════════════════

/**
 * @description Initialises the background VHS noise canvas effect.
 */
export function initNoiseCanvas() {
  const canvas = document.getElementById('noise-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast('Canvas 2D not supported by your browser.', 'error');
    return;
  }

  /**
   * @description Resizes the noise canvas to match the window.
   */
  function resizeNoise() {
    canvas.width = Math.ceil(window.innerWidth / CONFIG.NOISE_SCALE);
    canvas.height = Math.ceil(window.innerHeight / CONFIG.NOISE_SCALE);
  }

  resizeNoise();
  window.addEventListener('resize', resizeNoise);

  const interval = 1000 / CONFIG.NOISE_FPS;
  let lastTime = 0;

  /**
   * @description Renders a single frame of VHS noise.
   * @param {number} timestamp - rAF timestamp
   */
  function renderNoise(timestamp) {
    APP_STATE.noiseFrameId = requestAnimationFrame(renderNoise);
    if (timestamp - lastTime < interval) return;
    lastTime = timestamp;

    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const len = w * h * 4;

    for (let i = 0; i < len; i += 4) {
      const v = (Math.random() * 255) | 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  APP_STATE.noiseFrameId = requestAnimationFrame(renderNoise);
}
