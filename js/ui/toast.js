'use strict';

import { CONFIG } from '../config.js';

// ═══════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════

/**
 * @description Shows a styled toast notification.
 * @param {string} message - Text to display
 * @param {'error'|'info'} type - Toast type
 */
export function showToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = type === 'info' ? 'toast toast--info' : 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.remove();
  }, CONFIG.TOAST_DURATION_MS);
}
