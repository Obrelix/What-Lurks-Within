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
        var ax = a.targetIndex % width;
        var bx = b.targetIndex % width;
        if (ax !== bx) return ax - bx;
        var ay = Math.floor(a.targetIndex / width);
        var by = Math.floor(b.targetIndex / width);
        return ay - by;
      });
      break;
    case 'luminance_ordered':
      mapping.sort(function(a, b) {
        return a.luminance - b.luminance;
      });
      break;
    case 'spiral':
      var cx = width / 2;
      var cy = width / 2;
      mapping.sort(function(a, b) {
        var ax = a.targetIndex % width;
        var ay = Math.floor(a.targetIndex / width);
        var bx = b.targetIndex % width;
        var by = Math.floor(b.targetIndex / width);
        var dA = (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy);
        var dB = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
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
