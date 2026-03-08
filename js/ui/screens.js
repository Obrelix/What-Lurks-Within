'use strict';

import { APP_STATE } from '../state.js';

// ═══════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════

/**
 * @description Switches the visible screen by setting body data-screen attribute.
 * @param {string} screenId - One of 'landing', 'setup', 'animation', 'result'
 */
export function showScreen(screenId) {
  const validScreens = ['landing', 'setup', 'animation', 'result'];
  if (!validScreens.includes(screenId)) {
    console.warn('showScreen: invalid screen id:', screenId);
    return;
  }
  document.body?.setAttribute('data-screen', screenId);
  APP_STATE.currentScreen = screenId;
}
