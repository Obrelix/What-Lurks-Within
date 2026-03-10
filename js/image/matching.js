'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { createPixelBuffer } from './pipeline.js';
import { generateRandomTarget } from './procedural.js';

// ═══════════════════════════════════════════
// DEFAULT IMAGE MATCHING (LUMINANCE HISTOGRAM)
// ═══════════════════════════════════════════

/**
 * @description Builds a normalized luminance histogram from a PixelBuffer.
 * @param {{ data: Uint8ClampedArray, count: number }} buffer - Pixel buffer
 * @returns {Float64Array} Normalized histogram of length CONFIG.HISTOGRAM_BINS
 */
export function buildLuminanceHistogram(buffer) {
  const bins = CONFIG.HISTOGRAM_BINS;
  const hist = new Float64Array(bins);
  const data = buffer.data;
  const count = buffer.count;

  for (let i = 0; i < count; i++) {
    const off = i * 4;
    const lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    const bin = Math.min(bins - 1, Math.floor(lum / 256 * bins));
    hist[bin]++;
  }

  for (let j = 0; j < bins; j++) {
    hist[j] /= count;
  }

  return hist;
}

/**
 * @description Computes histogram intersection similarity (0 = no overlap, 1 = identical).
 * @param {Float64Array} histA - First normalized histogram
 * @param {Float64Array} histB - Second normalized histogram
 * @returns {number} Similarity score (0 to 1)
 */
export function histogramIntersection(histA, histB) {
  let sum = 0;
  for (let i = 0; i < histA.length; i++) {
    sum += Math.min(histA[i], histB[i]);
  }
  return sum;
}

/**
 * @description Finds the index of the candidate histogram most similar to the source.
 * @param {Float64Array} sourceHist - Source luminance histogram
 * @param {Array<Float64Array>} candidateHists - Array of candidate histograms
 * @returns {number} Index of the best match
 */
export function findBestMatchIndex(sourceHist, candidateHists) {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < candidateHists.length; i++) {
    const score = histogramIntersection(sourceHist, candidateHists[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * @description Ranks candidate buffers by histogram similarity and filters out low-scoring ones.
 * @param {Float64Array} sourceHist - Source luminance histogram
 * @param {Array} buffers - Array of PixelBuffer objects
 * @param {Array<Float64Array>} histograms - Corresponding histograms
 * @returns {Array<{ buffer: object, score: number }>} Sorted best-first, filtered by HISTOGRAM_MIN_SCORE
 */
export function rankAndFilterDefaults(sourceHist, buffers, histograms) {
  const scored = [];
  for (let i = 0; i < buffers.length; i++) {
    const score = histogramIntersection(sourceHist, histograms[i]);
    if (score >= CONFIG.HISTOGRAM_MIN_SCORE) {
      scored.push({ buffer: buffers[i], score: score });
    }
  }
  scored.sort(function(a, b) { return b.score - a.score; });
  return scored;
}

/**
 * @description Loads an image from a URL path and returns a Promise resolving to an HTMLImageElement.
 * @param {string} path - Relative or absolute image path
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromPath(path) {
  return new Promise(function(resolve, reject) {
    const img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Failed to load: ' + path)); };
    img.src = path;
  });
}

/**
 * @description Loads all default images, computes histograms, and returns the best-matching PixelBuffer.
 * @param {{ data: Uint8ClampedArray, count: number, width: number, height: number }} sourceBuffer
 * @param {number} resolution - Target square dimension
 * @returns {Promise<{ width: number, height: number, data: Uint8ClampedArray, count: number }>}
 */
export async function loadBestMatchingDefaultImage(sourceBuffer, resolution) {
  const paths = CONFIG.DEFAULT_IMAGE_PATHS;
  const sourceHist = buildLuminanceHistogram(sourceBuffer);

  const loadPromises = paths.map(function(path) {
    return loadImageFromPath(path).then(function(img) {
      const buf = createPixelBuffer(img, resolution);
      return { buffer: buf, histogram: buildLuminanceHistogram(buf) };
    }).catch(function() {
      return null;
    });
  });

  const results = await Promise.all(loadPromises);

  const loaded = [];
  const histograms = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i] !== null) {
      loaded.push(results[i].buffer);
      histograms.push(results[i].histogram);
    }
  }

  if (loaded.length === 0) {
    APP_STATE.rankedTargets = null;
    APP_STATE.rankedTargetIndex = 0;
    return generateRandomTarget(resolution);
  }

  const ranked = rankAndFilterDefaults(sourceHist, loaded, histograms);

  if (ranked.length === 0) {
    APP_STATE.rankedTargets = null;
    APP_STATE.rankedTargetIndex = 0;
    return generateRandomTarget(resolution);
  }

  APP_STATE.rankedTargets = ranked;
  APP_STATE.rankedTargetIndex = 0;
  return ranked[0].buffer;
}
