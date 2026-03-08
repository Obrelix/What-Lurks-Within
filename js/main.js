'use strict';

import { TESTING } from './config.js';
import { showScreen } from './ui/screens.js';
import { initNoiseCanvas } from './ui/noise.js';
import { initEvents } from './events.js';

// ═══════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════

/**
 * @description Main initialisation — runs on DOMContentLoaded.
 */
function init() {
  showScreen('landing');
  initNoiseCanvas();
  initEvents();

  // Run validation suite if in test mode (dynamic import to avoid loading in production)
  if (TESTING) {
    import('./validation/validations.js').then(function(mod) {
      mod.runValidations();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
