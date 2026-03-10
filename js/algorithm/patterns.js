'use strict';

import { fisherYatesShuffle } from '../utils.js';

// ═══════════════════════════════════════════
// ANIMATION PATTERNS — SORT ORDERS
// ═══════════════════════════════════════════

/**
 * @description Sorts mapping into animation order based on the selected pattern.
 * @param {Array} mapping - The pixel mapping array
 * @param {string} pattern - Pattern name
 * @param {number} width - Canvas width (= height for square)
 * @returns {Array} The same mapping array, re-sorted
 */
export function sortMappingByPattern(mapping, pattern, width) {
  switch (pattern) {
    case 'spatial_sweep':
      mapping.sort(function(a, b) {
        const ax = a.targetIndex % width;
        const bx = b.targetIndex % width;
        if (ax !== bx) return ax - bx;
        const ay = Math.floor(a.targetIndex / width);
        const by = Math.floor(b.targetIndex / width);
        return ay - by;
      });
      break;
    case 'luminance_ordered':
      mapping.sort(function(a, b) {
        return a.luminance - b.luminance;
      });
      break;
    case 'spiral':
      const cx = width / 2;
      const cy = width / 2;
      mapping.sort(function(a, b) {
        const ax = a.targetIndex % width;
        const ay = Math.floor(a.targetIndex / width);
        const bx = b.targetIndex % width;
        const by = Math.floor(b.targetIndex / width);
        const dA = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy);
        const dB = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
        return dA - dB;
      });
      break;
    case 'random_scatter':
    default:
      fisherYatesShuffle(mapping);
      break;
  }
  return mapping;
}
