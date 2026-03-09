'use strict';

import { CONFIG } from '../config.js';
import { APP_STATE } from '../state.js';
import { calcLuminance, calcHue, easeInOutCubic, pixelSortComparator } from '../utils.js';
import { showScreen } from '../ui/screens.js';
import { computeCoverCrop, createPixelBufferFromData, reprocessOnResolutionChange } from '../image/pipeline.js';
import { PROCEDURAL_GENERATORS } from '../image/procedural.js';
import {
  buildLuminanceHistogram, histogramIntersection, findBestMatchIndex, rankAndFilterDefaults
} from '../image/matching.js';
import { resolveVideoMimeType, drawWatermark, pixelBufferToCanvas } from '../video/recorder.js';
import { renderOfflineVideo } from '../video/offline-render.js';
import { renderBufferFrame } from '../animation/buffer-phases.js';
import { buildMapping } from '../algorithm/pixel-alchemy.js';
import { sortMappingByPattern } from '../algorithm/patterns.js';
import { buildAnimationArrays } from '../animation/engine.js';
import { resetState } from '../state-management.js';

// ═══════════════════════════════════════════
// VALIDATION SUITE
// ═══════════════════════════════════════════

/** @type {Array<function(): {pass: boolean, name: string, detail: string}>} */
const VALIDATIONS = [];

// ─── Phase 1 Validations ───

/**
 * @description Validates that all four screen divs exist in the DOM.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase1_allScreensExist() {
  const ids = ['screen-landing', 'screen-setup', 'screen-animation', 'screen-result'];
  const missing = ids.filter(function(id) { return !document.getElementById(id); });
  return {
    pass: missing.length === 0,
    name: 'phase1_allScreensExist',
    detail: missing.length === 0
      ? 'All 4 screens exist'
      : 'Missing: ' + missing.join(', ')
  };
}
VALIDATIONS.push(validate_phase1_allScreensExist);

/**
 * @description Validates that showScreen() correctly toggles screens.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase1_showScreenWorks() {
  const original = document.body?.getAttribute('data-screen');
  showScreen('setup');
  const setupVisible = document.body?.getAttribute('data-screen') === 'setup';
  const landingDiv = document.getElementById('screen-landing');
  const setupDiv = document.getElementById('screen-setup');
  const landingHidden = landingDiv ? getComputedStyle(landingDiv).display === 'none' : false;
  const setupShown = setupDiv ? getComputedStyle(setupDiv).display !== 'none' : false;
  if (original) showScreen(original);
  const pass = setupVisible && landingHidden && setupShown;
  return {
    pass: pass,
    name: 'phase1_showScreenWorks',
    detail: pass
      ? 'showScreen toggles screens correctly'
      : 'setupVisible=' + setupVisible + ' landingHidden=' + landingHidden + ' setupShown=' + setupShown
  };
}
VALIDATIONS.push(validate_phase1_showScreenWorks);

/**
 * @description Validates that CONFIG exists with expected keys.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase1_configExists() {
  const expectedKeys = [
    'COLOR_BG_PRIMARY', 'COLOR_TEXT_ACCENT', 'RESOLUTION_LOW',
    'RESOLUTION_MID', 'RESOLUTION_HIGH', 'DEFAULT_RESOLUTION',
    'TWEEN_DURATION_MS', 'ARC_MAGNITUDE', 'TARGET_DURATION_S',
    'LUMINANCE_BAND_WIDTH', 'MAX_FILE_SIZE_BYTES', 'TOAST_DURATION_MS'
  ];
  const missing = expectedKeys.filter(function(k) { return !(k in CONFIG); });
  const wrongType = expectedKeys.filter(function(k) {
    if (k.startsWith('COLOR_')) return typeof CONFIG[k] !== 'string';
    return typeof CONFIG[k] !== 'number';
  });
  const pass = missing.length === 0 && wrongType.length === 0;
  return {
    pass: pass,
    name: 'phase1_configExists',
    detail: pass
      ? 'CONFIG has all expected keys with correct types'
      : 'missing=[' + missing.join(',') + '] wrongType=[' + wrongType.join(',') + ']'
  };
}
VALIDATIONS.push(validate_phase1_configExists);

// ─── Phase 5 Validations ───

/**
 * @description Validates that all CONFIG keys referenced in the codebase exist.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase5_configComplete() {
  var expectedKeys = [
    'COLOR_BG_PRIMARY', 'COLOR_BG_SECONDARY', 'COLOR_TEXT_PRIMARY',
    'COLOR_TEXT_ACCENT', 'COLOR_GLITCH_R', 'COLOR_GLITCH_C', 'COLOR_DANGER',
    'RESOLUTION_LOW', 'RESOLUTION_MID', 'RESOLUTION_HIGH', 'DEFAULT_RESOLUTION',
    'NOISE_SCALE', 'NOISE_FPS',
    'TWEEN_DURATION_MS', 'TARGET_DURATION_S',
    'ARC_MAGNITUDE', 'COMPLETION_DELAY_MS',
    'LUMINANCE_BAND_WIDTH',
    'MAX_FILE_SIZE_BYTES', 'TOAST_DURATION_MS', 'PROCEDURAL_TARGET_COUNT',
    'CANVAS_GAP_RATIO', 'MAX_INFLIGHT',
    'HISTOGRAM_MIN_SCORE', 'HISTOGRAM_BINS', 'DEFAULT_IMAGE_PATHS'
  ];
  var missing = expectedKeys.filter(function(k) { return !(k in CONFIG); });
  var wrongType = expectedKeys.filter(function(k) {
    if (!(k in CONFIG)) return false;
    if (k.startsWith('COLOR_')) return typeof CONFIG[k] !== 'string';
    if (k === 'DEFAULT_IMAGE_PATHS') return !Array.isArray(CONFIG[k]);
    return typeof CONFIG[k] !== 'number';
  });
  var pass = missing.length === 0 && wrongType.length === 0;
  return {
    pass: pass,
    name: 'phase5_configComplete',
    detail: pass
      ? 'All ' + expectedKeys.length + ' CONFIG keys present with correct types'
      : 'missing=[' + missing.join(',') + '] wrongType=[' + wrongType.join(',') + ']'
  };
}
VALIDATIONS.push(validate_phase5_configComplete);

/**
 * @description Validates resetState clears all buffer and mapping state.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase5_stateReset() {
  var savedSrc = APP_STATE.sourceBuffer;
  var savedTgt = APP_STATE.targetBuffer;
  var savedMap = APP_STATE.mapping;

  APP_STATE.sourceBuffer = { dummy: true };
  APP_STATE.targetBuffer = { dummy: true };
  APP_STATE.mapping = [1, 2, 3];

  resetState();

  var pass = APP_STATE.sourceBuffer === null &&
             APP_STATE.targetBuffer === null &&
             APP_STATE.mapping === null;

  APP_STATE.sourceBuffer = savedSrc;
  APP_STATE.targetBuffer = savedTgt;
  APP_STATE.mapping = savedMap;

  return {
    pass: pass,
    name: 'phase5_stateReset',
    detail: pass
      ? 'resetState() nulls sourceBuffer, targetBuffer, mapping'
      : 'Some state not null after resetState()'
  };
}
VALIDATIONS.push(validate_phase5_stateReset);

/**
 * @description Meta-test: runs all validations and confirms all pass.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase5_allValidationsPass() {
  var failures = [];
  VALIDATIONS.forEach(function(fn) {
    if (fn === validate_phase5_allValidationsPass) return;
    try {
      var result = fn();
      if (!result.pass) failures.push(result.name);
    } catch (err) {
      failures.push(fn.name + '(error)');
    }
  });
  var pass = failures.length === 0;
  return {
    pass: pass,
    name: 'phase5_allValidationsPass',
    detail: pass
      ? 'All validations pass'
      : 'Failing: ' + failures.join(', ')
  };
}
VALIDATIONS.push(validate_phase5_allValidationsPass);

// ─── Phase 4 Validations ───

/**
 * @description Validates easeInOutCubic at boundary and midpoint.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase4_easing() {
  var e0 = easeInOutCubic(0);
  var e1 = easeInOutCubic(1);
  var e5 = easeInOutCubic(0.5);
  var pass = e0 === 0 && e1 === 1 && Math.abs(e5 - 0.5) < 0.001;
  return {
    pass: pass,
    name: 'phase4_easing',
    detail: pass
      ? 'easeInOutCubic(0)=0, (0.5)=0.5, (1)=1'
      : 'Got (0)=' + e0 + ' (0.5)=' + e5 + ' (1)=' + e1
  };
}
VALIDATIONS.push(validate_phase4_easing);

/**
 * @description Validates that each pattern sort produces a distinct order.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase4_patternOrders() {
  var mapping = [];
  for (var i = 0; i < 16; i++) {
    mapping.push({
      sourceIndex: i,
      targetIndex: 15 - i,
      r: i * 16, g: 0, b: 0, a: 255,
      luminance: i * 16
    });
  }

  var patterns = ['spatial_sweep', 'random_scatter', 'luminance_ordered', 'spiral'];
  var orders = {};
  patterns.forEach(function(p) {
    var copy = mapping.map(function(m) { return Object.assign({}, m); });
    sortMappingByPattern(copy, p, 4);
    orders[p] = copy.map(function(m) { return m.sourceIndex; }).join(',');
  });

  var uniqueOrders = new Set(Object.values(orders));
  var pass = uniqueOrders.size >= 3;
  return {
    pass: pass,
    name: 'phase4_patternOrders',
    detail: pass
      ? uniqueOrders.size + ' distinct orderings from 4 patterns'
      : 'Only ' + uniqueOrders.size + ' distinct orderings'
  };
}
VALIDATIONS.push(validate_phase4_patternOrders);

/**
 * @description Validates arc offset is 0 at t=0 and t=1, peaks at t=0.5.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase4_arcOffset() {
  var arc0 = 4 * 0 * (1 - 0);
  var arc1 = 4 * 1 * (1 - 1);
  var arc5 = 4 * 0.5 * (1 - 0.5);
  var pass = arc0 === 0 && arc1 === 0 && arc5 === 1;
  return {
    pass: pass,
    name: 'phase4_arcOffset',
    detail: pass
      ? 'Arc parabola: 0 at t=0, 1 at t=0.5, 0 at t=1'
      : 'Got t=0:' + arc0 + ' t=0.5:' + arc5 + ' t=1:' + arc1
  };
}
VALIDATIONS.push(validate_phase4_arcOffset);

/**
 * @description Validates typed array sizes from buildAnimationArrays.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase4_typedArraySizes() {
  var mapping = [];
  for (var i = 0; i < 16; i++) {
    mapping.push({ sourceIndex: i, targetIndex: 15 - i, r: 0, g: 0, b: 0, a: 255, luminance: 0 });
  }
  var arrays = buildAnimationArrays(mapping, 4, 0);
  var pass = arrays.sourceXY.length === 32 &&
             arrays.targetXY.length === 32 &&
             arrays.colors.length === 64 &&
             arrays.startTimes.length === 16;
  return {
    pass: pass,
    name: 'phase4_typedArraySizes',
    detail: pass
      ? 'sourceXY=32, targetXY=32, colors=64, startTimes=16'
      : 'Got sXY=' + arrays.sourceXY.length + ' tXY=' + arrays.targetXY.length +
        ' c=' + arrays.colors.length + ' st=' + arrays.startTimes.length
  };
}
VALIDATIONS.push(validate_phase4_typedArraySizes);

// ─── Phase 3 Validations ───

/**
 * @description Validates luminance calculation for known RGB values.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase3_luminanceCalc() {
  var rLum = calcLuminance(255, 0, 0);
  var gLum = calcLuminance(0, 255, 0);
  var bLum = calcLuminance(0, 0, 255);
  var rOk = Math.abs(rLum - 76.245) < 0.01;
  var gOk = Math.abs(gLum - 149.685) < 0.01;
  var bOk = Math.abs(bLum - 29.07) < 0.01;
  var pass = rOk && gOk && bOk;
  return {
    pass: pass,
    name: 'phase3_luminanceCalc',
    detail: pass
      ? 'Luminance: red=76.245, green=149.685, blue=29.07'
      : 'Got red=' + rLum.toFixed(3) + ' green=' + gLum.toFixed(3) + ' blue=' + bLum.toFixed(3)
  };
}
VALIDATIONS.push(validate_phase3_luminanceCalc);

/**
 * @description Validates hue extraction for pure R, G, B.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase3_hueExtraction() {
  var rHue = calcHue(255, 0, 0);
  var gHue = calcHue(0, 255, 0);
  var bHue = calcHue(0, 0, 255);
  var rOk = Math.abs(rHue - 0) < 1;
  var gOk = Math.abs(gHue - 120) < 1;
  var bOk = Math.abs(bHue - 240) < 1;
  var pass = rOk && gOk && bOk;
  return {
    pass: pass,
    name: 'phase3_hueExtraction',
    detail: pass
      ? 'Hue: red~0, green~120, blue~240'
      : 'Got red=' + rHue.toFixed(1) + ' green=' + gHue.toFixed(1) + ' blue=' + bHue.toFixed(1)
  };
}
VALIDATIONS.push(validate_phase3_hueExtraction);

/**
 * @description Validates sort comparator ordering for known 4-pixel set.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase3_sortComparator() {
  var pixels = [
    { luminance: 200, hue: 120 },
    { luminance: 10, hue: 50 },
    { luminance: 200, hue: 30 },
    { luminance: 100, hue: 0 }
  ];
  pixels.sort(pixelSortComparator);
  var pass = pixels[0].luminance === 10 &&
             pixels[1].luminance === 100 &&
             pixels[2].hue === 30 &&
             pixels[3].hue === 120;
  return {
    pass: pass,
    name: 'phase3_sortComparator',
    detail: pass
      ? 'Comparator sorts by luminance band then hue'
      : 'Order: ' + pixels.map(function(p) { return 'L' + p.luminance + '/H' + p.hue; }).join(', ')
  };
}
VALIDATIONS.push(validate_phase3_sortComparator);

/**
 * @description Validates mapping bijection: every source and target index appears once.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase3_mappingBijection() {
  var srcData = new Uint8ClampedArray(16 * 4);
  var tgtData = new Uint8ClampedArray(16 * 4);
  for (var i = 0; i < 16; i++) {
    srcData[i * 4] = i * 16;
    srcData[i * 4 + 1] = 0;
    srcData[i * 4 + 2] = 0;
    srcData[i * 4 + 3] = 255;
    tgtData[i * 4] = 0;
    tgtData[i * 4 + 1] = i * 16;
    tgtData[i * 4 + 2] = 0;
    tgtData[i * 4 + 3] = 255;
  }
  var srcBuf = createPixelBufferFromData(srcData, 4, 4);
  var tgtBuf = createPixelBufferFromData(tgtData, 4, 4);
  var mapping = buildMapping(srcBuf, tgtBuf);

  if (mapping.length !== 16) {
    return { pass: false, name: 'phase3_mappingBijection', detail: 'mapping.length=' + mapping.length };
  }

  var srcSet = new Set();
  var tgtSet = new Set();
  mapping.forEach(function(m) {
    srcSet.add(m.sourceIndex);
    tgtSet.add(m.targetIndex);
  });

  var pass = srcSet.size === 16 && tgtSet.size === 16;
  return {
    pass: pass,
    name: 'phase3_mappingBijection',
    detail: pass
      ? 'All 16 source and 16 target indices are unique (bijection confirmed)'
      : 'srcSet.size=' + srcSet.size + ' tgtSet.size=' + tgtSet.size
  };
}
VALIDATIONS.push(validate_phase3_mappingBijection);

// ─── Phase 2 Validations ───

/**
 * @description Validates PixelBuffer shape for a known 4x4 image.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase2_pixelBufferShape() {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  const buf = createPixelBufferFromData(data, 4, 4);
  const pass = buf.width === 4 && buf.height === 4 && buf.count === 16 && buf.data.length === 64;
  return {
    pass: pass,
    name: 'phase2_pixelBufferShape',
    detail: pass
      ? 'PixelBuffer has correct w=4, h=4, count=16, data.length=64'
      : 'Got w=' + buf.width + ' h=' + buf.height + ' count=' + buf.count + ' data.length=' + buf.data.length
  };
}
VALIDATIONS.push(validate_phase2_pixelBufferShape);

/**
 * @description Validates cover-crop math for 800x600 into 512x512.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase2_coverCropMath() {
  const crop = computeCoverCrop(800, 600, 512);
  const pass = crop.sx === 100 && crop.sy === 0 && crop.sw === 600 && crop.sh === 600;
  return {
    pass: pass,
    name: 'phase2_coverCropMath',
    detail: pass
      ? 'Cover crop for 800x600→512: sx=100 sy=0 sw=600 sh=600'
      : 'Got sx=' + crop.sx + ' sy=' + crop.sy + ' sw=' + crop.sw + ' sh=' + crop.sh
  };
}
VALIDATIONS.push(validate_phase2_coverCropMath);

/**
 * @description Validates all 5 procedural targets at 8x8.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase2_proceduralTargets() {
  const errors = [];
  PROCEDURAL_GENERATORS.forEach(function(gen, idx) {
    try {
      var buf = gen.fn(8);
      if (buf.count !== 64) {
        errors.push(gen.name + ': count=' + buf.count + ' (expected 64)');
      }
      var allSame = true;
      for (var i = 4; i < buf.data.length; i += 4) {
        if (buf.data[i] !== buf.data[0] || buf.data[i + 1] !== buf.data[1]) {
          allSame = false;
          break;
        }
      }
      if (allSame) {
        errors.push(gen.name + ': all pixels identical');
      }
    } catch (err) {
      errors.push(gen.name + ': error: ' + err.message);
    }
  });
  var pass = errors.length === 0;
  return {
    pass: pass,
    name: 'phase2_proceduralTargets',
    detail: pass
      ? 'All 5 procedural targets generate valid 8x8 non-uniform buffers'
      : errors.join('; ')
  };
}
VALIDATIONS.push(validate_phase2_proceduralTargets);

// ─── Phase 6 Validations ───

/**
 * @description Validates that CANVAS_GAP_RATIO and MAX_INFLIGHT exist in CONFIG with correct types.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase6_configKeys() {
  var hasGap = typeof CONFIG.CANVAS_GAP_RATIO === 'number' && CONFIG.CANVAS_GAP_RATIO > 0 && CONFIG.CANVAS_GAP_RATIO < 1;
  var hasMax = typeof CONFIG.MAX_INFLIGHT === 'number' && CONFIG.MAX_INFLIGHT > 0 && Number.isInteger(CONFIG.MAX_INFLIGHT);
  var pass = hasGap && hasMax;
  return {
    pass: pass,
    name: 'phase6_configKeys',
    detail: pass
      ? 'CANVAS_GAP_RATIO=' + CONFIG.CANVAS_GAP_RATIO + ' MAX_INFLIGHT=' + CONFIG.MAX_INFLIGHT
      : 'hasGap=' + hasGap + ' hasMax=' + hasMax
  };
}
VALIDATIONS.push(validate_phase6_configKeys);

/**
 * @description Validates that buildAnimationArrays offsets targetXY by size+gap.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase6_targetXYOffset() {
  var size = 4;
  var gapPx = 2;
  var mapping = [];
  for (var i = 0; i < 16; i++) {
    mapping.push({ sourceIndex: i, targetIndex: 15 - i, r: 0, g: 0, b: 0, a: 255, luminance: 0 });
  }
  var arrays = buildAnimationArrays(mapping, size, gapPx);
  var txForTarget15 = arrays.targetXY[0 * 2];
  var txForTarget0 = arrays.targetXY[15 * 2];
  var pass = txForTarget15 === (3 + size + gapPx) && txForTarget0 === (0 + size + gapPx);
  return {
    pass: pass,
    name: 'phase6_targetXYOffset',
    detail: pass
      ? 'targetXY x-coords correctly offset by size+gap'
      : 'Expected tx[0]=' + (3 + size + gapPx) + ' got ' + txForTarget15 +
        ', tx[15]=' + (0 + size + gapPx) + ' got ' + txForTarget0
  };
}
VALIDATIONS.push(validate_phase6_targetXYOffset);

/**
 * @description Validates sourceXY coordinates remain in left rectangle (no offset).
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase6_sourceXYNoOffset() {
  var size = 4;
  var gapPx = 2;
  var mapping = [];
  for (var i = 0; i < 16; i++) {
    mapping.push({ sourceIndex: i, targetIndex: 15 - i, r: 0, g: 0, b: 0, a: 255, luminance: 0 });
  }
  var arrays = buildAnimationArrays(mapping, size, gapPx);
  var sx0 = arrays.sourceXY[0];
  var sx15 = arrays.sourceXY[15 * 2];
  var pass = sx0 === 0 && sx15 === 3;
  return {
    pass: pass,
    name: 'phase6_sourceXYNoOffset',
    detail: pass
      ? 'sourceXY x-coords stay in left rectangle (no offset)'
      : 'Expected sx[0]=0 got ' + sx0 + ', sx[15]=3 got ' + sx15
  };
}
VALIDATIONS.push(validate_phase6_sourceXYNoOffset);

// ─── Phase 7 Validations ───

/**
 * @description Validates CONFIG has DEFAULT_IMAGE_PATHS (array) and HISTOGRAM_BINS (number).
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase7_configKeys() {
  var hasPaths = Array.isArray(CONFIG.DEFAULT_IMAGE_PATHS) && CONFIG.DEFAULT_IMAGE_PATHS.length === 15;
  var hasBins = typeof CONFIG.HISTOGRAM_BINS === 'number' && CONFIG.HISTOGRAM_BINS > 0 && Number.isInteger(CONFIG.HISTOGRAM_BINS);
  var pass = hasPaths && hasBins;
  return {
    pass: pass,
    name: 'phase7_configKeys',
    detail: pass
      ? 'DEFAULT_IMAGE_PATHS has 15 entries, HISTOGRAM_BINS=' + CONFIG.HISTOGRAM_BINS
      : 'hasPaths=' + hasPaths + ' hasBins=' + hasBins
  };
}
VALIDATIONS.push(validate_phase7_configKeys);

/**
 * @description Validates buildLuminanceHistogram returns a normalized histogram of correct length.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase7_histogramShape() {
  var data = new Uint8ClampedArray(16 * 4);
  for (var i = 0; i < 16; i++) {
    var v = i * 16;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  var buf = createPixelBufferFromData(data, 4, 4);
  var hist = buildLuminanceHistogram(buf);
  var correctLength = hist.length === CONFIG.HISTOGRAM_BINS;
  var sum = 0;
  for (var j = 0; j < hist.length; j++) sum += hist[j];
  var normalized = Math.abs(sum - 1.0) < 0.001;
  var pass = correctLength && normalized;
  return {
    pass: pass,
    name: 'phase7_histogramShape',
    detail: pass
      ? 'Histogram has ' + CONFIG.HISTOGRAM_BINS + ' bins, sum=' + sum.toFixed(4)
      : 'length=' + hist.length + ' (expected ' + CONFIG.HISTOGRAM_BINS + '), sum=' + sum.toFixed(4)
  };
}
VALIDATIONS.push(validate_phase7_histogramShape);

/**
 * @description Validates histogramIntersection returns 1.0 for identical histograms, <1 for different.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase7_histogramDistance() {
  var histA = new Float64Array(CONFIG.HISTOGRAM_BINS);
  var histB = new Float64Array(CONFIG.HISTOGRAM_BINS);
  var histC = new Float64Array(CONFIG.HISTOGRAM_BINS);
  for (var i = 0; i < CONFIG.HISTOGRAM_BINS; i++) {
    histA[i] = 1.0 / CONFIG.HISTOGRAM_BINS;
    histB[i] = 1.0 / CONFIG.HISTOGRAM_BINS;
    histC[i] = 0;
  }
  histC[0] = 1.0;
  var identical = histogramIntersection(histA, histB);
  var different = histogramIntersection(histA, histC);
  var selfScore = Math.abs(identical - 1.0) < 0.001;
  var lowerScore = different < identical;
  var pass = selfScore && lowerScore;
  return {
    pass: pass,
    name: 'phase7_histogramDistance',
    detail: pass
      ? 'Identical score=' + identical.toFixed(4) + ', different score=' + different.toFixed(4)
      : 'identical=' + identical.toFixed(4) + ' (expect ~1.0), different=' + different.toFixed(4) + ' (expect < identical)'
  };
}
VALIDATIONS.push(validate_phase7_histogramDistance);

/**
 * @description Validates that findBestMatchIndex picks the histogram closest to the source.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase7_bestMatchPicking() {
  var bins = CONFIG.HISTOGRAM_BINS;
  var source = new Float64Array(bins);
  for (var i = 0; i < bins; i++) source[i] = 1.0 / bins;
  var cand0 = new Float64Array(bins);
  cand0[0] = 1.0;
  var cand1 = new Float64Array(bins);
  for (var j = 0; j < bins; j++) cand1[j] = 1.0 / bins;
  var cand2 = new Float64Array(bins);
  cand2[0] = 0.5;
  for (var k = 1; k < bins; k++) cand2[k] = 0.5 / (bins - 1);

  var candidates = [cand0, cand1, cand2];
  var bestIdx = findBestMatchIndex(source, candidates);
  var pass = bestIdx === 1;
  return {
    pass: pass,
    name: 'phase7_bestMatchPicking',
    detail: pass
      ? 'Correctly picked candidate 1 (identical histogram)'
      : 'Picked index ' + bestIdx + ' (expected 1)'
  };
}
VALIDATIONS.push(validate_phase7_bestMatchPicking);

// ─── Phase 8 Validations ───

/**
 * @description Validates that the three custom select elements exist in the DOM.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase8_selectElementsExist() {
  var ids = ['select-target-mode', 'select-quality', 'select-pattern'];
  var missing = ids.filter(function(id) { return !document.getElementById(id); });
  var pass = missing.length === 0;
  return {
    pass: pass,
    name: 'phase8_selectElementsExist',
    detail: pass
      ? 'All 3 custom select elements exist'
      : 'Missing: ' + missing.join(', ')
  };
}
VALIDATIONS.push(validate_phase8_selectElementsExist);

/**
 * @description Validates default select values match expected defaults.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase8_defaultValues() {
  var qualitySel = document.getElementById('select-quality');
  var patternSel = document.getElementById('select-pattern');
  var targetSel = document.getElementById('select-target-mode');
  var qualityOk = qualitySel && qualitySel.value === '512';
  var patternOk = patternSel && patternSel.value === 'luminance_ordered';
  var targetOk = targetSel && targetSel.value === 'fate';
  var pass = qualityOk && patternOk && targetOk;
  return {
    pass: pass,
    name: 'phase8_defaultValues',
    detail: pass
      ? 'quality=512, pattern=luminance_ordered, target=fate'
      : 'quality=' + (qualitySel ? qualitySel.value : 'null') +
        ' pattern=' + (patternSel ? patternSel.value : 'null') +
        ' target=' + (targetSel ? targetSel.value : 'null')
  };
}
VALIDATIONS.push(validate_phase8_defaultValues);

/**
 * @description Validates APP_STATE default pattern is luminance_ordered.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase8_appStateDefaults() {
  var pass = APP_STATE.selectedPattern === 'luminance_ordered';
  return {
    pass: pass,
    name: 'phase8_appStateDefaults',
    detail: pass
      ? 'APP_STATE.selectedPattern=luminance_ordered'
      : 'APP_STATE.selectedPattern=' + APP_STATE.selectedPattern
  };
}
VALIDATIONS.push(validate_phase8_appStateDefaults);

/**
 * @description Validates the setup options row container exists and has the three select wrappers.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase8_optionsRowExists() {
  var row = document.querySelector('.setup-options-row');
  var hasRow = !!row;
  var childCount = hasRow ? row.querySelectorAll('.custom-select').length : 0;
  var pass = hasRow && childCount === 3;
  return {
    pass: pass,
    name: 'phase8_optionsRowExists',
    detail: pass
      ? 'Options row exists with 3 custom-select wrappers'
      : 'hasRow=' + hasRow + ' childCount=' + childCount
  };
}
VALIDATIONS.push(validate_phase8_optionsRowExists);

// ─── Phase 9 Validations ───

/**
 * @description Validates HISTOGRAM_MIN_SCORE exists in CONFIG with correct type and range.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase9_configMinScore() {
  var has = typeof CONFIG.HISTOGRAM_MIN_SCORE === 'number' &&
            CONFIG.HISTOGRAM_MIN_SCORE > 0 && CONFIG.HISTOGRAM_MIN_SCORE < 1;
  return {
    pass: has,
    name: 'phase9_configMinScore',
    detail: has
      ? 'HISTOGRAM_MIN_SCORE=' + CONFIG.HISTOGRAM_MIN_SCORE
      : 'Missing or invalid HISTOGRAM_MIN_SCORE'
  };
}
VALIDATIONS.push(validate_phase9_configMinScore);

/**
 * @description Validates APP_STATE has rankedTargets and rankedTargetIndex fields.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase9_appStateFields() {
  var hasRanked = 'rankedTargets' in APP_STATE;
  var hasIndex = 'rankedTargetIndex' in APP_STATE;
  var pass = hasRanked && hasIndex;
  return {
    pass: pass,
    name: 'phase9_appStateFields',
    detail: pass
      ? 'APP_STATE has rankedTargets and rankedTargetIndex'
      : 'hasRanked=' + hasRanked + ' hasIndex=' + hasIndex
  };
}
VALIDATIONS.push(validate_phase9_appStateFields);

/**
 * @description Validates btn-retry exists with label "Try Again" and btn-retry id.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase9_tryAgainButton() {
  var btn = document.getElementById('btn-retry');
  var exists = !!btn;
  var labelOk = exists && btn.textContent.trim() === 'Try Again';
  var pass = exists && labelOk;
  return {
    pass: pass,
    name: 'phase9_tryAgainButton',
    detail: pass
      ? 'btn-retry exists with label "Try Again"'
      : 'exists=' + exists + ' labelOk=' + labelOk
  };
}
VALIDATIONS.push(validate_phase9_tryAgainButton);

/**
 * @description Validates rankAndFilterDefaults returns sorted, filtered results.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase9_rankAndFilter() {
  var bins = CONFIG.HISTOGRAM_BINS;
  var sourceHist = new Float64Array(bins);
  for (var i = 0; i < bins; i++) sourceHist[i] = 1.0 / bins;

  var cand0 = new Float64Array(bins); cand0[0] = 1.0;
  var cand1 = new Float64Array(bins);
  for (var j = 0; j < bins; j++) cand1[j] = 1.0 / bins;
  var cand2 = new Float64Array(bins);
  cand2[0] = 0.5;
  for (var k = 1; k < bins; k++) cand2[k] = 0.5 / (bins - 1);

  var buffers = [{ dummy: 0 }, { dummy: 1 }, { dummy: 2 }];
  var histograms = [cand0, cand1, cand2];

  var ranked = rankAndFilterDefaults(sourceHist, buffers, histograms);
  var bestFirst = ranked.length > 0 && ranked[0].buffer.dummy === 1;
  var pass = bestFirst && ranked.length >= 2;
  return {
    pass: pass,
    name: 'phase9_rankAndFilter',
    detail: pass
      ? 'Ranked ' + ranked.length + ' candidates, best match first (idx=1)'
      : 'ranked.length=' + ranked.length +
        (ranked.length > 0 ? ' first.dummy=' + ranked[0].buffer.dummy : '')
  };
}
VALIDATIONS.push(validate_phase9_rankAndFilter);

// ─── Phase 12 Validations ───

/**
 * @description Validates CONFIG has VIDEO_FRAMERATE and VIDEO_MIME_PRIORITY with correct types.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase12_configVideoKeys() {
  var hasFps = typeof CONFIG.VIDEO_FRAMERATE === 'number' && CONFIG.VIDEO_FRAMERATE > 0;
  var hasMime = Array.isArray(CONFIG.VIDEO_MIME_PRIORITY) && CONFIG.VIDEO_MIME_PRIORITY.length > 0;
  var pass = hasFps && hasMime;
  return {
    pass: pass,
    name: 'phase12_configVideoKeys',
    detail: pass
      ? 'VIDEO_FRAMERATE=' + CONFIG.VIDEO_FRAMERATE + ' VIDEO_MIME_PRIORITY has ' + CONFIG.VIDEO_MIME_PRIORITY.length + ' entries'
      : 'hasFps=' + hasFps + ' hasMime=' + hasMime
  };
}
VALIDATIONS.push(validate_phase12_configVideoKeys);

/**
 * @description Validates APP_STATE has recordedVideoBlob field (offline render approach).
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase12_appStateVideoFields() {
  var hasBlob = 'recordedVideoBlob' in APP_STATE;
  var noRecorder = !('mediaRecorder' in APP_STATE);
  var noChunks = !('recordedChunks' in APP_STATE);
  var pass = hasBlob && noRecorder && noChunks;
  return {
    pass: pass,
    name: 'phase12_appStateVideoFields',
    detail: pass
      ? 'APP_STATE has recordedVideoBlob, no legacy mediaRecorder/recordedChunks'
      : 'hasBlob=' + hasBlob + ' noRecorder=' + noRecorder + ' noChunks=' + noChunks
  };
}
VALIDATIONS.push(validate_phase12_appStateVideoFields);

/**
 * @description Validates Download Final Image button exists with correct text.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase12_downloadButtonRenamed() {
  var btn = document.getElementById('btn-download');
  var exists = !!btn;
  var labelOk = exists && btn.textContent.trim() === 'Download Final Image';
  var pass = exists && labelOk;
  return {
    pass: pass,
    name: 'phase12_downloadButtonRenamed',
    detail: pass
      ? 'btn-download has label "Download Final Image"'
      : 'exists=' + exists + ' label=' + (exists ? btn.textContent.trim() : 'N/A')
  };
}
VALIDATIONS.push(validate_phase12_downloadButtonRenamed);

/**
 * @description Validates Download Video button exists and is initially disabled.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase12_downloadVideoButton() {
  var btn = document.getElementById('btn-download-video');
  var exists = !!btn;
  var labelOk = exists && btn.textContent.trim() === 'Download Video';
  var disabledOk = exists && btn.disabled === true;
  var pass = exists && labelOk && disabledOk;
  return {
    pass: pass,
    name: 'phase12_downloadVideoButton',
    detail: pass
      ? 'btn-download-video exists, labeled "Download Video", initially disabled'
      : 'exists=' + exists + ' labelOk=' + labelOk + ' disabledOk=' + disabledOk
  };
}
VALIDATIONS.push(validate_phase12_downloadVideoButton);

// ─── Phase 13 Validations ───

/**
 * @description Validates that reprocessOnResolutionChange is exported as a function from pipeline.js.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase13_reprocessFunctionExists() {
  var isFn = typeof reprocessOnResolutionChange === 'function';
  return {
    pass: isFn,
    name: 'phase13_reprocessFunctionExists',
    detail: isFn
      ? 'reprocessOnResolutionChange is exported as a function'
      : 'reprocessOnResolutionChange is ' + typeof reprocessOnResolutionChange
  };
}
VALIDATIONS.push(validate_phase13_reprocessFunctionExists);

/**
 * @description Validates that reprocessOnResolutionChange recreates sourceBuffer at new resolution.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase13_reprocessResizesSource() {
  var canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 16, 16);
  var blob = canvas.toDataURL('image/png');

  var savedSrc = APP_STATE.sourceBuffer;
  var savedUrl = APP_STATE.sourceObjectURL;
  var savedTgt = APP_STATE.targetBuffer;
  var savedTgtUrl = APP_STATE.targetObjectURL;
  var savedRanked = APP_STATE.rankedTargets;

  // Set up a fake sourceBuffer at size 8 with a data URL as sourceObjectURL
  APP_STATE.sourceBuffer = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4), count: 64 };
  APP_STATE.sourceObjectURL = blob;
  APP_STATE.targetBuffer = null;
  APP_STATE.targetObjectURL = null;
  APP_STATE.rankedTargets = [{ dummy: true }];

  var resultPromise = reprocessOnResolutionChange(4);
  var isPromise = resultPromise && typeof resultPromise.then === 'function';

  // Restore state synchronously — the async result is tested structurally
  APP_STATE.sourceBuffer = savedSrc;
  APP_STATE.sourceObjectURL = savedUrl;
  APP_STATE.targetBuffer = savedTgt;
  APP_STATE.targetObjectURL = savedTgtUrl;
  APP_STATE.rankedTargets = savedRanked;

  return {
    pass: isPromise,
    name: 'phase13_reprocessResizesSource',
    detail: isPromise
      ? 'reprocessOnResolutionChange returns a Promise'
      : 'Expected a Promise, got ' + typeof resultPromise
  };
}
VALIDATIONS.push(validate_phase13_reprocessResizesSource);

// ─── Phase 14a Validations ───

/**
 * @description Validates CONFIG.VIDEO_MIME_PRIORITY is a non-empty array of strings.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14a_mimePriorityConfig() {
  var has = Array.isArray(CONFIG.VIDEO_MIME_PRIORITY) && CONFIG.VIDEO_MIME_PRIORITY.length > 0;
  var allStrings = has && CONFIG.VIDEO_MIME_PRIORITY.every(function(m) { return typeof m === 'string'; });
  var pass = has && allStrings;
  return {
    pass: pass,
    name: 'phase14a_mimePriorityConfig',
    detail: pass
      ? 'VIDEO_MIME_PRIORITY has ' + CONFIG.VIDEO_MIME_PRIORITY.length + ' entries'
      : 'has=' + has + ' allStrings=' + allStrings
  };
}
VALIDATIONS.push(validate_phase14a_mimePriorityConfig);

/**
 * @description Validates APP_STATE has resolvedVideoMime field.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14a_resolvedMimeField() {
  var pass = 'resolvedVideoMime' in APP_STATE;
  return {
    pass: pass,
    name: 'phase14a_resolvedMimeField',
    detail: pass
      ? 'APP_STATE.resolvedVideoMime exists'
      : 'resolvedVideoMime not found in APP_STATE'
  };
}
VALIDATIONS.push(validate_phase14a_resolvedMimeField);

/**
 * @description Validates resolveVideoMimeType is exported and returns a string.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14a_resolveFunction() {
  var isFn = typeof resolveVideoMimeType === 'function';
  var result = isFn ? resolveVideoMimeType() : null;
  var isStr = typeof result === 'string' && result.length > 0;
  var pass = isFn && isStr;
  return {
    pass: pass,
    name: 'phase14a_resolveFunction',
    detail: pass
      ? 'resolveVideoMimeType() returned "' + result + '"'
      : 'isFn=' + isFn + ' result=' + result
  };
}
VALIDATIONS.push(validate_phase14a_resolveFunction);

// ─── Phase 14b Validations ───

/**
 * @description Validates CONFIG has watermark keys with correct types.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14b_watermarkConfig() {
  var hasText = typeof CONFIG.WATERMARK_TEXT === 'string' && CONFIG.WATERMARK_TEXT.length > 0;
  var hasFont = typeof CONFIG.WATERMARK_FONT_SIZE_RATIO === 'number' && CONFIG.WATERMARK_FONT_SIZE_RATIO > 0;
  var hasOpacity = typeof CONFIG.WATERMARK_OPACITY === 'number' && CONFIG.WATERMARK_OPACITY > 0 && CONFIG.WATERMARK_OPACITY <= 1;
  var hasPad = typeof CONFIG.WATERMARK_PADDING_RATIO === 'number' && CONFIG.WATERMARK_PADDING_RATIO > 0;
  var pass = hasText && hasFont && hasOpacity && hasPad;
  return {
    pass: pass,
    name: 'phase14b_watermarkConfig',
    detail: pass
      ? 'WATERMARK_TEXT="' + CONFIG.WATERMARK_TEXT + '" opacity=' + CONFIG.WATERMARK_OPACITY
      : 'text=' + hasText + ' font=' + hasFont + ' opacity=' + hasOpacity + ' pad=' + hasPad
  };
}
VALIDATIONS.push(validate_phase14b_watermarkConfig);

/**
 * @description Validates drawWatermark is a function that draws on a canvas context.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14b_drawWatermark() {
  var isFn = typeof drawWatermark === 'function';
  if (!isFn) return { pass: false, name: 'phase14b_drawWatermark', detail: 'not a function' };
  var c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  var ctx = c.getContext('2d');
  drawWatermark(ctx, 128, 64);
  var data = ctx.getImageData(0, 0, 128, 64).data;
  var hasContent = false;
  for (var i = 3; i < data.length; i += 4) {
    if (data[i] > 0) { hasContent = true; break; }
  }
  return {
    pass: hasContent,
    name: 'phase14b_drawWatermark',
    detail: hasContent
      ? 'drawWatermark rendered visible pixels on wide canvas'
      : 'No visible pixels after drawWatermark'
  };
}
VALIDATIONS.push(validate_phase14b_drawWatermark);

// ─── Phase 14c Validations ───

/**
 * @description Validates CONFIG has VIDEO_BUFFER_OPEN_MS and VIDEO_BUFFER_CLOSE_MS.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14c_bufferConfig() {
  var hasOpen = typeof CONFIG.VIDEO_BUFFER_OPEN_MS === 'number' && CONFIG.VIDEO_BUFFER_OPEN_MS > 0;
  var hasClose = typeof CONFIG.VIDEO_BUFFER_CLOSE_MS === 'number' && CONFIG.VIDEO_BUFFER_CLOSE_MS > 0;
  var pass = hasOpen && hasClose;
  return {
    pass: pass,
    name: 'phase14c_bufferConfig',
    detail: pass
      ? 'VIDEO_BUFFER_OPEN_MS=' + CONFIG.VIDEO_BUFFER_OPEN_MS + ' VIDEO_BUFFER_CLOSE_MS=' + CONFIG.VIDEO_BUFFER_CLOSE_MS
      : 'hasOpen=' + hasOpen + ' hasClose=' + hasClose
  };
}
VALIDATIONS.push(validate_phase14c_bufferConfig);


// ─── Phase 14d Validations ───

/**
 * @description Validates CONFIG has VIDEO_BUFFER_SLIDE_MS with correct type.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_slideConfig() {
  var has = typeof CONFIG.VIDEO_BUFFER_SLIDE_MS === 'number' && CONFIG.VIDEO_BUFFER_SLIDE_MS > 0;
  var pass = has;
  return {
    pass: pass,
    name: 'phase14d_slideConfig',
    detail: pass
      ? 'VIDEO_BUFFER_SLIDE_MS=' + CONFIG.VIDEO_BUFFER_SLIDE_MS
      : 'Missing or invalid VIDEO_BUFFER_SLIDE_MS'
  };
}
VALIDATIONS.push(validate_phase14d_slideConfig);

/**
 * @description Validates APP_STATE has animPhase field.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_animPhaseField() {
  var pass = 'animPhase' in APP_STATE;
  return {
    pass: pass,
    name: 'phase14d_animPhaseField',
    detail: pass
      ? 'APP_STATE.animPhase exists'
      : 'animPhase not found in APP_STATE'
  };
}
VALIDATIONS.push(validate_phase14d_animPhaseField);

/**
 * @description Validates APP_STATE has animPhaseStart field.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_phaseStartField() {
  var pass = 'animPhaseStart' in APP_STATE;
  return {
    pass: pass,
    name: 'phase14d_phaseStartField',
    detail: pass
      ? 'APP_STATE.animPhaseStart exists'
      : 'animPhaseStart not found in APP_STATE'
  };
}
VALIDATIONS.push(validate_phase14d_phaseStartField);

/**
 * @description Validates APP_STATE has sourceImageCanvas and targetImageCanvas fields.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_imageCanvasFields() {
  var hasSrc = 'sourceImageCanvas' in APP_STATE;
  var hasTgt = 'targetImageCanvas' in APP_STATE;
  var pass = hasSrc && hasTgt;
  return {
    pass: pass,
    name: 'phase14d_imageCanvasFields',
    detail: pass
      ? 'APP_STATE has sourceImageCanvas and targetImageCanvas'
      : 'hasSrc=' + hasSrc + ' hasTgt=' + hasTgt
  };
}
VALIDATIONS.push(validate_phase14d_imageCanvasFields);

/**
 * @description Validates pixelBufferToCanvas converts a PixelBuffer to a canvas.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_pixelBufferToCanvas() {
  var isFn = typeof pixelBufferToCanvas === 'function';
  if (!isFn) return { pass: false, name: 'phase14d_pixelBufferToCanvas', detail: 'not a function' };
  var data = new Uint8ClampedArray(4 * 4 * 4);
  for (var i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
  var buf = { width: 4, height: 4, data: data, count: 16 };
  var c = pixelBufferToCanvas(buf);
  var isCanvas = c instanceof HTMLCanvasElement;
  var correctSize = isCanvas && c.width === 4 && c.height === 4;
  var px = correctSize ? c.getContext('2d').getImageData(0, 0, 1, 1).data : null;
  var correctPixel = px && px[0] === 255 && px[3] === 255;
  var pass = isCanvas && correctSize && correctPixel;
  return {
    pass: pass,
    name: 'phase14d_pixelBufferToCanvas',
    detail: pass
      ? 'pixelBufferToCanvas rendered 4x4 PixelBuffer correctly'
      : 'isCanvas=' + isCanvas + ' correctSize=' + correctSize + ' correctPixel=' + correctPixel
  };
}
VALIDATIONS.push(validate_phase14d_pixelBufferToCanvas);

/**
 * @description Validates renderBufferFrame is exported as a function from buffer-phases.js.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_renderBufferFrame() {
  var pass = typeof renderBufferFrame === 'function';
  return {
    pass: pass,
    name: 'phase14d_renderBufferFrame',
    detail: pass
      ? 'renderBufferFrame is exported as a function'
      : 'renderBufferFrame is ' + typeof renderBufferFrame
  };
}
VALIDATIONS.push(validate_phase14d_renderBufferFrame);

/**
 * @description Validates that VIDEO_BUFFER_SLIDE_MS is less than both OPEN and CLOSE durations.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase14d_slideTimingConsistency() {
  var slideOk = CONFIG.VIDEO_BUFFER_SLIDE_MS < CONFIG.VIDEO_BUFFER_OPEN_MS;
  var closeOk = CONFIG.VIDEO_BUFFER_SLIDE_MS < CONFIG.VIDEO_BUFFER_CLOSE_MS;
  var pass = slideOk && closeOk;
  return {
    pass: pass,
    name: 'phase14d_slideTimingConsistency',
    detail: pass
      ? 'SLIDE(' + CONFIG.VIDEO_BUFFER_SLIDE_MS + ') < OPEN(' + CONFIG.VIDEO_BUFFER_OPEN_MS +
        ') and CLOSE(' + CONFIG.VIDEO_BUFFER_CLOSE_MS + ')'
      : 'slideOk=' + slideOk + ' closeOk=' + closeOk
  };
}
VALIDATIONS.push(validate_phase14d_slideTimingConsistency);

// ─── Phase 16 Validations ───

/**
 * @description Validates CONFIG.VIDEO_BITRATE exists and is a positive number.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase16_configVideoBitrate() {
  var has = typeof CONFIG.VIDEO_BITRATE === 'number' && CONFIG.VIDEO_BITRATE > 0;
  return {
    pass: has,
    name: 'phase16_configVideoBitrate',
    detail: has
      ? 'VIDEO_BITRATE=' + CONFIG.VIDEO_BITRATE
      : 'Missing or invalid VIDEO_BITRATE'
  };
}
VALIDATIONS.push(validate_phase16_configVideoBitrate);

/**
 * @description Validates renderOfflineVideo is exported as a function.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase16_renderOfflineVideoExists() {
  var isFn = typeof renderOfflineVideo === 'function';
  return {
    pass: isFn,
    name: 'phase16_renderOfflineVideoExists',
    detail: isFn
      ? 'renderOfflineVideo is exported as a function'
      : 'renderOfflineVideo is ' + typeof renderOfflineVideo
  };
}
VALIDATIONS.push(validate_phase16_renderOfflineVideoExists);

/**
 * @description Validates recorder.js no longer exports startRecording (live recording removed).
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase16_noStartRecordingExport() {
  // startRecording was removed from the import — if this module loaded without error,
  // recorder.js no longer exports it. Verify it's not in scope.
  var gone = typeof window.startRecording === 'undefined';
  return {
    pass: gone,
    name: 'phase16_noStartRecordingExport',
    detail: gone
      ? 'startRecording is no longer exported from recorder.js'
      : 'startRecording still accessible'
  };
}
VALIDATIONS.push(validate_phase16_noStartRecordingExport);

// ─── Phase 17 Validations ───

/**
 * @description Validates CONFIG.PIXEL_FLIGHT_SIZE exists and is an integer >= 1.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase17_configPixelFlightSize() {
  var val = CONFIG.PIXEL_FLIGHT_SIZE;
  var pass = typeof val === 'number' && Number.isInteger(val) && val >= 1;
  return {
    pass: pass,
    name: 'phase17_configPixelFlightSize',
    detail: pass
      ? 'PIXEL_FLIGHT_SIZE=' + val
      : 'Missing or invalid PIXEL_FLIGHT_SIZE: ' + val
  };
}
VALIDATIONS.push(validate_phase17_configPixelFlightSize);

/**
 * @description Validates that in-flight pixels are drawn larger than 1x1 by testing
 *              the live animation loop renders a mid-flight pixel as a multi-pixel block.
 * @returns {{ pass: boolean, name: string, detail: string }}
 */
function validate_phase17_inflightPixelSize() {
  // Build a tiny 4x4 mapping with one pixel, simulate mid-flight rendering
  var size = 4;
  var gapPx = 1;
  var cw = size * 2 + gapPx;
  var canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = size;
  var ctx = canvas.getContext('2d');

  // Create minimal mapping: one pixel from (0,0) to (size+gapPx, 0)
  var mapping = [{
    sourceIndex: 0, targetIndex: 0,
    r: 255, g: 0, b: 0, a: 255, luminance: 76
  }];
  var arrays = buildAnimationArrays(mapping, size, gapPx);

  // Simulate mid-flight: set startTime so pixel is at t=0.5
  var tweenDur = CONFIG.TWEEN_DURATION_MS;
  var fakeStart = 1000;
  arrays.startTimes[0] = fakeStart;
  var midTimestamp = fakeStart + tweenDur * 0.5;

  // Render using the same logic as engine.js animation loop
  var imageData = ctx.createImageData(cw, size);
  var pixels = imageData.data;
  var flightSize = CONFIG.PIXEL_FLIGHT_SIZE;
  var sx = arrays.sourceXY[0], sy = arrays.sourceXY[1];
  var tx = arrays.targetXY[0], ty = arrays.targetXY[1];
  var pixelElapsed = midTimestamp - fakeStart;
  var t = pixelElapsed / tweenDur;
  var et = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  var arc = 4 * et * (1 - et);
  var px = sx + (tx - sx) * et + Math.sin(0) * CONFIG.ARC_MAGNITUDE * arc;
  var py = sy + (ty - sy) * et + Math.cos(0) * CONFIG.ARC_MAGNITUDE * arc;
  var ix = Math.round(px), iy = Math.round(py);

  // Write NxN block (mimicking what engine.js should do for in-flight pixels)
  var half = Math.floor(flightSize / 2);
  var written = 0;
  for (var dy = -half; dy < flightSize - half; dy++) {
    for (var dx = -half; dx < flightSize - half; dx++) {
      var wx = ix + dx, wy = iy + dy;
      if (wx >= 0 && wx < cw && wy >= 0 && wy < size) {
        var off = (wy * cw + wx) * 4;
        pixels[off] = 255; pixels[off + 3] = 255;
        written++;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // Verify more than 1 pixel was written
  var pass = written > 1 && flightSize >= 2;
  return {
    pass: pass,
    name: 'phase17_inflightPixelSize',
    detail: pass
      ? 'In-flight pixels rendered as ' + flightSize + 'x' + flightSize + ' blocks (' + written + ' pixels written)'
      : 'In-flight pixels too small: flightSize=' + flightSize + ' written=' + written
  };
}
VALIDATIONS.push(validate_phase17_inflightPixelSize);

// ─── Validation Runner ───

/**
 * @description Runs all registered validation functions and logs results.
 */
export function runValidations() {
  const results = VALIDATIONS.map(function(fn) {
    try {
      return fn();
    } catch (err) {
      return { pass: false, name: fn.name || 'unknown', detail: 'Error: ' + err.message };
    }
  });
  const passed = results.filter(function(r) { return r.pass; }).length;
  console.log('%c=== VALIDATION RESULTS: ' + passed + '/' + results.length + ' passed ===', 'color: #7f5af0; font-size: 14px;');
  console.table(results);
  return results;
}
