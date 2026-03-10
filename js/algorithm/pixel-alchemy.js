'use strict';

import { calcLuminance, calcHue, pixelSortComparator } from '../utils.js';

// ═══════════════════════════════════════════
// PIXEL ALCHEMY — LUMINANCE, HUE, MAPPING
// ═══════════════════════════════════════════

/**
 * @description Builds pixel descriptors from a PixelBuffer.
 * @param {{ data: Uint8ClampedArray, count: number }} buffer
 * @returns {Array<{ index: number, r: number, g: number, b: number, a: number, luminance: number, hue: number }>}
 */
export function buildPixelDescriptors(buffer) {
  const descriptors = new Array(buffer.count);
  const data = buffer.data;
  for (let i = 0; i < buffer.count; i++) {
    const off = i * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const a = data[off + 3];
    descriptors[i] = {
      index: i,
      r: r,
      g: g,
      b: b,
      a: a,
      luminance: calcLuminance(r, g, b),
      hue: calcHue(r, g, b)
    };
  }
  return descriptors;
}

/**
 * @description Builds the pixel mapping from source to target via luminance+hue sort.
 * @param {{ data: Uint8ClampedArray, count: number, width: number, height: number }} srcBuf
 * @param {{ data: Uint8ClampedArray, count: number, width: number, height: number }} tgtBuf
 * @returns {Array<{ sourceIndex: number, targetIndex: number, r: number, g: number, b: number, a: number, luminance: number }>}
 */
export function buildMapping(srcBuf, tgtBuf) {
  const srcDesc = buildPixelDescriptors(srcBuf);
  const tgtDesc = buildPixelDescriptors(tgtBuf);

  srcDesc.sort(pixelSortComparator);
  tgtDesc.sort(pixelSortComparator);

  const mapping = new Array(srcBuf.count);
  for (let i = 0; i < srcBuf.count; i++) {
    mapping[i] = {
      sourceIndex: srcDesc[i].index,
      targetIndex: tgtDesc[i].index,
      r: srcDesc[i].r,
      g: srcDesc[i].g,
      b: srcDesc[i].b,
      a: srcDesc[i].a,
      luminance: srcDesc[i].luminance
    };
  }
  return mapping;
}
