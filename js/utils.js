'use strict';

import { CONFIG } from './config.js';

// ═══════════════════════════════════════════
// PURE UTILITY FUNCTIONS
// ═══════════════════════════════════════════

/**
 * @description Calculates perceived luminance from RGB values.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Luminance (0-255 range)
 */
export function calcLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * @description Extracts hue from RGB values (0-360).
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Hue in degrees (0-360)
 */
export function calcHue(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  if (d === 0) return 0;

  var h;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }

  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/**
 * @description Easing function: ease-in-out cubic.
 * @param {number} t - Progress (0 to 1)
 * @returns {number} Eased value (0 to 1)
 */
export function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * @description Easing function: ease-out exponential (fast start, slow end).
 * @param {number} t - Progress (0 to 1)
 * @returns {number} Eased value (0 to 1)
 */
export function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * @description Easing function: ease-out back (slight overshoot then settle).
 * @param {number} t - Progress (0 to 1)
 * @returns {number} Eased value (0 to 1)
 */
export function easeOutBack(t) {
  var c1 = 1.70158;
  var c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * @description Easing function: ease-out quartic (smooth deceleration).
 * @param {number} t - Progress (0 to 1)
 * @returns {number} Eased value (0 to 1)
 */
export function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * @description Array of all easing functions used for per-pixel animation.
 * @type {Array<function(number): number>}
 */
export const EASING_FUNCTIONS = [easeInOutCubic, easeOutExpo, easeOutBack, easeOutQuart];

/**
 * @description Fisher-Yates shuffle of an array (in-place).
 * @param {Array} arr
 * @returns {Array} The same array, shuffled
 */
export function fisherYatesShuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * @description Pixel sort comparator: primary by luminance band, secondary by hue.
 * @param {{ luminance: number, hue: number }} a
 * @param {{ luminance: number, hue: number }} b
 * @returns {number}
 */
export function pixelSortComparator(a, b) {
  const bandA = Math.floor(a.luminance / CONFIG.LUMINANCE_BAND_WIDTH);
  const bandB = Math.floor(b.luminance / CONFIG.LUMINANCE_BAND_WIDTH);
  if (bandA !== bandB) return bandA - bandB;
  return a.hue - b.hue;
}
