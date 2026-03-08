'use strict';

// ═══════════════════════════════════════════
// OPTION GROUP HELPERS
// ═══════════════════════════════════════════

/**
 * @description Sets up a group of buttons where only one can be active at a time.
 * @param {string} containerSelector - CSS selector for the container
 * @param {string} btnSelector - CSS selector for buttons within the container
 * @param {function} onChange - Callback receiving the clicked button's dataset
 */
export function initOptionGroup(containerSelector, btnSelector, onChange) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.addEventListener('click', function(e) {
    const btn = e.target.closest(btnSelector);
    if (!btn) return;
    container.querySelectorAll(btnSelector).forEach(function(b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    if (onChange) onChange(btn.dataset);
  });
}
